import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import redis from "../../config/redis.js";
import { sendOTPEmail } from "../../config/sendgrid.js";
import { userService } from "../user/index.js";
import ApiError from "../../utils/ApiError.js";
import logger from "../../utils/logger.js";

const OTP_TTL = parseInt(process.env.OTP_TTL_SECONDS) || 300;

const authService = {
  // Generate a random 4-digit OTP
  generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  },

  // Generate JWT access token
  generateToken(user) {
    return jwt.sign(
      { userId: user._id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
  },

  // Generate short-lived registration token
  generateRegistrationToken(email) {
    return jwt.sign(
      { email, purpose: "registration" },
      process.env.REGISTRATION_TOKEN_SECRET,
      { expiresIn: "10m" }
    );
  },

  // Verify registration token
  verifyRegistrationToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.REGISTRATION_TOKEN_SECRET);
      if (decoded.purpose !== "registration") {
        throw new ApiError(401, "Invalid registration token");
      }
      return decoded;
    } catch {
      throw new ApiError(401, "Invalid or expired registration token");
    }
  },

  // Send OTP to email
  async sendOTP(email) {
    const otp = this.generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    // Store hashed OTP in Redis with TTL
    await redis.set(
      `otp:${email}`,
      JSON.stringify({ otp: hashedOtp, createdAt: Date.now() }),
      "EX",
      OTP_TTL
    );

    // Send email
    try {
      await sendOTPEmail(email, otp);
    } catch (error) {
      logger.error(`SendGrid error: ${error.message}`);
      throw new ApiError(500, "Failed to send OTP email");
    }
  },

  // Verify OTP
  async verifyOTP(email, otp) {
    const stored = await redis.get(`otp:${email}`);
    if (!stored) {
      throw new ApiError(400, "OTP expired or invalid");
    }

    const { otp: hashedOtp } = JSON.parse(stored);
    const isMatch = await bcrypt.compare(otp, hashedOtp);
    if (!isMatch) {
      throw new ApiError(400, "Incorrect OTP");
    }

    // Delete OTP after successful verification
    await redis.del(`otp:${email}`);

    // Check if user exists
    const user = await userService.findByEmail(email);

    if (user) {
      // Existing user — return JWT
      const token = this.generateToken(user);
      return { token, user, isNewUser: false };
    }

    // New user — return registration token
    const registrationToken = this.generateRegistrationToken(email);
    return { registrationToken, isNewUser: true };
  },

  // Register a new user
  async register({ email, username, name, dateOfBirth, profileImage }) {
    // Check if username is taken
    const existing = await userService.findByUsername(username);
    if (existing) {
      throw new ApiError(409, "Username already taken");
    }

    // Check if email is already registered
    const existingEmail = await userService.findByEmail(email);
    if (existingEmail) {
      throw new ApiError(409, "Email already registered");
    }

    const user = await userService.create({
      email,
      username,
      name,
      dateOfBirth,
      profileImage,
    });

    const token = this.generateToken(user);
    return { token, user };
  },
};

export default authService;
