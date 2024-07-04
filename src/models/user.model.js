import mongoose, { Schema } from "mongoose";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    avatar: {
      type: String, // cloudinary url
    },
    coverImage: {
      type: String, // cloudinary url
    },
    watchHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    password: {
      type: String,
      required: [true, "Password is Required!!"],
    },
    refreshToken: {
      type: String,
    },
  },
  { timestamps: true }
);

// Pre-save hook to hash the password before saving the user
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcryptjs.hash(this.password, 10); // Hash the password with a salt rounds value of 10
  next(); // Call next() to proceed with the save operation
});

// Method to check if the provided password matches the hashed password
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcryptjs.compare(password, this.password);
};

// Create a JSON Web Token (JWT) for access
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      // Payload: the data to include in the token
      _id: this._id,
      email: this.email,
      username: this.username,
      fullName: this.fullName,
    },
    process.env.ACCESS_TOKEN_SECRET, // Secret key for signing the token
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY, // Token expiration time
    }
  );
};

// Create a Refresh JSON Web Token (JWT)
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

export const User = mongoose.model("User", userSchema);
