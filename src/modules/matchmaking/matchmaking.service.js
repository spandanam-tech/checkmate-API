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
   * One open room per user — any previous room is cancelled first, so an old
   * code can never be joined after a new one has been issued.
   */
  async createRoom(userId) {
    await this.cancelRoom(userId);

    const code = this.generateRoomCode();

    await redis.set(
      `room:${code}`,
      JSON.stringify({ creatorId: userId, createdAt: Date.now() }),
      "EX",
      ROOM_CODE_TTL
    );

    // Reverse lookup, same TTL: lets the server find a user's room without the
    // client having to remember the code (e.g. after a reload or a disconnect).
    await redis.set(`user:room:${userId}`, code, "EX", ROOM_CODE_TTL);

    logger.info(`Room ${code} opened by ${userId}`);

    return code;
  },

  /**
   * Cancel the user's open room, if they have one.
   * Returns the cancelled code, or null when there was nothing to cancel.
   *
   * Deleting `room:{code}` is all that is needed to invalidate the code —
   * `joinRoom` already rejects a missing key, so a later join attempt gets
   * "Room not found or expired".
   */
  async cancelRoom(userId) {
    const code = await redis.get(`user:room:${userId}`);

    if (!code) {
      return null;
    }

    await redis.del(`room:${code}`, `user:room:${userId}`);

    logger.info(`Room ${code} cancelled by ${userId}`);

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

    // Delete the room — it's consumed. The reverse key goes with it, otherwise
    // the creator would look like they still have an open room.
    await redis.del(`room:${code}`, `user:room:${creatorId}`);

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
