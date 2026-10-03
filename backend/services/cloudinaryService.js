const cloudinary = require("cloudinary").v2;

const configureCloudinary = () => cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured = () => {
  configureCloudinary();
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

const uploadMediaBuffer = (buffer, mediaType) => {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: mediaType,
        folder: process.env.CLOUDINARY_FOLDER || "real-time-chat",
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      },
    );
    uploadStream.end(buffer);
  });
};

const deleteMediaAsset = ({ publicId, mediaType }) => {
  configureCloudinary();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: mediaType,
    invalidate: true,
  });
};

module.exports = { isCloudinaryConfigured, uploadMediaBuffer, deleteMediaAsset };