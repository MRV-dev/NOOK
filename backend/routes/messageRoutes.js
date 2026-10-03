const express = require("express");
const {
  getConversationMessages,
  createMessage,
} = require("../Controllers/messageController");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Protected message routes
router.get("/:conversationId/messages", requireAuth, getConversationMessages);
router.post("/:conversationId/messages", requireAuth, createMessage);

module.exports = router;