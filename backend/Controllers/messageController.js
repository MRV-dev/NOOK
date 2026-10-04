const mongoose = require("mongoose");
const fs = require("node:fs/promises");
const path = require("node:path");
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const { createMessageForUser } = require("../services/messageService");
const { scheduleIncomingMessageEmail } = require("../services/emailService");
const {
  isCloudinaryConfigured,
  uploadMediaBuffer,
  deleteMediaAsset,
} = require("../services/cloudinaryService");

const deleteUploadedAssets = async (assets) => {
  await Promise.allSettled(
    assets.map(({ publicId, type }) =>
      deleteMediaAsset({ publicId, mediaType: type }),
    ),
  );
};

const ensureConversationMember = async (req, res, next) => {
  const userId = req.user?._id;
  const { conversationId } = req.params;

  if (!mongoose.isValidObjectId(conversationId)) {
    return res.status(400).json({ message: "Invalid conversation ID" });
  }

  try {
    const isMember = await Conversation.exists({
      _id: conversationId,
      participants: userId,
    });
    if (!isMember) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const getConversationMessages = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { conversationId } = req.params;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(requestedLimit)
      ? 50
      : Math.min(Math.max(requestedLimit, 1), 100);
    const filter = { conversation: conversationId };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ message: "Invalid before timestamp" });
      }
      filter.createdAt = { $lt: before };
    }

    const messages = await Message.find(filter)
      .populate("sender", "username avatarUrl")
      .populate("systemEvent.members", "username avatarUrl")
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json(messages.reverse());
  } catch (error) {
    return next(error);
  }
};

const downloadReceivedImage = async (req, res, next) => {
  try {
    const { conversationId, messageId, mediaIndex: rawMediaIndex } = req.params;
    const userId = req.user?._id;
    const mediaIndex = Number.parseInt(rawMediaIndex, 10);

    if (
      !mongoose.isValidObjectId(conversationId) ||
      !mongoose.isValidObjectId(messageId) ||
      !Number.isInteger(mediaIndex) ||
      mediaIndex < 0 ||
      mediaIndex > 7
    ) {
      return res
        .status(400)
        .json({ message: "Invalid image download request" });
    }

    const isMember = await Conversation.exists({
      _id: conversationId,
      participants: userId,
    });
    if (!isMember) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
      isDeleted: { $ne: true },
    }).select("media mediaUrl mediaType");
    if (!message) {
      return res.status(404).json({ message: "Image not found" });
    }

    const attachment = message.media?.length
      ? message.media[mediaIndex]
      : mediaIndex === 0 && message.mediaUrl
        ? { url: message.mediaUrl, type: message.mediaType }
        : null;
    if (!attachment || !["image", "video"].includes(attachment.type)) {
      return res.status(404).json({ message: "Media not found" });
    }

    const contentTypesByExtension = new Map([
      [".jpg", "image/jpeg"],
      [".jpeg", "image/jpeg"],
      [".png", "image/png"],
      [".gif", "image/gif"],
      [".webp", "image/webp"],
      [".avif", "image/avif"],
      [".mp4", "video/mp4"],
      [".webm", "video/webm"],
      [".mov", "video/quicktime"],
    ]);
    const allowedExtensions = new Set(contentTypesByExtension.keys());
    let imageBuffer;
    let contentType;
    let requestedExtension;

    if (attachment.url.startsWith("/uploads/")) {
      const legacyFilename = path.basename(attachment.url);
      requestedExtension = path.extname(legacyFilename).toLowerCase();
      contentType = contentTypesByExtension.get(requestedExtension);
      if (
        !contentType ||
        !allowedExtensions.has(requestedExtension) ||
        !contentType.startsWith(`${attachment.type}/`)
      ) {
        return res
          .status(400)
          .json({ message: "Media format is not supported" });
      }

      const legacyUploadDirectory = path.resolve(__dirname, "..", "uploads");
      try {
        imageBuffer = await fs.readFile(
          path.join(legacyUploadDirectory, legacyFilename),
        );
      } catch (error) {
        if (error.code === "ENOENT") {
          return res
            .status(404)
            .json({ message: "Image file is no longer available" });
        }
        throw error;
      }
    } else {
      const imageUrl = new URL(attachment.url);
      if (
        imageUrl.protocol !== "https:" ||
        imageUrl.hostname !== "res.cloudinary.com"
      ) {
        return res.status(400).json({ message: "Image URL is not supported" });
      }

      const imageResponse = await fetch(imageUrl, {
        signal: AbortSignal.timeout(30000),
      });
      if (!imageResponse.ok) {
        return res
          .status(502)
          .json({ message: "Could not retrieve media from Cloudinary" });
      }

      contentType = imageResponse.headers.get("content-type") || "";
      if (!contentType.startsWith(`${attachment.type}/`)) {
        return res
          .status(502)
          .json({ message: "Cloudinary returned invalid media" });
      }

      requestedExtension = path.extname(imageUrl.pathname).toLowerCase();
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    }

    const extension = allowedExtensions.has(requestedExtension)
      ? requestedExtension
      : [...contentTypesByExtension.entries()].find(
          ([, candidateType]) => candidateType === contentType,
        )?.[0] || ".img";
    const filename = `chat-${attachment.type}-${messageId}-${mediaIndex + 1}${extension}`;

    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": imageBuffer.length,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(imageBuffer);
  } catch (error) {
    return next(error);
  }
};

