import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    // Upload the file to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    // console.log("file is uploaded on Cloudinary", uploadResult.url);
    fs.unlinkSync(localFilePath); // Delete the local file after successful upload
    return uploadResult;
  } catch (error) {
    // If an error occurs during upload, delete the local file and return null
    fs.unlinkSync(localFilePath);
    return null;
  }
};

export { uploadOnCloudinary };
