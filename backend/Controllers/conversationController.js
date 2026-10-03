const mongoose = require("mongoose");
const Conversation = require("../models/conversation.model");
const User = require("../models/user.model");

const emitConversationUpdated = (io, conversation) => {
  conversation.participants.forEach((participant) => {
    io?.to(`user:${participant._id}`).emit("conversation:updated", {
      conversationId: conversation._id,
    });
  });
};

const getMyConversations = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const conversations = await Conversation.find({
      participants: userId,
      hiddenFor: { $ne: userId },
    })
      .populate("participants", "username avatarUrl")
      .populate({
        path: "lastMessage",
        select: "content sender createdAt",
        populate: { path: "sender", select: "username avatarUrl" },
      })
      .sort({ updatedAt: -1 });

    return res.json(conversations);
  } catch (error) {
    return next(error);
  }
};

const createConversation = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const body = req.body || {};
    const type = body.type || "direct";
    if (!["direct", "group"].includes(type)) {
      return res.status(400).json({ message: "Conversation type must be direct or group" });
    }

    const requestedParticipants = body.participants;
    if (!Array.isArray(requestedParticipants)) {
      return res.status(400).json({ message: "Participants must be an array of user IDs" });
    }

    const participantIds = [...new Set([...requestedParticipants, userId.toString()])];
    if (
      participantIds.some((participantId) => typeof participantId !== "string" || !mongoose.isValidObjectId(participantId)) ||
      participantIds.length < 2
    ) {
      return res.status(400).json({ message: "A conversation needs at least two valid participants" });
    }

    const existingParticipantCount = await User.countDocuments({ _id: { $in: participantIds } });
    if (existingParticipantCount !== participantIds.length) {
      return res.status(400).json({ message: "One or more participants do not exist" });
    }

    if (type === "group" && !body.name?.trim()) {
      return res.status(400).json({ message: "Group conversations need a name" });
    }

    if (type === "direct") {
      if (participantIds.length !== 2) {
        return res.status(400).json({ message: "A direct conversation must have two participants" });
      }

      const existingConversation = await Conversation.findOne({
        type: "direct",
        participants: { $all: participantIds, $size: participantIds.length },
      });

      if (existingConversation) {
        await Conversation.updateOne(
          { _id: existingConversation._id },
          { $pull: { hiddenFor: userId } },
        );
        const visibleConversation = await Conversation.findById(existingConversation._id)
          .populate("participants", "username avatarUrl");
        return res.json(visibleConversation);
      }
    }

    const conversation = await Conversation.create({
      type,
      participants: participantIds,
      name: type === "group" ? body.name.trim() : "",
    });

    const populatedConversation = await conversation.populate("participants", "username avatarUrl");
    return res.status(201).json(populatedConversation);
  } catch (error) {
    return next(error);
  }
};

const addParticipants = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!mongoose.isValidObjectId(req.params.conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    const requestedParticipants = req.body?.participants;
    if (!Array.isArray(requestedParticipants) || requestedParticipants.length === 0) {
      return res.status(400).json({ message: "Select at least one person to add" });
    }

    const participantIds = [...new Set(requestedParticipants)];
    if (
      participantIds.some(
        (participantId) =>
          typeof participantId !== "string" || !mongoose.isValidObjectId(participantId),
      )
    ) {
      return res.status(400).json({ message: "Participants must be valid user IDs" });
    }

    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      type: "group",
      participants: userId,
    }).select("participants");
    if (!conversation) {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const existingIds = new Set(conversation.participants.map((id) => id.toString()));
    const newParticipantIds = participantIds.filter((id) => !existingIds.has(id));
    if (!newParticipantIds.length) {
      return res.status(400).json({ message: "Those people are already in this group" });
    }

    const existingUserCount = await User.countDocuments({
      _id: { $in: newParticipantIds },
    });
    if (existingUserCount !== newParticipantIds.length) {
      return res.status(400).json({ message: "One or more people do not exist" });
    }

    await Conversation.updateOne(
      { _id: conversation._id, participants: userId },
      { $addToSet: { participants: { $each: newParticipantIds } } },
    );

    const updatedConversation = await Conversation.findById(conversation._id)
      .populate("participants", "username avatarUrl")
      .populate({
        path: "lastMessage",
        select: "content sender createdAt",
        populate: { path: "sender", select: "username avatarUrl" },
      });

    emitConversationUpdated(req.app.get("io"), updatedConversation);

    return res.json(updatedConversation);
  } catch (error) {
    return next(error);
  }
};

const updateGroupName = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!mongoose.isValidObjectId(req.params.conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 60) {
      return res.status(400).json({ message: "Group name must be between 1 and 60 characters" });
    }

    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      type: "group",
      participants: userId,
    });
    if (!conversation) {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    conversation.name = name;
    await conversation.save();

    const updatedConversation = await Conversation.findById(conversation._id)
      .populate("participants", "username avatarUrl")
      .populate({
        path: "lastMessage",
        select: "content sender createdAt",
        populate: { path: "sender", select: "username avatarUrl" },
      });

    emitConversationUpdated(req.app.get("io"), updatedConversation);
    return res.json(updatedConversation);
  } catch (error) {
    return next(error);
  }
};

const hideConversation = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { conversationId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: conversationId, participants: userId },
      { $addToSet: { hiddenFor: userId } },
      { new: true },
    );
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    req.app.get("io")?.to(`user:${userId}`).emit("conversation:hidden", {
      conversationId: conversation._id.toString(),
    });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMyConversations,
  createConversation,
  addParticipants,
  updateGroupName,
  hideConversation,
};