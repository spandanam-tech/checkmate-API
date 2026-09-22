import mongoose from "mongoose";
import { GameStatus, GameResult, GameMode } from "../../utils/enums.js";

const gameSchema = new mongoose.Schema(
  {
    whitePlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    blackPlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: Object.values(GameStatus),
      default: GameStatus.ACTIVE,
    },

    result: {
      type: String,
      enum: [...Object.values(GameResult), null],
      default: null,
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    totalMoves: {
      type: Number,
      default: 0,
    },

    mode: {
      type: String,
      enum: Object.values(GameMode),
      default: GameMode.MULTIPLAYER,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for finding a user's active game
gameSchema.index({ whitePlayerId: 1, status: 1 });
gameSchema.index({ blackPlayerId: 1, status: 1 });

// Indexes for history listing sorted by recency
gameSchema.index({ whitePlayerId: 1, endedAt: -1 });
gameSchema.index({ blackPlayerId: 1, endedAt: -1 });

const Game = mongoose.model("Game", gameSchema);

export default Game;
