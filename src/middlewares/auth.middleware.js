import jwt from "jsonwebtoken";
import { userService } from "../modules/user/index.js";
import ApiError from "../utils/ApiError.js";

const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiError(401, "Authentication required");
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userService.findById(decoded.userId);
    if (!user) {
      throw new ApiError(401, "User not found");
    }

    req.user = {
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json(error.toJSON());
    }
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: "Invalid or expired token",
    });
  }
};

export default authMiddleware;