const createMessage = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { conversationId } = req.params;
    const content =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }
    if (!content || content.length > 10000) {
      return res
        .status(400)
        .json({
          message: "Message content must be between 1 and 10000 characters",
        });
    }

    const message = await createMessageForUser({
      conversationId,
      senderId: userId,
      content,
    });
    if (!message) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    req.app
      .get("io")
      ?.to(`conversation:${conversationId}`)
      .emit("message:new", message);
    return res.status(201).json(message);
  } catch (error) {
    return next(error);
  }
};

const createMediaMessage = async (req, res, next) => {
  const userId = req.user?._id;
  const { conversationId } = req.params;
  const content =
    typeof req.body?.content === "string" ? req.body.content.trim() : "";
  const files = req.files || [];

  if (!files.length) {
    return res
      .status(400)
      .json({ message: "Choose at least one supported image or video" });
  }
  if (!isCloudinaryConfigured()) {
    return res
      .status(503)
      .json({ message: "Cloudinary media storage is not configured" });
  }
  if (content.length > 10000) {
    return res
      .status(400)
      .json({ message: "Caption must be 10000 characters or fewer" });
  }

  const uploadedAssets = [];
  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    }).select("participants type name");
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    for (const file of files) {
      const type = file.mimetype.startsWith("video/") ? "video" : "image";
      const asset = await uploadMediaBuffer(file.buffer, type);
      if (!asset?.secure_url || !asset?.public_id) {
        throw new Error("Cloudinary did not return a media URL");
      }
      uploadedAssets.push({
        url: asset.secure_url,
        publicId: asset.public_id,
        type,
      });
    }

    const message = await createMessageForUser({
      conversationId,
      senderId: userId,
      content,
      media: uploadedAssets,
    });
    if (!message) {
      await deleteUploadedAssets(uploadedAssets);
      return res.status(404).json({ message: "Conversation not found" });
    }

    const io = req.app.get("io");
    const preview =
      content ||
      (files.length === 1
        ? `Sent ${uploadedAssets[0].type === "video" ? "a video" : "an image"}`
        : `Sent ${files.length} attachments`);
    io?.to(`conversation:${conversationId}`).emit("message:new", message);

    const recipientIds = conversation.participants
      .map((participantId) => participantId.toString())
      .filter((participantId) => participantId !== userId.toString());
    recipientIds.forEach((recipientId) => {
      io?.to(`user:${recipientId}`).emit("message:notification", {
        conversationId,
        sender: message.sender,
        content: preview,
      });
    });

    if (recipientIds.length) {
      scheduleIncomingMessageEmail({
        messageId: message._id,
        senderName: message.sender?.username || req.user.username,
        recipientIds,
        content: preview,
        conversationName:
          conversation.type === "group" ? conversation.name : "",
      });
    }

    return res.status(201).json(message);
  } catch (error) {
    await deleteUploadedAssets(uploadedAssets);
    return next(error);
  }
};

module.exports = {
  getConversationMessages,
  downloadReceivedImage,
  createMessage,
  createMediaMessage,
  ensureConversationMember,
};
