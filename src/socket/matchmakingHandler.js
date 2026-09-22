import { matchmakingService } from "../modules/matchmaking/index.js";
import redis from "../config/redis.js";
import logger from "../utils/logger.js";

export default function matchmakingHandler(io, socket) {
  // joinQueue — add user to FIFO matchmaking queue
  socket.on("joinQueue", async () => {
    try {
      const userId = socket.user.userId;

      // Block if user already has an active game
      const hasGame = await matchmakingService.hasActiveGame(userId);
      if (hasGame) {
        return socket.emit("error", { message: "You are already in an active game" });
      }

      const opponentId = await matchmakingService.joinQueue(userId);

      if (!opponentId) {
        // No opponent yet — user is waiting in queue
        socket.emit("queueJoined");
        logger.info(`${userId} joined matchmaking queue`);
        return;
      }

      // Match found — create game
      const { gameId, gameState } = await matchmakingService.createGame(userId, opponentId);

      // Find opponent's socket
      const opponentSocketId = await redis.get(`user:online:${opponentId}`);
      const opponentSocket = opponentSocketId ? io.sockets.sockets.get(opponentSocketId) : null;

      // Both players join the game room
      socket.join(`game:${gameId}`);
      if (opponentSocket) {
        opponentSocket.join(`game:${gameId}`);
      }

      // Determine each player's color
      const whiteId = gameState.whitePlayerId;
      const blackId = gameState.blackPlayerId;

      // Emit gameStarted to both players
      const basePayload = {
        gameId,
        whitePlayerId: whiteId,
        blackPlayerId: blackId,
        fen: gameState.fen,
        turnStartedAt: gameState.turnStartedAt,
      };

      socket.emit("gameStarted", {
        ...basePayload,
        yourColor: userId === whiteId ? "white" : "black",
      });

      if (opponentSocket) {
        opponentSocket.emit("gameStarted", {
          ...basePayload,
          yourColor: opponentId === whiteId ? "white" : "black",
        });
      }

      logger.info(`Match found: ${userId} vs ${opponentId} → game ${gameId}`);
    } catch (error) {
      logger.error(`joinQueue error: ${error.message}`);
      socket.emit("error", { message: "Failed to join queue" });
    }
  });

  // leaveQueue — remove user from matchmaking queue
  socket.on("leaveQueue", async () => {
    try {
      await matchmakingService.leaveQueue(socket.user.userId);
      socket.emit("queueLeft");
      logger.info(`${socket.user.userId} left matchmaking queue`);
    } catch (error) {
      logger.error(`leaveQueue error: ${error.message}`);
      socket.emit("error", { message: "Failed to leave queue" });
    }
  });

  // createRoom — create a private room with a 6-char code
  socket.on("createRoom", async () => {
    try {
      const userId = socket.user.userId;

      const hasGame = await matchmakingService.hasActiveGame(userId);
      if (hasGame) {
        return socket.emit("error", { message: "You are already in an active game" });
      }

      const code = await matchmakingService.createRoom(userId);
      socket.emit("roomCreated", { code });
      logger.info(`${userId} created room ${code}`);
    } catch (error) {
      logger.error(`createRoom error: ${error.message}`);
      socket.emit("error", { message: "Failed to create room" });
    }
  });

  // joinRoom — join a private room by code
  socket.on("joinRoom", async ({ code }) => {
    try {
      const userId = socket.user.userId;

      if (!code) {
        return socket.emit("error", { message: "Room code is required" });
      }

      const hasGame = await matchmakingService.hasActiveGame(userId);
      if (hasGame) {
        return socket.emit("error", { message: "You are already in an active game" });
      }

      const creatorId = await matchmakingService.joinRoom(code, userId);

      if (!creatorId) {
        return socket.emit("error", { message: "Room not found or expired" });
      }

      if (creatorId === userId) {
        return socket.emit("error", { message: "Cannot join your own room" });
      }

      // Create game
      const { gameId, gameState } = await matchmakingService.createGame(userId, creatorId);

      // Find creator's socket
      const creatorSocketId = await redis.get(`user:online:${creatorId}`);
      const creatorSocket = creatorSocketId ? io.sockets.sockets.get(creatorSocketId) : null;

      // Both players join the game room
      socket.join(`game:${gameId}`);
      if (creatorSocket) {
        creatorSocket.join(`game:${gameId}`);
      }

      const whiteId = gameState.whitePlayerId;

      const basePayload = {
        gameId,
        whitePlayerId: gameState.whitePlayerId,
        blackPlayerId: gameState.blackPlayerId,
        fen: gameState.fen,
        turnStartedAt: gameState.turnStartedAt,
      };

      socket.emit("gameStarted", {
        ...basePayload,
        yourColor: userId === whiteId ? "white" : "black",
      });

      if (creatorSocket) {
        creatorSocket.emit("gameStarted", {
          ...basePayload,
          yourColor: creatorId === whiteId ? "white" : "black",
        });
      }

      logger.info(`${userId} joined room ${code}, game ${gameId} started`);
    } catch (error) {
      logger.error(`joinRoom error: ${error.message}`);
      socket.emit("error", { message: "Failed to join room" });
    }
  });
}
