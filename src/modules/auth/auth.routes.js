import { Router } from "express";
import authController from "./auth.controller.js";
import upload from "../../middlewares/upload.middleware.js";
import authMiddleware from "../../middlewares/auth.middleware.js";

const router = Router();

router.post("/send-otp", authController.sendOTP);
router.post("/verify-otp", authController.verifyOTP);
router.post("/register", upload.single("profileImage"), authController.register);
router.post("/logout", authMiddleware, authController.logout);

export default router;
