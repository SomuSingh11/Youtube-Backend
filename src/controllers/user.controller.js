import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

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
  const { fullName, email, username, password } = req.body;

  // Validation:
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
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
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User Registered Successfully!"));
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
    throw ApiError(404, "user doesn't exist!");
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

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
};
