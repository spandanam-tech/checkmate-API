import redis from "../../config/redis.js";
import { getStartingFen, getLegalMoves } from "../../engine/chessEngine.js";
// Imported from their source files rather than the module barrels: the barrels
// also export Express routers, which pull auth middleware back into the user
// module and form an import cycle.
import gameService from "../game/game.service.js";
import User from "../user/user.model.js";
import { GameMode, GameStatus, PieceColor } from "../../utils/enums.js";
import logger from "../../utils/logger.js";

// The bot is a real User document so that Game.whitePlayerId / blackPlayerId and
// Move.playerId stay required ObjectId refs. Every existing path — persistence,
// history population, resignation, timeout — then works on bot games unchanged.
const BOT_EMAIL = "bot@checkmate.local";
const BOT_USERNAME = "checkmate_bot";
const BOT_NAME = "Checkmate Bot";

let cachedBotUserId = null;

const botService = {
  /**
   * Resolve the bot's User id, creating the document on first use.
   * The upsert is atomic, so concurrent callers cannot create duplicates.
   */
  async getBotUserId() {
    if (cachedBotUserId) {
      return cachedBotUserId;
    }

    let bot;

    try {
      bot = await User.findOneAndUpdate(
        { email: BOT_EMAIL },
        {
          $setOnInsert: {
            username: BOT_USERNAME,
            name: BOT_NAME,
            email: BOT_EMAIL,
            dateOfBirth: new Date(0),
          },
        },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      // Either a concurrent upsert won the race, or a human holds the username.
      bot = await User.findOne({ email: BOT_EMAIL });

      if (!bot) {
        logger.error(`Bot user cannot be created — username "${BOT_USERNAME}" is taken`);
        throw error;
      }
    }

    cachedBotUserId = bot._id.toString();
    return cachedBotUserId;
  },

  /**
   * Pick the bot's move for a position: a uniformly random legal move.
   * Returns { from, to, promotion } or null when no legal move exists.
   */
  selectMove(fen) {
    const legalMoves = getLegalMoves(fen);

    if (legalMoves.length === 0) {
      return null;
    }

    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  },

  /**
   * Is the side to move the bot? False for every multiplayer game.
   */
  isBotTurn(gameState) {
    if (!gameState.isBotGame) {
      return false;
    }

    const playerToMove =
      gameState.currentTurn === PieceColor.WHITE
        ? gameState.whitePlayerId
        : gameState.blackPlayerId;

    return playerToMove === gameState.botPlayerId;
  },

  /**
   * Create a game between a human and the bot.
   * Mirrors matchmaking game creation: Mongo Game doc, Redis state, active-game
   * mapping — but never touches the matchmaking queue or room codes.
   */
  async createBotGame(humanUserId) {
    const botPlayerId = await this.getBotUserId();

    // Colors are always random, matching multiplayer games.
    const humanIsWhite = Math.random() < 0.5;
    const whitePlayerId = humanIsWhite ? humanUserId : botPlayerId;
    const blackPlayerId = humanIsWhite ? botPlayerId : humanUserId;

    const game = await gameService.create({
      whitePlayerId,
      blackPlayerId,
      mode: GameMode.BOT,
    });

    const gameId = game._id.toString();

    const gameState = {
      gameId,
      fen: getStartingFen(),
      whitePlayerId,
      blackPlayerId,
      currentTurn: PieceColor.WHITE,
      turnStartedAt: Date.now(),
      moveNumber: 1,
      status: GameStatus.ACTIVE,
      lastMove: null,
      isBotGame: true,
      botPlayerId,
    };

    await redis.set(`game:${gameId}`, JSON.stringify(gameState));

    // Only the human gets an active-game mapping. The bot plays an unbounded
    // number of games at once, so it must not be bound to a single one.
    await redis.set(`user:active-game:${humanUserId}`, gameId);

    const humanColor = humanIsWhite ? PieceColor.WHITE : PieceColor.BLACK;

    logger.info(`Bot game ${gameId} created: ${humanUserId} plays ${humanColor}`);

    return { gameId, gameState, humanColor };
  },
};

export default botService;
