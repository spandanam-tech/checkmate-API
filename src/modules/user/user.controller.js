import { userService } from "./index.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";

const userController = {
  // GET /users/me
  async getMe(req, res, next) {
    try {
      const user = await userService.findById(req.user.userId);
      if (!user) {
        throw new ApiError(404, "User not found");
      }

      const response = new ApiResponse(200, { user }, "User profile retrieved");
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },

  // PUT /users/me
  async updateMe(req, res, next) {
    try {
      const { name, dateOfBirth } = req.body;
      const updateData = {};

      if (name) updateData.name = name;
      if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;

      const user = await userService.updateById(req.user.userId, updateData);
      if (!user) {
        throw new ApiError(404, "User not found");
      }

      const response = new ApiResponse(200, { user }, "Profile updated");
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },

  // PUT /users/me/profile-image
  async uploadProfileImage(req, res, next) {
    try {
      if (!req.file) {
        throw new ApiError(400, "Profile image file is required");
      }

      const user = await userService.updateById(req.user.userId, {
        profileImage: req.file.filename,
      });

      const response = new ApiResponse(200, { user }, "Profile image updated");
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
};

export default userController;
