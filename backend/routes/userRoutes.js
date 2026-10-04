const express = require("express");
const {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  searchUsers,
  getMyProfile,
  updateMyProfile,
} = require("../Controllers/userController");
const requireAuth = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.get("/search", requireAuth, searchUsers);
router.get("/me", requireAuth, getMyProfile);
router.patch("/me", requireAuth, updateMyProfile);

module.exports = router;
