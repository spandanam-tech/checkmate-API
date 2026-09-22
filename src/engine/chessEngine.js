import { Chess } from "chess.js";

/**
 * Validate and apply a move on the given FEN.
 * Returns the move result, or { valid: false } if the move is illegal.
 */
export function validateAndApplyMove(fen, from, to, promotion = null) {
  const chess = new Chess(fen);

  const moveObj = { from, to };
  if (promotion) {
    moveObj.promotion = promotion;
  }

  // chess.js throws on an illegal or malformed move rather than returning null.
  let result;
  try {
    result = chess.move(moveObj);
  } catch {
    return { valid: false };
  }

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

/**
 * List every legal move for the side to move in the given position.
 * Each promotion piece is a separate entry, so any entry can be played as-is.
 * Returns [] when the side to move has no legal moves (checkmate or stalemate).
 */
export function getLegalMoves(fen) {
  const chess = new Chess(fen);

  return chess.moves({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    promotion: move.promotion || null,
  }));
}
