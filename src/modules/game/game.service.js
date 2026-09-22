import Game from "./game.model.js";
import { GameStatus } from "../../utils/enums.js";

const gameService = {
  async create(data) {
    return Game.create(data);
  },

  async findById(id) {
    return Game.findById(id)
      .populate("whitePlayerId", "username name profileImage")
      .populate("blackPlayerId", "username name profileImage")
      .populate("winnerId", "username name");
  },

  async updateById(id, data) {
    return Game.findByIdAndUpdate(id, data, { new: true });
  },

  async incrementTotalMoves(id) {
    return Game.findByIdAndUpdate(id, { $inc: { totalMoves: 1 } }, { new: true });
  },

  async listByUser(userId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const filter = {
      status: GameStatus.COMPLETED,
      $or: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
    };

    const [games, total] = await Promise.all([
      Game.find(filter)
        .populate("whitePlayerId", "username name profileImage")
        .populate("blackPlayerId", "username name profileImage")
        .populate("winnerId", "username name")
        .sort({ endedAt: -1 })
        .skip(skip)
        .limit(limit),
      Game.countDocuments(filter),
    ]);

    return {
      games,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};

export default gameService;
