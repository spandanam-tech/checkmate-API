import redis from "../config/redis.js";
import { validateAndApplyMove } from "../engine/chessEngine.js";
import { gameService } from "../modules/game/index.js";
import { moveService } from "../modules/move/index.js";
import { botService } from "../modules/bot/index.js";
import { acquireLock, releaseLock } from "./gameLock.js";
import { GameStatus, GameResult, PieceColor } from "../utils/enums.js";
import logger from "../utils/logger.js";

const TURN_TIMEOUT_MS = parseInt(process.env.TURN_TIMEOUT_MS) || 30000;

/**
 * End a game: update MongoDB, clean up Redis, broadcast to room.
 */
async function endGame(io, gameId, gameState, result, winnerId) {
  // Update MongoDB
  await gameService.updateById(gameId, {
    status: GameStatus.COMPLETED,
    result,
    winnerId: winnerId || null,
    endedAt: new Date(),
  });

  // Clean up Redis. In a bot game the bot has no active-game key — deleting a
  // missing key is a no-op, so the same cleanup covers both modes.
  await redis.del(`game:${gameId}`);
  await redis.del(`user:active-game:${gameState.whitePlayerId}`);
  await redis.del(`user:active-game:${gameState.blackPlayerId}`);

  // Broadcast game ended
  io.to(`game:${gameId}`).emit("gameEnded", {
    gameId,
    status: GameStatus.COMPLETED,
    result,
    winnerId: winnerId || null,
  });

  logger.info(`Game ${gameId} ended: ${result}, winner: ${winnerId || "none"}`);
}

/**
 * Validate a move against the current state, then persist and broadcast it.
 * Mutates `gameState` in place. The caller must already hold the game lock and
 * must have verified that it is this player's turn.
 *
 * Returns the chess engine result — check `.valid` before using it.
 */
async function applyMove(io, gameId, gameState, playerId, from, to, promotion) {
  const moveResult = validateAndApplyMove(gameState.fen, from, to, promotion);

  if (!moveResult.valid) {
    return moveResult;
  }

  const newTurn =
    gameState.currentTurn === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;

  gameState.fen = moveResult.newFen;
  gameState.currentTurn = newTurn;
  gameState.turnStartedAt = Date.now();
  gameState.moveNumber += 1;
  gameState.lastMove = { from, to };

  await redis.set(`game:${gameId}`, JSON.stringify(gameState));

  // Persist move to MongoDB
  await moveService.create({
    gameId,
    moveNumber: gameState.moveNumber - 1,
    playerId,
    from,
    to,
    piece: moveResult.piece,
    capturedPiece: moveResult.capturedPiece,
    promotion: promotion || null,
    notation: moveResult.notation,
  });

  // Update total moves on the Game document
  await gameService.incrementTotalMoves(gameId);

  // Broadcast the move to the game room
  io.to(`game:${gameId}`).emit("moveMade", {
    gameId,
    from,
    to,
    piece: moveResult.piece,
    capturedPiece: moveResult.capturedPiece,
    promotion: promotion || null,
    notation: moveResult.notation,
    fen: moveResult.newFen,
    moveNumber: gameState.moveNumber - 1,
    currentTurn: newTurn,
    isCheck: moveResult.isCheck,
    turnStartedAt: gameState.turnStartedAt,
  });

  return moveResult;
}

/**
 * End the game if the move just applied finished it.
 * Returns true if the game ended.
 */
async function settleIfGameOver(io, gameId, gameState, moveResult, moverId) {
  if (moveResult.isCheckmate) {
    await endGame(io, gameId, gameState, GameResult.CHECKMATE, moverId);
    return true;
  }

  if (moveResult.isStalemate) {
    await endGame(io, gameId, gameState, GameResult.DRAW, null);
    return true;
  }

  return false;
}

/**
 * Play the bot's reply in a bot game.
 *
 * The caller must already hold the game lock and must have confirmed the game
 * did not just end. Running inside the caller's lock makes the human move and
 * the bot's answer a single atomic step.
 */
export async function playBotTurn(io, gameId, gameState) {
  if (!botService.isBotTurn(gameState)) {
    return;
  }

  const botMove = botService.selectMove(gameState.fen);

  if (!botMove) {
    // No legal move means checkmate or stalemate, which the caller settles
    // before reaching here.
    logger.error(`Bot has no legal move in game ${gameId} — fen: ${gameState.fen}`);
    return;
  }

  const botPlayerId = gameState.botPlayerId;

  const moveResult = await applyMove(
    io,
    gameId,
    gameState,
    botPlayerId,
    botMove.from,
    botMove.to,
    botMove.promotion
  );

  if (!moveResult.valid) {
    // chess.js generated this move from this same FEN, so it is always legal.
    logger.error(
      `Bot produced an illegal move in game ${gameId}: ${botMove.from}-${botMove.to}`
    );
    return;
  }

  await settleIfGameOver(io, gameId, gameState, moveResult, botPlayerId);
}

