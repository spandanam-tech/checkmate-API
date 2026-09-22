import Move from "./move.model.js";

const moveService = {
  async create(data) {
    return Move.create(data);
  },

  async findByGameId(gameId) {
    return Move.find({ gameId }).sort({ moveNumber: 1 });
  },
};

export default moveService;
