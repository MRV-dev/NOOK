const express = require("express");
const {
  getMyConversations,
  createConversation,
} = require("../Controllers/conversationController");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Protected conversation routes
router.get("/", requireAuth, getMyConversations);
router.post("/", requireAuth, createConversation);

module.exports = router;