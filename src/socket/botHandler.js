import { botService } from "../modules/bot/index.js";
import { matchmakingService } from "../modules/matchmaking/index.js";
import { acquireLock, releaseLock } from "./gameLock.js";
import { playBotTurn } from "./gameHandler.js";
import { GameMode, PieceColor } from "../utils/enums.js";
import logger from "../utils/logger.js";

export default function botHandler(io, socket) {
  // startBotGame — begin a single-player game against the bot
  socket.on("startBotGame", async () => {
    try {
      const userId = socket.user.userId;

      // One active game per user, counting bot games.
      const hasGame = await matchmakingService.hasActiveGame(userId);
      if (hasGame) {
        return socket.emit("error", { message: "You are already in an active game" });
      }

      // A player who was waiting for a human opponent must not stay queued.
      await matchmakingService.leaveQueue(userId);

      const { gameId, gameState, humanColor } = await botService.createBotGame(userId);

      // Only the human joins the room — the bot has no socket.
      socket.join(`game:${gameId}`);

      socket.emit("gameStarted", {
        gameId,
        whitePlayerId: gameState.whitePlayerId,
        blackPlayerId: gameState.blackPlayerId,
        fen: gameState.fen,
        yourColor: humanColor,
        turnStartedAt: gameState.turnStartedAt,
        mode: GameMode.BOT,
        botPlayerId: gameState.botPlayerId,
      });

      logger.info(`${userId} started bot game ${gameId} as ${humanColor}`);

      // White opens. If the bot drew white it must move before the player can.
      if (humanColor === PieceColor.BLACK) {
        const locked = await acquireLock(gameId);
        if (!locked) return;

        try {
          await playBotTurn(io, gameId, gameState);
        } finally {
          await releaseLock(gameId);
        }
      }
    } catch (error) {
      logger.error(`startBotGame error: ${error.message}`);
      socket.emit("error", { message: "Failed to start bot game" });
    }
  });
}
