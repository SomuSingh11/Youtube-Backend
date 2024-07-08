import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelUserProfile,
  getWatchHistory,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

/* <--------------------- Public Route for User Registration ---------------------> */

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

/* <--------------------- Public Route for User Login ---------------------> */

router.route("/login").post(loginUser);

/* <--------------------- Secured Routes --> require JWT verification ---------------------> */

router.route("/logout").post(verifyJWT, logoutUser); // Handles user logout
router.route("/refresh-token").post(refreshAccessToken); // Refreshes access token
router.route("/change-password").post(verifyJWT, changeCurrentPassword); // Changes user password
router.route("/current-user").get(verifyJWT, getCurrentUser); // Fetches current user details
router.route("/update-account").patch(verifyJWT, updateAccountDetails); // Updates account details

/* <--------------------- Secured Routes --> For file uploads ---------------------> */

router
  .route("/avatar")
  .patch(verifyJWT, upload.single("avatar"), updateUserAvatar); // Updates user avatar

router
  .route("/cover-image")
  .patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage); // Updates cover image

/* <--------------------- Secured Routes --> To get User Information ---------------------> */

router.route("/c/:username").get(verifyJWT, getUserChannelUserProfile); // Get user channel profile by username passed via params
router.route("/watchHistory").get(verifyJWT, getWatchHistory); // Get watch history of the logged-in user

export default router;
