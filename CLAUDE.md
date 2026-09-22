# CLAUDE.md

## Read this first

**[PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) is the source of truth for this
project.** Before implementing, changing, or reviewing anything in this repo, read it.
It defines the product scope, the data model, which store owns which state, and the
real-time protocol.

**[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** contains the full architectural
blueprint with all decisions finalized. Refer to it for schema details, Redis key
design, socket event contracts, and implementation phases.

## What this is

Checkmate — the backend API for an online multiplayer chess game. Node.js (ESM),
Express 5, Socket.IO for real-time play, MongoDB via Mongoose for durable data, Redis
(ioredis) for active game state, chess.js for move validation.

## Current state

The backend is fully implemented with:
- Passwordless OTP authentication (SendGrid)
- User profiles with image upload (Multer)
- Matchmaking (FIFO queue + private room codes)
- Real-time chess gameplay over Socket.IO
- chess.js-powered move validation with FEN-based board state
- Per-game Redis locking for move concurrency
- 30-second per-turn timer (backend-validated timestamps)
- Game history REST endpoints with pagination
- Play against bot — single-player mode, random legal moves via chess.js

## Tech stack

| Concern | Choice |
| --- | --- |
| Runtime | Node.js, ES modules (`"type": "module"` — use `import`, not `require`) |
| HTTP | Express 5 |
| Real-time | Socket.IO |
| Durable store | MongoDB via Mongoose |
| Active game state | Redis via ioredis |
| Chess engine | chess.js (wrapped in `src/engine/chessEngine.js`) |
| Auth | Passwordless OTP — `jsonwebtoken` + `bcrypt` (for OTP hashing) + `@sendgrid/mail` |
| File uploads | Multer (profile images only) |
| Logging | `winston` |
| Security/middleware | `helmet`, `cors` |
| Config | `dotenv` |
| Dev | `nodemon` |

## Architecture rules

These are load-bearing. Violating them is a defect, not a style choice.

- **The backend validates every move.** The frontend may compute legal moves for
  instant UI feedback, but nothing the client sends is trusted. Turn order, piece
  ownership, legality, and self-check exposure are all checked server-side via chess.js.
- **Redis holds only the active game state**, one key per game: `game:{gameId}`. Board
  state is stored as a FEN string. One current board per game — never per-move boards.
- **Per-game locking** is required. The `GET → validate → SET` sequence is not atomic.
  A Redis lock (`lock:game:{gameId}`, SET NX EX 5) must be acquired before reading
  game state and released in a `finally` block after processing.
- **MongoDB holds history.** Each validated move becomes its own `Move` document as it
  happens, not in a batch at game end. `Game` holds game-level data only; it never
  stores the board.
- **The frontend never talks to Redis.** All access goes through Node.js so
  credentials and infrastructure stay server-side.
- **Passwordless auth.** No passwords are stored. Users authenticate via email OTP
  (4-digit, 5-minute expiry, hashed with bcrypt, stored in Redis).
- **Moves must be idempotent** against network retries — use `lastMove` /
  `moveNumber` and turn validation to prevent duplicate processing.

## Collections

`User`, `Game`, `Move` — three collections total.

- **User**: username (unique), name, email (unique), dateOfBirth, profileImage
- **Game**: whitePlayerId, blackPlayerId, winnerId, status, result, startedAt, endedAt, totalMoves, mode
- **Move**: gameId, moveNumber, playerId, from, to, piece, capturedPiece, promotion, notation

## Project structure

```
src/
├── index.js                     # Entry point
├── app.js                       # Express setup
├── config/                      # DB, Redis, SendGrid connections
├── modules/
│   ├── auth/                    # OTP send/verify, registration, JWT
│   ├── user/                    # User model, service, profile endpoints
│   ├── game/                    # Game model, service, history endpoints
│   ├── move/                    # Move model, service
│   ├── matchmaking/             # Queue + room code logic
│   └── bot/                     # Bot user, bot game creation, move choice
├── engine/chessEngine.js        # chess.js wrapper
├── socket/                      # Socket.IO setup, auth, game + matchmaking + bot handlers, game lock
├── middlewares/                  # JWT auth, error handler, Multer upload
└── utils/                       # ApiResponse, ApiError, logger, enums
```

## Conventions

- ES module imports throughout; no CommonJS.
- No base class inheritance — each module has its own standalone service/controller.
- Secrets and connection strings come from the environment via `dotenv`. Never commit
  a `.env`, and never hardcode a Mongo or Redis URI.
- Log through `winston`, not `console.log`.
- Responses use `ApiResponse` (success) and `ApiError` (failure) classes.
- Socket events and REST endpoints are documented in
  [endpointAndResponse.md](endpointAndResponse.md).

## Key decisions

- **Colors**: Always randomly assigned — no player choice.
- **Draw**: Stalemate only — no draw offers, no repetition rules.
- **Timer**: 30-second per-turn limit. Backend stores `turnStartedAt`, frontend sends
  `moveTimeout`, backend validates elapsed time.
- **Matchmaking**: FIFO Redis queue (auto-match) + 6-char room codes (private games).
- **One active game per user** at any time.
- **No refresh tokens** — JWT expires in 24h, user re-authenticates via OTP.
- **Bot mode**: the bot is a seeded `User` document, so bot games flow through
  the existing Game/Move schema and every existing code path unchanged. Its
  reply is computed inline inside the player's game lock — no queues, no
  workers, no separate service. Strategy is a random legal move (v1).
