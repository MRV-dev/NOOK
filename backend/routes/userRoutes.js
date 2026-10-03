const express = require("express");
const {
	register,
	login,
	searchUsers,
	getMyProfile,
	updateMyProfile,
} = require("../Controllers/userController");
const requireAuth = require("../middleware/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/search", requireAuth, searchUsers);
router.get("/me", requireAuth, getMyProfile);
router.patch("/me", requireAuth, updateMyProfile);

module.exports = router;