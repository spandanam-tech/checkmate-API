import { Router } from "express";
import authController from "./auth.controller.js";
import upload from "../../middlewares/upload.middleware.js";

const router = Router();

router.post("/send-otp", authController.sendOTP);
router.post("/verify-otp", authController.verifyOTP);
router.post("/register", upload.single("profileImage"), authController.register);

export default router;
