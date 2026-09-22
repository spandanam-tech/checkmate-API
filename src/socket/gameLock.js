import redis from "../config/redis.js";

const LOCK_TTL = 5; // seconds — safety net if a holder crashes mid-move

/**
 * Acquire a per-game lock. Returns true if acquired, false if already held.
 * Locks are per game: moves for different games never block each other.
 */
export async function acquireLock(gameId) {
  const result = await redis.set(`lock:game:${gameId}`, "1", "EX", LOCK_TTL, "NX");
  return result === "OK";
}

/**
 * Release a per-game lock. Always call this from a `finally` block.
 */
export async function releaseLock(gameId) {
  await redis.del(`lock:game:${gameId}`);
}
