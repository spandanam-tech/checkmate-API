import { Chess } from "chess.js";

/**
 * Validate and apply a move on the given FEN.
 * Returns move result or throws if invalid.
 */
export function validateAndApplyMove(fen, from, to, promotion = null) {
  const chess = new Chess(fen);

  const moveObj = { from, to };
  if (promotion) {
    moveObj.promotion = promotion;
  }

  const result = chess.move(moveObj);

  if (!result) {
    return { valid: false };
  }

  return {
    valid: true,
    newFen: chess.fen(),
    notation: result.san,
    piece: result.piece,
    capturedPiece: result.captured || null,
    isCheck: chess.inCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isGameOver: chess.isGameOver(),
  };
}

/**
 * Get whose turn it is from a FEN string.
 * Returns "w" or "b".
 */
export function getCurrentTurn(fen) {
  const chess = new Chess(fen);
  return chess.turn();
}

/**
 * Get game status info from a FEN string.
 */
export function getGameStatus(fen) {
  const chess = new Chess(fen);
  return {
    inCheck: chess.inCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isGameOver: chess.isGameOver(),
    turn: chess.turn(),
  };
}

/**
 * Check if a FEN string is valid.
 */
export function isValidFen(fen) {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the starting position FEN.
 */
export function getStartingFen() {
  const chess = new Chess();
  return chess.fen();
}
