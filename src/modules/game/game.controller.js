import { gameService } from "./index.js";
import { moveService } from "../move/index.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";

const gameController = {
  // GET /games
  async listMyGames(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await gameService.listByUser(req.user.userId, page, limit);

      const response = new ApiResponse(200, result, "Games retrieved");
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },

  // GET /games/:gameId
  async getGameDetail(req, res, next) {
    try {
      const { gameId } = req.params;

      const game = await gameService.findById(gameId);
      if (!game) {
        throw new ApiError(404, "Game not found");
      }

      // Verify the requesting user is a participant
      const userId = req.user.userId;
      const isParticipant =
        game.whitePlayerId._id.toString() === userId ||
        game.blackPlayerId._id.toString() === userId;

      if (!isParticipant) {
        throw new ApiError(403, "You are not a participant in this game");
      }

      const moves = await moveService.findByGameId(gameId);

      const response = new ApiResponse(200, { game, moves }, "Game detail retrieved");
      res.status(200).json(response);
    } catch (error) {
      if (error.name === "CastError") {
        return next(new ApiError(400, "Invalid game ID"));
      }
      next(error);
    }
  },
};

export default gameController;
