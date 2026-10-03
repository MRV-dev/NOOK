const express = require("express");
const {
  getConversationMessages,
  downloadReceivedImage,
  createMessage,
  createMediaMessage,
  ensureConversationMember,
} = require("../Controllers/messageController");
const requireAuth = require("../middleware/auth");
const { uploadMedia } = require("../middleware/mediaUpload");

const router = express.Router();

// Protected message routes
router.get("/:conversationId/messages", requireAuth, getConversationMessages);
router.get(
  "/:conversationId/messages/:messageId/media/:mediaIndex/download",
  requireAuth,
  downloadReceivedImage,
);
router.post(
  "/:conversationId/messages/media",
  requireAuth,
  ensureConversationMember,
  uploadMedia,
  createMediaMessage,
);
router.post("/:conversationId/messages", requireAuth, createMessage);

module.exports = router;