export default function gameHandler(io, socket) {
  // makeMove — submit a chess move
  socket.on("makeMove", async ({ gameId, from, to, promotion }) => {
    if (!gameId || !from || !to) {
      return socket.emit("moveRejected", { gameId, reason: "Missing move data" });
    }

    const locked = await acquireLock(gameId);
    if (!locked) {
      return socket.emit("moveRejected", { gameId, reason: "Move is being processed, try again" });
    }

    try {
      // Read game state from Redis
      const gameData = await redis.get(`game:${gameId}`);
      if (!gameData) {
        return socket.emit("error", { message: "Game state not found" });
      }

      const gameState = JSON.parse(gameData);
      const userId = socket.user.userId;

      // Is game active?
      if (gameState.status !== "ACTIVE") {
        return socket.emit("moveRejected", { gameId, reason: "Game is not active" });
      }

      // Is it this player's turn?
      const isWhite = userId === gameState.whitePlayerId;
      const isBlack = userId === gameState.blackPlayerId;
      const expectedColor = gameState.currentTurn;

      if (
        (expectedColor === PieceColor.WHITE && !isWhite) ||
        (expectedColor === PieceColor.BLACK && !isBlack)
      ) {
        return socket.emit("moveRejected", { gameId, reason: "It is not your turn" });
      }

      // Check turn timeout before processing
      const elapsed = Date.now() - gameState.turnStartedAt;
      if (elapsed >= TURN_TIMEOUT_MS) {
        // Current player timed out
        const winnerId =
          expectedColor === PieceColor.WHITE
            ? gameState.blackPlayerId
            : gameState.whitePlayerId;

        await endGame(io, gameId, gameState, GameResult.TIMEOUT, winnerId);
        return;
      }

      // Validate, persist and broadcast the move
      const moveResult = await applyMove(
        io,
        gameId,
        gameState,
        userId,
        from,
        to,
        promotion || null
      );

      if (!moveResult.valid) {
        return socket.emit("moveRejected", { gameId, reason: "Illegal move" });
      }

      // Check for game-over conditions
      const ended = await settleIfGameOver(io, gameId, gameState, moveResult, userId);

      // In a bot game the bot answers immediately, inside this same lock.
      if (!ended) {
        await playBotTurn(io, gameId, gameState);
      }
    } catch (error) {
      logger.error(`makeMove error: ${error.message}`);
      socket.emit("error", { message: "Server error processing move" });
    } finally {
      await releaseLock(gameId);
    }
  });

  // resign — player resigns from active game
  socket.on("resign", async ({ gameId }) => {
    if (!gameId) return;

    const locked = await acquireLock(gameId);
    if (!locked) {
      return socket.emit("error", { message: "Action is being processed, try again" });
    }

    try {
      const gameData = await redis.get(`game:${gameId}`);
      if (!gameData) {
        return socket.emit("error", { message: "Game state not found" });
      }

      const gameState = JSON.parse(gameData);
      const userId = socket.user.userId;

      if (gameState.status !== "ACTIVE") {
        return socket.emit("error", { message: "Game is not active" });
      }

      // The opponent wins — in a bot game that opponent is the bot
      const winnerId =
        userId === gameState.whitePlayerId
          ? gameState.blackPlayerId
          : gameState.whitePlayerId;

      await endGame(io, gameId, gameState, GameResult.RESIGNATION, winnerId);
    } catch (error) {
      logger.error(`resign error: ${error.message}`);
      socket.emit("error", { message: "Server error processing resignation" });
    } finally {
      await releaseLock(gameId);
    }
  });

  // moveTimeout — frontend reports that the current player's 30s expired
  socket.on("moveTimeout", async ({ gameId }) => {
    if (!gameId) return;

    const locked = await acquireLock(gameId);
    if (!locked) return; // Another timeout or move is already being processed

    try {
      const gameData = await redis.get(`game:${gameId}`);
      if (!gameData) return;

      const gameState = JSON.parse(gameData);

      if (gameState.status !== "ACTIVE") return;

      // Verify actual elapsed time on the server
      const elapsed = Date.now() - gameState.turnStartedAt;
      if (elapsed < TURN_TIMEOUT_MS) {
        return; // Not actually timed out yet
      }

      // The bot never forfeits on time. If its turn is somehow still pending —
      // a persistence error cut its reply short — play it now instead of
      // handing the human an unearned win.
      if (botService.isBotTurn(gameState)) {
        await playBotTurn(io, gameId, gameState);
        return;
      }

      // Current turn player loses
      const timedOutColor = gameState.currentTurn;
      const winnerId =
        timedOutColor === PieceColor.WHITE
          ? gameState.blackPlayerId
          : gameState.whitePlayerId;

      await endGame(io, gameId, gameState, GameResult.TIMEOUT, winnerId);
    } catch (error) {
      logger.error(`moveTimeout error: ${error.message}`);
    } finally {
      await releaseLock(gameId);
    }
  });
}
