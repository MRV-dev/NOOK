const mongoose = require("mongoose");
const Conversation = require("../models/conversation.model");
const User = require("../models/user.model");

const getMyConversations = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const conversations = await Conversation.find({ participants: userId })
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
      }).populate("participants", "username avatarUrl");

      if (existingConversation) {
        return res.json(existingConversation);
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

module.exports = { getMyConversations, createConversation };