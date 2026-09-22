import jwt from "jsonwebtoken";
import redis from "../config/redis.js";
import { userService } from "../modules/user/index.js";
import logger from "../utils/logger.js";

/**
 * Socket.IO middleware — verifies JWT on connection.
 * Expects token in socket.handshake.auth.token
 */
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    // Check if token has been blacklisted (logout)
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      return next(new Error("Token has been revoked"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userService.findById(decoded.userId);

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.user = {
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
    };

    next();
  } catch (error) {
    logger.error(`Socket auth error: ${error.message}`);
    next(new Error("Invalid or expired token"));
  }
};

export default socketAuth;
