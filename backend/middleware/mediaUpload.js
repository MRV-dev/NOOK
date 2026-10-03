const multer = require("multer");

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, callback) => {
    callback(null, allowedMimeTypes.has(file.mimetype));
  },
});

const uploadMedia = (req, res, next) => {
  upload.array("media", 8)(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Each image or video must be 25 MB or smaller"
        : error.code === "LIMIT_FILE_COUNT"
          ? "You can attach up to 8 files per message"
          : "Could not upload media";
      return res.status(400).json({ message });
    }
    if (error) return next(error);
    return next();
  });
};

module.exports = { uploadMedia };