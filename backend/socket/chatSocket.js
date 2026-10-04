const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const User = require("../models/user.model");
const { createMessageForUser } = require("../services/messageService");
const { scheduleIncomingMessageEmail } = require("../services/emailService");
const { deleteMediaAsset } = require("../services/cloudinaryService");

const conversationRoom = (conversationId) => `conversation:${conversationId}`;
const reactionEmojis = new Set(["❤️", "😂", "😮", "😢", "👍", "🔥"]);

const attachChatSockets = (io) => {
  const onlineUsers = new Map();
  const activeCalls = new Map();
  const persistCallMessage = async (
    conversationId,
    activeCall,
    actorId,
    status,
  ) => {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      type: "direct",
      participants: actorId,
    }).select("participants");
    if (!conversation) return;

    const durationSeconds = activeCall.acceptedAt
      ? Math.floor((Date.now() - activeCall.acceptedAt) / 1000)
      : 0;
    const message = await Message.create({
      conversation: conversationId,
      sender: actorId,
      kind: "call",
      content: "Video call",
      callEvent: { status, durationSeconds },
      readBy: [actorId],
    });
    conversation.lastMessage = message._id;
    conversation.hiddenFor = [];
    await conversation.save();
    await message.populate("sender", "username avatarUrl");

    io.to(conversationRoom(conversationId)).emit("message:new", message);
    conversation.participants
      .map((participantId) => participantId.toString())
      .filter((participantId) => participantId !== actorId)
      .forEach((participantId) => {
        io.to(`user:${participantId}`).emit("message:notification", {
          conversationId,
          sender: message.sender,
          content: message.content,
        });
      });
  };

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      return next(new Error("Authentication required"));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub).select(
        "_id username avatarUrl",
      );
      if (!user) {
        return next(new Error("Invalid authentication token"));
      }

      socket.data.user = {
        id: user._id.toString(),
        username: user.username,
        avatarUrl: user.avatarUrl,
      };
      return next();
    } catch {
      return next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    const existingSockets = onlineUsers.get(user.id);
    const wasOnline = Boolean(existingSockets?.size);
    const userSockets = existingSockets || new Set();
    userSockets.add(socket.id);
    onlineUsers.set(user.id, userSockets);

    socket.join(`user:${user.id}`);
    socket.emit("presence:list", [...onlineUsers.keys()]);
    if (!wasOnline) {
      socket.broadcast.emit("presence:online", { userId: user.id });
    }

    socket.on("conversation:join", async (payload = {}, acknowledge) => {
      const conversationId = payload.conversationId;
      if (!mongoose.isValidObjectId(conversationId)) {
        return acknowledge?.({ ok: false, message: "Invalid conversation ID" });
      }

      try {
        const conversation = await Conversation.exists({
          _id: conversationId,
          participants: user.id,
        });
        if (!conversation) {
          return acknowledge?.({
            ok: false,
            message: "Conversation not found",
          });
        }

        socket.join(conversationRoom(conversationId));
        return acknowledge?.({ ok: true, conversationId });
      } catch {
        return acknowledge?.({
          ok: false,
          message: "Could not join conversation",
        });
      }
    });

    socket.on("call:offer", async (payload = {}, acknowledge) => {
      const { conversationId, callId, offer } = payload;
      if (
        !mongoose.isValidObjectId(conversationId) ||
        typeof callId !== "string" ||
        !callId ||
        typeof offer?.sdp !== "string" ||
        offer.sdp.length > 100000
      ) {
        return acknowledge?.({ ok: false, message: "Invalid call offer" });
      }

      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          type: "direct",
          participants: user.id,
        }).select("participants");
        if (!conversation) {
          return acknowledge?.({ ok: false, message: "Direct chat not found" });
        }

        const recipientId = conversation.participants
          .map((participantId) => participantId.toString())
          .find((participantId) => participantId !== user.id);
        if (!recipientId || !onlineUsers.get(recipientId)?.size) {
          return acknowledge?.({ ok: false, message: "User is offline" });
        }
        if (activeCalls.has(conversationId)) {
          return acknowledge?.({ ok: false, message: "This chat is busy" });
        }

        activeCalls.set(conversationId, {
          callId,
          callerId: user.id,
          recipientId,
          callerSocketId: socket.id,
          recipientSocketId: null,
          acceptedAt: null,
        });
        io.to(`user:${recipientId}`).emit("call:incoming", {
          conversationId,
          callId,
          caller: { id: user.id, username: user.username },
          offer,
        });
        return acknowledge?.({ ok: true });
      } catch {
        return acknowledge?.({ ok: false, message: "Could not start call" });
      }
    });

    socket.on("call:answer", (payload = {}, acknowledge) => {
      const { conversationId, callId, answer } = payload;
      const activeCall = activeCalls.get(conversationId);
      if (
        !activeCall ||
        activeCall.callId !== callId ||
        activeCall.recipientId !== user.id ||
        typeof answer?.sdp !== "string" ||
        answer.sdp.length > 100000
      ) {
        return acknowledge?.({ ok: false, message: "Call is no longer active" });
      }

      activeCall.recipientSocketId = socket.id;
      activeCall.acceptedAt = Date.now();
      io.to(`user:${activeCall.callerId}`).emit("call:answer", {
        conversationId,
        callId,
        answer,
      });
      return acknowledge?.({ ok: true });
    });

    socket.on("call:ice", (payload = {}, acknowledge) => {
      const { conversationId, callId, candidate } = payload;
      const activeCall = activeCalls.get(conversationId);
      if (
        !activeCall ||
        activeCall.callId !== callId ||
        ![activeCall.callerId, activeCall.recipientId].includes(user.id) ||
        !candidate ||
        typeof candidate !== "object"
      ) {
        return acknowledge?.({ ok: false, message: "Call is no longer active" });
      }

      const recipientId =
        user.id === activeCall.callerId
          ? activeCall.recipientId
          : activeCall.callerId;
      io.to(`user:${recipientId}`).emit("call:ice", {
        conversationId,
        callId,
        candidate,
      });
      return acknowledge?.({ ok: true });
    });

    socket.on("call:reject", async (payload = {}, acknowledge) => {
      const { conversationId, callId } = payload;
      const activeCall = activeCalls.get(conversationId);
      if (
        !activeCall ||
        activeCall.callId !== callId ||
        activeCall.recipientId !== user.id
      ) {
        return acknowledge?.({ ok: false, message: "Call is no longer active" });
      }

      activeCalls.delete(conversationId);
      try {
        await persistCallMessage(
          conversationId,
          activeCall,
          user.id,
          "declined",
        );
      } catch (error) {
        console.error("Could not save call history:", error.message);
      }
      io.to(`user:${activeCall.callerId}`).emit("call:rejected", {
        conversationId,
        callId,
      });
      return acknowledge?.({ ok: true });
    });

    socket.on("call:end", async (payload = {}, acknowledge) => {
      const { conversationId, callId } = payload;
      const activeCall = activeCalls.get(conversationId);
      if (
        !activeCall ||
        activeCall.callId !== callId ||
        ![activeCall.callerId, activeCall.recipientId].includes(user.id)
      ) {
        return acknowledge?.({ ok: false, message: "Call is no longer active" });
      }

      activeCalls.delete(conversationId);
      const status = activeCall.acceptedAt
        ? "completed"
        : user.id === activeCall.callerId
          ? "cancelled"
          : "missed";
      try {
        await persistCallMessage(conversationId, activeCall, user.id, status);
      } catch (error) {
        console.error("Could not save call history:", error.message);
      }
      const recipientId =
        user.id === activeCall.callerId
          ? activeCall.recipientId
          : activeCall.callerId;
      io.to(`user:${recipientId}`).emit("call:ended", {
        conversationId,
        callId,
      });
      return acknowledge?.({ ok: true });
    });

    socket.on("conversation:read", async (payload = {}, acknowledge) => {
      const conversationId = payload.conversationId;
      const room = conversationRoom(conversationId);

      if (
        !mongoose.isValidObjectId(conversationId) ||
        !socket.rooms.has(room)
      ) {
        return acknowledge?.({
          ok: false,
          message: "Join the conversation first",
        });
      }

      try {
        await Message.updateMany(
          { conversation: conversationId, readBy: { $ne: user.id } },
          { $addToSet: { readBy: user.id } },
        );
        return acknowledge?.({ ok: true });
      } catch {
        return acknowledge?.({
          ok: false,
          message: "Could not update read status",
        });
      }
    });

    socket.on("message:delete", async (payload = {}, acknowledge) => {
      const conversationId = payload.conversationId;
      const messageId = payload.messageId;
      const room = conversationRoom(conversationId);

      if (
        !mongoose.isValidObjectId(conversationId) ||
        !mongoose.isValidObjectId(messageId) ||
        !socket.rooms.has(room)
      ) {
        return acknowledge?.({
          ok: false,
          message: "Join the conversation first",
        });
      }

      try {
        const existingMessage = await Message.findOne({
          _id: messageId,
          conversation: conversationId,
          sender: user.id,
          isDeleted: { $ne: true },
        }).select("mediaPublicId mediaType media");
        if (!existingMessage) {
          return acknowledge?.({
            ok: false,
            message: "Message not found or you cannot delete it",
          });
        }

        const deletedAt = new Date();
        const message = await Message.findOneAndUpdate(
          {
            _id: messageId,
            conversation: conversationId,
            sender: user.id,
            isDeleted: { $ne: true },
          },
          { $set: { content: "Message deleted", isDeleted: true, deletedAt } },
          { new: true },
        );

        if (!message) {
          return acknowledge?.({
            ok: false,
            message: "Message not found or you cannot delete it",
          });
        }

        const cloudinaryAssets = (existingMessage.media || [])
          .filter((asset) => asset.publicId && asset.type)
          .map((asset) => ({
            publicId: asset.publicId,
            mediaType: asset.type,
          }));
        if (existingMessage.mediaPublicId && existingMessage.mediaType) {
          cloudinaryAssets.push({
            publicId: existingMessage.mediaPublicId,
            mediaType: existingMessage.mediaType,
          });
        }
        cloudinaryAssets.forEach(({ publicId, mediaType }) => {
          deleteMediaAsset({ publicId, mediaType }).catch((error) => {
            console.error("Could not delete Cloudinary media:", error.message);
          });
        });

        io.to(room).emit("message:deleted", {
          conversationId,
          messageId: message._id.toString(),
          content: message.content,
          isDeleted: message.isDeleted,
          deletedAt: message.deletedAt,
        });
        return acknowledge?.({ ok: true });
      } catch {
        return acknowledge?.({
          ok: false,
          message: "Could not delete message",
        });
      }
    });

    socket.on("message:react", async (payload = {}, acknowledge) => {
      const { conversationId, messageId, emoji } = payload;
      const room = conversationRoom(conversationId);

      if (
        !mongoose.isValidObjectId(conversationId) ||
        !mongoose.isValidObjectId(messageId) ||
        !reactionEmojis.has(emoji) ||
        !socket.rooms.has(room)
      ) {
        return acknowledge?.({
          ok: false,
          message: "Invalid reaction request",
        });
      }

      try {
        const message = await Message.findOne({
          _id: messageId,
          conversation: conversationId,
          sender: { $ne: user.id },
          kind: { $nin: ["system", "call"] },
          isDeleted: { $ne: true },
        });
        if (!message) {
          return acknowledge?.({
            ok: false,
            message: "Message not found or you cannot react to it",
          });
        }

        const existingReaction = message.reactions.find(
          (reaction) => reaction.user.toString() === user.id,
        );
        if (existingReaction?.emoji === emoji) {
          message.reactions = message.reactions.filter(
            (reaction) => reaction.user.toString() !== user.id,
          );
        } else {
          message.reactions = [
            ...message.reactions.filter(
              (reaction) => reaction.user.toString() !== user.id,
            ),
            { user: user.id, emoji },
          ];
        }

        await message.save();
        await message.populate("reactions.user", "username avatarUrl");
        io.to(room).emit("message:reactions", {
          conversationId,
          messageId,
          reactions: message.reactions,
        });
        return acknowledge?.({ ok: true });
      } catch {
        return acknowledge?.({
          ok: false,
          message: "Could not update reaction",
        });
      }
    });

    socket.on("message:send", async (payload = {}, acknowledge) => {
      const conversationId = payload.conversationId;
      const content =
        typeof payload.content === "string" ? payload.content.trim() : "";
      const room = conversationRoom(conversationId);

      if (!mongoose.isValidObjectId(conversationId)) {
        return acknowledge?.({ ok: false, message: "Invalid conversation ID" });
      }
      if (!content || content.length > 10000) {
        return acknowledge?.({
          ok: false,
          message: "Message content must be between 1 and 10000 characters",
        });
      }
      if (!socket.rooms.has(room)) {
        return acknowledge?.({
          ok: false,
          message: "Join the conversation before sending messages",
        });
      }

      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: user.id,
        }).select("participants type name");
        if (!conversation) {
          return acknowledge?.({
            ok: false,
            message: "Conversation not found",
          });
        }

        const message = await createMessageForUser({
          conversationId,
          senderId: user.id,
          content,
        });
        if (!message) {
          socket.leave(room);
          return acknowledge?.({
            ok: false,
            message: "Conversation not found",
          });
        }

        socket.to(room).emit("message:new", message);

        const recipientIds = conversation.participants
          .map((participantId) => participantId.toString())
          .filter((participantId) => participantId !== user.id);

        recipientIds.forEach((participantUserId) => {
          io.to(`user:${participantUserId}`).emit("message:notification", {
            conversationId,
            sender: message.sender,
            content: message.content,
          });
        });

        if (recipientIds.length) {
          scheduleIncomingMessageEmail({
            messageId: message._id,
            senderName: message.sender?.username || user.username,
            recipientIds,
            content: message.content,
            conversationName:
              conversation.type === "group" ? conversation.name : "",
          });
        }

        return acknowledge?.({ ok: true, message });
      } catch {
        return acknowledge?.({ ok: false, message: "Could not send message" });
      }
    });

    socket.on("typing:set", (payload = {}, acknowledge) => {
      const conversationId = payload.conversationId;
      const isTyping = payload.isTyping === true;
      const room = conversationRoom(conversationId);

      if (
        !mongoose.isValidObjectId(conversationId) ||
        !socket.rooms.has(room)
      ) {
        return acknowledge?.({
          ok: false,
          message: "Join the conversation first",
        });
      }

      socket.to(room).emit("typing:update", {
        conversationId,
        user: { id: user.id, username: user.username },
        isTyping,
      });
      return acknowledge?.({ ok: true });
    });

    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(user.id);
      sockets?.delete(socket.id);
      if (sockets?.size) {
        return;
      }

      onlineUsers.delete(user.id);
      activeCalls.forEach((activeCall, conversationId) => {
        if (![activeCall.callerId, activeCall.recipientId].includes(user.id)) {
          return;
        }
        activeCalls.delete(conversationId);
        const status = activeCall.acceptedAt ? "completed" : "missed";
        persistCallMessage(conversationId, activeCall, user.id, status).catch(
          (error) => {
            console.error("Could not save call history:", error.message);
          },
        );
        const recipientId =
          user.id === activeCall.callerId
            ? activeCall.recipientId
            : activeCall.callerId;
        io.to(`user:${recipientId}`).emit("call:ended", {
          conversationId,
          callId: activeCall.callId,
        });
      });
      const lastSeenAt = new Date();
      User.findByIdAndUpdate(user.id, { lastSeenAt }).catch((error) => {
        console.error("Could not update last-seen time:", error.message);
      });
      socket.broadcast.emit("presence:offline", {
        userId: user.id,
        lastSeenAt,
      });
    });
  });

  return io;
};

module.exports = attachChatSockets;
