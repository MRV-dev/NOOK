const express = require("express");
const {
  getMyConversations,
  createConversation,
  addParticipants,
  updateGroupName,
  hideConversation,
  leaveGroupConversation,
  removeGroupParticipant,
} = require("../Controllers/conversationController");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Protected conversation routes
router.get("/", requireAuth, getMyConversations);
router.post("/", requireAuth, createConversation);
router.delete("/:conversationId", requireAuth, hideConversation);
router.delete(
  "/:conversationId/participants/:participantId",
  requireAuth,
  removeGroupParticipant,
);
router.post("/:conversationId/leave", requireAuth, leaveGroupConversation);
router.post("/:conversationId/participants", requireAuth, addParticipants);
router.patch("/:conversationId", requireAuth, updateGroupName);

module.exports = router;
