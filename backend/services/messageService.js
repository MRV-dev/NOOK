const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");

const createMessageForUser = async ({ conversationId, senderId, content }) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: senderId,
  });

  if (!conversation) {
    return null;
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: senderId,
    content,
    readBy: [senderId],
  });

  conversation.lastMessage = message._id;
  conversation.hiddenFor = [];
  await conversation.save();

  return message.populate("sender", "username avatarUrl");
};

module.exports = { createMessageForUser };