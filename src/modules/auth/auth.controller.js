import authService from "./auth.service.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";

const authController = {
  // POST /auth/send-otp
  async sendOTP(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ApiError(400, "Email is required");
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ApiError(400, "Invalid email format");
      }

      await authService.sendOTP(email.toLowerCase().trim());

      const response = new ApiResponse(200, null, "OTP sent to your email");
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },

  // POST /auth/verify-otp
  async verifyOTP(req, res, next) {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        throw new ApiError(400, "Email and OTP are required");
      }

      const result = await authService.verifyOTP(
        email.toLowerCase().trim(),
        otp.toString()
      );

      const response = new ApiResponse(200, result, "OTP verified");
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },

  // POST /auth/register
  async register(req, res, next) {
    try {
      const { registrationToken, username, name, dateOfBirth } = req.body;

      if (!registrationToken) {
        throw new ApiError(400, "Registration token is required");
      }
      if (!username || !name || !dateOfBirth) {
        throw new ApiError(400, "Username, name, and date of birth are required");
      }

      // Verify registration token
      const decoded = authService.verifyRegistrationToken(registrationToken);

      // Build profile image path if file was uploaded
      const profileImage = req.file ? req.file.filename : null;

      const result = await authService.register({
        email: decoded.email,
        username,
        name,
        dateOfBirth,
        profileImage,
      });

      const response = new ApiResponse(201, result, "Registration successful");
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  },
  // POST /auth/logout
  async logout(req, res, next) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      await authService.logout(token);

      const response = new ApiResponse(200, null, "Logged out successfully");
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
};

export default authController;
