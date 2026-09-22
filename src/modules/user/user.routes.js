import { Router } from "express";
import userController from "./user.controller.js";
import authMiddleware from "../../middlewares/auth.middleware.js";
import upload from "../../middlewares/upload.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/me", userController.getMe);
router.put("/me", userController.updateMe);
router.put(
  "/me/profile-image",
  upload.single("profileImage"),
  userController.uploadProfileImage
);

export default router;
