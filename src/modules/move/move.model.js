import mongoose from "mongoose";

const moveSchema = new mongoose.Schema(
  {
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },

    moveNumber: {
      type: Number,
      required: true,
    },

    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    from: {
      type: String,
      required: true,
    },

    to: {
      type: String,
      required: true,
    },

    piece: {
      type: String,
      required: true,
    },

    capturedPiece: {
      type: String,
      default: null,
    },

    promotion: {
      type: String,
      default: null,
    },

    notation: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Retrieve moves for a game in order
moveSchema.index({ gameId: 1, moveNumber: 1 });

const Move = mongoose.model("Move", moveSchema);

export default Move;
