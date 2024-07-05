import { User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import jwt from "jwt";

const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    // Retrieve token from cookies or Authorization header
    const token =
      req.cookies?.accessToken || req.header("Authorization")?.split(" ")[1];

    if (!token) {
      throw new ApiError(401, "Unauthorized Request!");
    }

    const decodedToken = await jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET
    );

    // Find the user by ID from the decoded token and exclude password and refreshToken fields
    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      throw new ApiError(401, "Invalid Access Token!");
    }

    // Attach the user to the request object
    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});
