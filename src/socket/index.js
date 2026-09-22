import { Server } from "socket.io";
import socketAuth from "./socketAuth.js";
import matchmakingHandler from "./matchmakingHandler.js";
import gameHandler from "./gameHandler.js";
import botHandler from "./botHandler.js";
import redis from "../config/redis.js";
import { matchmakingService } from "../modules/matchmaking/index.js";
import logger from "../utils/logger.js";

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_ORIGIN || "*" },
  });

  // Authenticate every socket connection
  io.use(socketAuth);

  io.on("connection", async (socket) => {
    const userId = socket.user.userId;
    logger.info(`Socket connected: ${socket.id} (user: ${userId})`);

    // Track online status
    await redis.set(`user:online:${userId}`, socket.id);

    // Check for active game — auto-rejoin room
    const activeGameId = await redis.get(`user:active-game:${userId}`);
    if (activeGameId) {
      const gameData = await redis.get(`game:${activeGameId}`);
      if (gameData) {
        socket.join(`game:${activeGameId}`);
        socket.emit("gameState", JSON.parse(gameData));
        socket.to(`game:${activeGameId}`).emit("opponentReconnected", {
          gameId: activeGameId,
        });
        logger.info(`${userId} reconnected to game ${activeGameId}`);
      }
    }

    // Register event handlers
    matchmakingHandler(io, socket);
    gameHandler(io, socket);
    botHandler(io, socket);

    // Handle disconnect
    socket.on("disconnect", async () => {
      logger.info(`Socket disconnected: ${socket.id} (user: ${userId})`);

      // Remove online status
      await redis.del(`user:online:${userId}`);

      // Remove from matchmaking queue
      await matchmakingService.leaveQueue(userId);

      // Notify opponent if in active game
      const gameId = await redis.get(`user:active-game:${userId}`);
      if (gameId) {
        socket.to(`game:${gameId}`).emit("opponentDisconnected", { gameId });
      }
    });
  });

  logger.info("Socket.IO initialized");
};

export const getIO = () => {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
};
