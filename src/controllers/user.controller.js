import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import fs from "fs";

/* <-------------------- Function to generate access and refresh Token --------------------> */

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);

    // generate access and refresh token
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();

    user.refreshToken = refreshToken;

    // Save the updated user record to the database without running validation
    // as we don't require password {required: true} validation at this point
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while creating access and refresh Token!"
    );
  }
};

/* <-------------------- Register User --------------------> */

const registerUser = asyncHandler(async (req, res) => {
  try {
    const { fullName, email, username, password } = req.body;

    // Validation:
    if (
      [fullName, email, username, password].some(
        (field) => field?.trim() === ""
      )
    ) {
      throw new ApiError(400, "All fields are required!");
    }

    const existedUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existedUser) {
      throw new ApiError(409, "User with email or username already exists!");
    }

    // Check for avatar and coverImage file in the request
    const avatarLocalPath = req.files.avatar ? req.files.avatar[0]?.path : null;
    const coverImageLocalPath = req.files.coverImage
      ? req.files.coverImage[0]?.path
      : null;

    if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is required!");
    }

    // Upload avatar and cover image to Cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
      throw new ApiError(400, "Avatar file is required!");
    }

    // Create user object and save to database
    const user = await User.create({
      fullName,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      email,
      password,
      username: username.toLowerCase(),
    });

    // Remove password and refresh token fields from response
    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    if (!createdUser) {
      throw new ApiError(
        500,
        "Something went wrong while registering the user"
      );
    }

    res
      .status(201)
      .json(new ApiResponse(200, createdUser, "User Registered Successfully!"));
  } catch (error) {
    const deleteFile = (filePath) => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`Failed to delete file: ${filePath}`, error);
        }
      }
    };

    if (req.files?.avatar) {
      deleteFile(req.files.avatar[0].path);
    }
    if (req.files?.coverImage) {
      deleteFile(req.files.coverImage[0].path);
    }
    throw error;
  }
});

/* <-------------------- LogIn User --------------------> */

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  // Validation: Ensure either email or username is provided
  if (!email && !username) {
    throw new ApiError(400, "username or email is required!");
  }

  const user = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (!user) {
    throw new ApiError(404, "user doesn't exist!");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw ApiError(401, "Invalid user credentials!");
  }

  // Generate access and refresh tokens for the authenticated user
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  // Find the user again to exclude the password and refreshToken from the response
  // and also to ensure that this reference to user contains refreshToken updated
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Options for setting cookies, making them HTTP only and secure (can't be changed via frontend)
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in Successfully!"
      )
    );
});

/* <-------------------- Logout User --------------------> */

const logoutUser = asyncHandler(async (req, res) => {
  // req.user._id is stored in req object because of auth.middleware (verifyJWT)
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // Unset (remove) the refreshToken field from the user document
      },
    },
    {
      new: true, // Return the updated document
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logged out!"));
});

/* <-------------------- Renew Access Token via Refresh Token --------------------> */

const refreshAccessToken = asyncHandler(async (rq, res) => {
  /* Extract refresh token ----> decode the token ----> find associated user with token 
   ----> check if it matches with user's token ----> generate new tokens */

  // Extract the refresh token from cookies or request body
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request!");
  }

  try {
    // Verify the incoming refresh token
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    // Find user associated with decoded token
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token!");
    }

    // If the incoming refresh token does not match the user's refresh token in the database, throw error
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token expired or used!");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options) // Set new access token in a cookie
      .cookie("refreshToken", newRefreshToken, options) // Set new refresh token in a cookie
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Access token refreshed!" // Send the new tokens in the response body as well
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token!");
  }
});

/* <-------------------- Change Password --------------------> */

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  // Find the user by their ID passed via verifyJWT Middleware
  const user = await User.find(req.user?._id);

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password!");
  }

  user.password = newPassword; // Update the user's password

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully!"));
});

/* <-------------------- Get Current User --------------------> */

const getCurrentUser = asyncHandler(async (req, res) => {
  res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully!"));
});

/* <-------------------- Update Account Details --------------------> */

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName && !email) {
    throw new ApiError(
      400,
      "Atleat one of the field (fullName or email) is required"
    );
  }

  // Create an update object and add the fields that are to be updated
  const updateFields = {};
  if (fullName) {
    updateFields.fullName = fullName;
  }
  if (email) {
    updateFields.email = email;
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: updateFields, // Set the provided fields
    },
    {
      new: true, // Return the updated document
    }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully!"));
});

/* <-------------------- Update Avatar of User --------------------> */

const updateUserAvatar = asyncHandler(async (req, res) => {
  // Extract the path of the uploaded avatar file from the request
  const avatarLocalPath = req.file ? req.file.path : null;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing!");
  }

  // Upload the avatar file to Cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading avatar!");
  }

  // Update the user's avatar URL in the database
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully!"));
});

/* <-------------------- Update Cover Image of User --------------------> */
const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file ? req.file.path : null;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover Image file is missing!");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading Cover Image!");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  res
    .status(200)
    .json(new ApiResponse(200, user, "Cover Image updated successfully!"));
});

/* <-------------------- Get User Channel Profile--------------------> */
const getUserChannelUserProfile = asyncHandler(async (req, res) => {
  // Extract the username from the request parameters
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "username is missing!");
  }

  // Aggregate pipeline to fetch the user and subscription data
  const channel = await User.aggregate([
    {
      // Stage-1: Match the user with the provided username (case-insensitive)
      $match: {
        username: username?.toLowerCase(),
      },
    },

    {
      // Stage-2: Perform a left outer join with the subscriptions collection to get subscribers
      $lookup: {
        from: "subscriptions", // Collection name to join with
        localField: "_id", // Field from the user document
        foreignField: "channel", // Field from the subscription document
        as: "subscribers", // Output array field
      },
    },

    {
      // Stage-3: Perform a left outer join with the subscriptions collection to get the channels the user is subscribed to
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },

    {
      // Stage-4: Add new fields to the output documents
      $addFields: {
        subscribersCount: {
          $size: "$subscribers", // Count the number of subscribers
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo", // Count the number of channels the user is subscribed to
        },
        isSubscribed: {
          // Check if the current logged-in user is subscribed to this channel
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },

    {
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        avatar: 1,
        coverImage: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
      },
    },
  ]);

  if (!channel?.lenght) {
    throw new ApiError(404, "Channel doesn't exist!");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched Succesfully!")
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
