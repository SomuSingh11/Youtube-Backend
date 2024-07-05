import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// FUNCTION TO GENERATE ACCESS AND REFRESH TOKEN
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

// REGISTER USER
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

// LOGIN USER
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
  const { accessToken, refreshToken } = generateAccessAndRefreshTokens(
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

export { registerUser, loginUser };
