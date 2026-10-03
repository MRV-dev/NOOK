const express = require("express");
const {
  getMyConversations,
  createConversation,
  addParticipants,
  updateGroupName,
} = require("../Controllers/conversationController");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Protected conversation routes
router.get("/", requireAuth, getMyConversations);
router.post("/", requireAuth, createConversation);
router.post("/:conversationId/participants", requireAuth, addParticipants);
router.patch("/:conversationId", requireAuth, updateGroupName);

module.exports = router;