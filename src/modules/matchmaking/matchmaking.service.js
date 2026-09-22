import crypto from "crypto";
import redis from "../../config/redis.js";
import { gameService } from "../game/index.js";
import { getStartingFen } from "../../engine/chessEngine.js";
import { PieceColor } from "../../utils/enums.js";
import logger from "../../utils/logger.js";

const ROOM_CODE_TTL = parseInt(process.env.ROOM_CODE_TTL_SECONDS) || 600;

const matchmakingService = {
  /**
   * Generate a 6-character alphanumeric room code.
   */
  generateRoomCode() {
    return crypto.randomBytes(3).toString("hex").toUpperCase();
  },

  /**
   * Randomly assign colors to two players.
   * Returns { whitePlayerId, blackPlayerId }
   */
  assignColors(playerA, playerB) {
    const isPlayerAWhite = Math.random() < 0.5;
    return {
      whitePlayerId: isPlayerAWhite ? playerA : playerB,
      blackPlayerId: isPlayerAWhite ? playerB : playerA,
    };
  },

  /**
   * Check if a user already has an active game.
   */
  async hasActiveGame(userId) {
    const gameId = await redis.get(`user:active-game:${userId}`);
    return gameId !== null;
  },

  /**
   * Add user to the matchmaking queue.
   * Returns matched opponent userId if a match is found, null otherwise.
   */
  async joinQueue(userId) {
    // Check if user is already in queue
    const queue = await redis.lrange("matchmaking:queue", 0, -1);
    if (queue.includes(userId)) {
      return null;
    }

    // Check queue for a waiting opponent
    const opponentId = await redis.lpop("matchmaking:queue");

    if (opponentId && opponentId !== userId) {
      // Verify opponent is still online and has no active game
      const opponentOnline = await redis.get(`user:online:${opponentId}`);
      const opponentHasGame = await this.hasActiveGame(opponentId);

      if (opponentOnline && !opponentHasGame) {
        return opponentId;
      }
      // Opponent is stale — try again recursively (pop next)
      return this.joinQueue(userId);
    }

    // No match found — add user to queue
    await redis.rpush("matchmaking:queue", userId);
    return null;
  },

  /**
   * Remove user from matchmaking queue.
   */
  async leaveQueue(userId) {
    await redis.lrem("matchmaking:queue", 0, userId);
  },

  /**
   * Create a private room with a code.
   */
  async createRoom(userId) {
    const code = this.generateRoomCode();

    await redis.set(
      `room:${code}`,
      JSON.stringify({ creatorId: userId, createdAt: Date.now() }),
      "EX",
      ROOM_CODE_TTL
    );

    return code;
  },

  /**
   * Join an existing room by code.
   * Returns the creator's userId or null if room not found.
   */
  async joinRoom(code, joiningUserId) {
    const roomData = await redis.get(`room:${code}`);
    if (!roomData) {
      return null;
    }

    const { creatorId } = JSON.parse(roomData);

    // Delete the room — it's consumed
    await redis.del(`room:${code}`);

    return creatorId;
  },

  /**
   * Create a game between two players.
   * Sets up MongoDB Game doc, Redis game state, and active-game mappings.
   */
  async createGame(playerA, playerB) {
    const { whitePlayerId, blackPlayerId } = this.assignColors(playerA, playerB);

    // Create Game document in MongoDB
    const game = await gameService.create({
      whitePlayerId,
      blackPlayerId,
    });

    const gameId = game._id.toString();
    const fen = getStartingFen();
    const now = Date.now();

    // Initialize Redis game state
    const gameState = {
      gameId,
      fen,
      whitePlayerId,
      blackPlayerId,
      currentTurn: PieceColor.WHITE,
      turnStartedAt: now,
      moveNumber: 1,
      status: "ACTIVE",
      lastMove: null,
    };

    await redis.set(`game:${gameId}`, JSON.stringify(gameState));

    // Map both users to their active game
    await redis.set(`user:active-game:${whitePlayerId}`, gameId);
    await redis.set(`user:active-game:${blackPlayerId}`, gameId);

    logger.info(`Game ${gameId} created: ${whitePlayerId} (W) vs ${blackPlayerId} (B)`);

    return { gameId, gameState };
  },
};

export default matchmakingService;
