const mongoose = require("mongoose");
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const { createMessageForUser } = require("../services/messageService");

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
    const limit = Number.isNaN(requestedLimit) ? 50 : Math.min(Math.max(requestedLimit, 1), 100);
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
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json(messages.reverse());
  } catch (error) {
    return next(error);
  }
};

const createMessage = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { conversationId } = req.params;
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }
    if (!content || content.length > 10000) {
      return res.status(400).json({ message: "Message content must be between 1 and 10000 characters" });
    }

    const message = await createMessageForUser({
      conversationId,
      senderId: userId,
      content,
    });
    if (!message) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    req.app.get("io")?.to(`conversation:${conversationId}`).emit("message:new", message);
    return res.status(201).json(message);
  } catch (error) {
    return next(error);
  }
};

module.exports = { getConversationMessages, createMessage };