# Checkmate API — Implementation Plan

This document is the complete backend implementation blueprint for the Checkmate
online multiplayer chess application. It was derived from `PRODUCT_REQUIREMENTS.md`
and refined through explicit architectural decisions made with the project owner.

Every file, dependency, module, and design choice described below has a concrete
reason rooted in the product requirements.

---

## 1. Project Understanding

Checkmate is a real-time online multiplayer chess game with the following backend
responsibilities:

- **Passwordless authentication** via email OTP (SendGrid).
- **User profiles** with username, name, date of birth, and profile image upload.
- **Matchmaking** via two mechanisms:
  - Redis FIFO queue (auto-match with the next available player).
  - Private room codes (6-character alphanumeric invite).
- **Real-time gameplay** over Socket.IO.
  - Backend is authoritative for all move validation.
  - Active game state lives in Redis (FEN format via chess.js).
  - Every validated move is persisted to MongoDB immediately.
  - 30-second per-turn timer enforced by backend timestamp validation.
- **Color assignment** is always random — no player choice.
- **Game-end conditions**: checkmate, stalemate (draw), resignation, timeout
  (30 s turn expiry).
- **Game history**: users can list past games and view the full move sequence of
  any completed game.
- **One active game per user** at any time.
- **Reconnection**: disconnected players rejoin their active game room and receive
  the current Redis state.
- **Draw only via stalemate** — no draw offers, no repetition rules in v1.
- **Play against bot** — a single-player mode where the opponent is a
  server-side bot that plays a random legal move. Fully separate from
  matchmaking; see section 15.

### What Is NOT in Scope

- Traditional chess clocks (cumulative per-player time). Only a 30-second
  per-turn limit exists.
- Draw offers / accept flow.
- Threefold repetition, 50-move rule, insufficient material detection.
- Email notifications beyond OTP.
- Admin panel.
- Payment / subscription.
- Analytics / monitoring infrastructure.
- CI/CD / Docker / Kubernetes.
- Frontend implementation.

---

## 2. Architectural Principles

### Why Node.js + Express

The existing repository is initialized as a Node.js project with Express 5,
Socket.IO, Mongoose, and JWT already declared in `package.json`. The reference
architecture (Maguz-API) is also Express-based. Node.js is well-suited for I/O-
bound, event-driven workloads — exactly what a real-time chess server requires.

### Why MongoDB

MongoDB stores durable, permanent data: users, completed games, and the move
history for every game. The schema is document-oriented and maps cleanly to the
three collections defined in `PRODUCT_REQUIREMENTS.md`. Mongoose provides schema
validation, indexing, and relationship population.

### Why Redis

Redis stores ephemeral, high-frequency data: the active game board state, the
matchmaking queue, OTPs, and private room codes. Reading/writing the board from
Redis on every move avoids unnecessary MongoDB round-trips for constantly changing
state. When a game ends, the Redis key is deleted — MongoDB is the permanent
record.

### State Ownership

```
Redis (ephemeral)                    MongoDB (permanent)
─────────────────                    ───────────────────
Active game state (FEN, turn,        User documents
  castling, en passant, timer)       Game documents (final result)
Matchmaking queue                    Move documents (every move)
Private room codes
OTPs (4-digit, 5-min TTL)
Online user tracking
```

### Why the Backend Is Authoritative

The frontend may calculate legal moves locally for UI responsiveness, but the
backend independently validates every submitted move using chess.js before
updating the game state. This prevents:

- Tampered move submissions.
- Desynchronized board states between players.
- Invalid game results.

### Why the Frontend Cannot Access Redis Directly

Redis credentials and infrastructure access remain server-side. All client
communication passes through Node.js via HTTP (REST) or WebSocket (Socket.IO).

```
Client  →  Socket.IO / HTTP  →  Node.js  →  Redis
                                          →  MongoDB
```

---

## 3. Proposed File / Folder Architecture

```
src/
├── index.js                          # Entry point — starts HTTP server
├── app.js                            # Express app setup, middleware, route mounting
│
├── config/
│   ├── database.js                   # MongoDB connection via Mongoose
│   ├── redis.js                      # ioredis client creation and export
│   └── sendgrid.js                   # SendGrid mail client initialization
│
├── modules/
│   ├── index.js                      # Route aggregator — mounts all module routes
│   │
│   ├── auth/
│   │   ├── auth.controller.js        # send-otp, verify-otp, register handlers
│   │   ├── auth.service.js           # OTP generation, verification, JWT, registration logic
│   │   ├── auth.routes.js            # POST /send-otp, /verify-otp, /register
│   │   └── index.js                  # Re-exports router
│   │
│   ├── user/
│   │   ├── user.model.js             # Mongoose schema: username, name, email, dateOfBirth, profileImage
│   │   ├── user.controller.js        # get-me, update-me, upload-profile-image handlers
│   │   ├── user.service.js           # User CRUD operations
│   │   ├── user.routes.js            # GET /me, PUT /me, PUT /me/profile-image
│   │   └── index.js                  # Re-exports router and model
│   │
│   ├── game/
│   │   ├── game.model.js             # Mongoose schema: players, status, result, timestamps
│   │   ├── game.controller.js        # list-my-games, get-game-detail handlers
│   │   ├── game.service.js           # Game creation, completion, history queries
│   │   ├── game.routes.js            # GET /games, GET /games/:gameId
│   │   └── index.js                  # Re-exports router and model
│   │
│   ├── move/
│   │   ├── move.model.js             # Mongoose schema: gameId, moveNumber, from, to, piece, etc.
│   │   ├── move.service.js           # Move creation, retrieval by gameId
│   │   └── index.js                  # Re-exports model and service
│   │
│   ├── matchmaking/
│   │   ├── matchmaking.service.js    # Queue management, room code generation, pairing logic
│   │   └── index.js                  # Re-exports service
│   │
│   └── bot/
│       ├── bot.service.js            # Bot user seeding, bot game creation, random move choice
│       └── index.js                  # Re-exports service
│
├── engine/
│   └── chessEngine.js                # chess.js wrapper — validate, apply, detect end states
│
├── socket/
│   ├── index.js                      # Socket.IO server creation, handler registration
│   ├── socketAuth.js                 # Socket middleware — JWT verification on connection
│   ├── gameLock.js                   # Per-game Redis lock (acquire / release)
│   ├── gameHandler.js                # makeMove, resign, moveTimeout, reconnect events
│   ├── matchmakingHandler.js         # joinQueue, leaveQueue, createRoom, joinRoom events
│   └── botHandler.js                 # startBotGame event
│
├── middlewares/
│   ├── auth.middleware.js            # JWT verification for HTTP routes
│   ├── error.middleware.js           # Global Express error handler
│   └── upload.middleware.js          # Multer config for profile image upload
│
├── utils/
│   ├── ApiResponse.js                # Standardized success response class
│   ├── ApiError.js                   # Standardized error class with statusCode
│   ├── logger.js                     # Winston logger (console transport)
│   └── enums.js                      # GameStatus, GameResult, PieceColor constants
│
└── uploads/                          # Profile image storage directory (gitignored)
```

### Folder Responsibilities

| Folder | Purpose | What Does NOT Belong Here |
|--------|---------|--------------------------|
| `config/` | External service connections (DB, Redis, SendGrid) | Business logic, route definitions |
| `modules/` | Feature-specific code organized by domain | Cross-cutting utilities, socket handlers |
| `modules/<name>/` | Model + service + controller + routes for one domain entity | Code for a different entity |
| `engine/` | Chess rule logic — the chess.js wrapper, incl. legal move generation | HTTP/socket handling, persistence, move *selection* strategy |
| `socket/` | Socket.IO server setup and event handlers | REST route definitions, Mongoose models |
| `middlewares/` | Express middleware (auth, errors, uploads) | Business logic, direct DB queries |
| `utils/` | Shared utilities (response formatting, logging, enums) | Feature-specific logic |
| `uploads/` | Disk storage for uploaded profile images | Application code |

### Why No Base Classes

Maguz-API uses `BaseModel`, `BaseService`, and `BaseController` to share generic
CRUD logic across 25+ modules. Checkmate has only 4 modules (auth, user, game,
move), each with distinct logic. Base class inheritance adds indirection without
meaningful code reuse at this scale. Each module implements its own service and
controller directly.

---

## 4. Dependencies

### Dependencies to Install

| Package | Version | Why |
|---------|---------|-----|
| `ioredis` | latest | Redis client for active game state, matchmaking queue, OTPs, room codes. Chosen over `redis` for richer API and built-in reconnection. |
| `chess.js` | latest | Chess move validation, legal move generation, check/checkmate/stalemate detection, FEN serialization. Battle-tested library that handles every chess rule edge case. |
| `@sendgrid/mail` | latest | Sending OTP emails for passwordless authentication. |
| `multer` | latest | Handling multipart/form-data for profile image upload. |

### Dependencies Already in package.json

| Package | Why It Stays |
|---------|-------------|
| `express` (5.2.1) | HTTP framework |
| `mongoose` (9.10.1) | MongoDB ODM |
| `socket.io` (4.8.3) | Real-time bidirectional communication |
| `jsonwebtoken` (9.0.3) | JWT generation and verification |
| `bcrypt` (6.0.0) | OTP hashing before Redis storage (security layer) |
| `helmet` (8.3.0) | Security headers |
| `cors` (2.8.6) | Cross-origin request handling |
| `dotenv` (18.0.1) | Environment variable loading |
| `winston` (3.19.0) | Structured logging |
| `nodemon` (3.1.14) | Dev server auto-restart |

### Dependencies NOT to Include

These exist in Maguz-API but have no requirement in Checkmate:

| Maguz-API Dependency | Why Excluded |
|----------------------|-------------|
| `compression` | Not needed — chess payloads are small JSON objects |
| `casbin` | No complex RBAC — only authenticated-or-not |
| `gridfs-stream` / `multer-gridfs-storage` | No GridFS — profile images stored on local disk via standard Multer |
| `csv-parser` | No CSV import/export |
| `mime-types` | Not needed |
| `@sendgrid/mail` usage for password reset | No passwords — OTP only; SendGrid IS used but only for OTP |
| `bcryptjs` | Already have native `bcrypt` |
| `express-list-endpoints` | Nice-to-have, not required |
| `http-status-codes` | Will use numeric status codes directly for simplicity |
| Node.js `cluster` module | Clustering complicates Socket.IO state (requires Redis adapter). Not needed for v1. |

---

## 5. Authentication Architecture

### Overview

Checkmate uses **passwordless OTP authentication**. There are no passwords. Users
identify themselves by email, receive a 4-digit OTP via SendGrid, verify it, and
receive a JWT.

### Flow: Returning User (Login)

```
Client                          Server                          Redis           SendGrid
  |                               |                               |                |
  |-- POST /auth/send-otp ------->|                               |                |
  |   { email }                   |                               |                |
  |                               |-- Generate 4-digit OTP ------>|                |
  |                               |-- SET otp:{email} TTL 300s -->|                |
  |                               |-- Send OTP email -------------|--------------->|
  |<-- { message: "OTP sent" } ---|                               |                |
  |                               |                               |                |
  |-- POST /auth/verify-otp ----->|                               |                |
  |   { email, otp }             |-- GET otp:{email} ----------->|                |
  |                               |-- Compare OTP                 |                |
  |                               |-- DEL otp:{email} ---------->|                |
  |                               |-- Find user by email (MongoDB)                 |
  |                               |-- User exists → generate JWT                   |
  |<-- { token, user,            |                               |                |
  |      isNewUser: false } ------|                               |                |
```

### Flow: New User (Registration)

```
Client                          Server                          Redis           MongoDB
  |                               |                               |                |
  |  (same send-otp + verify-otp flow as above)                   |                |
  |                               |                               |                |
  |                               |-- User NOT found in MongoDB                    |
  |                               |-- Generate registration token (JWT, 10-min)    |
  |<-- { registrationToken,      |                               |                |
  |      isNewUser: true } -------|                               |                |
  |                               |                               |                |
  |-- POST /auth/register ------->|                               |                |
  |   (multipart form data)      |-- Verify registration token                    |
  |   registrationToken           |-- Validate: username unique?                   |
  |   username                    |-- Save profile image to disk                   |
  |   name                        |-- Create User in MongoDB -----|--------------->|
  |   dateOfBirth                 |-- Generate JWT                |                |
  |   profileImage (file)         |                               |                |
  |<-- { token, user } -----------|                               |                |
```

### Registration Token

The registration token is a short-lived JWT (10-minute expiry) containing only
`{ email, purpose: "registration" }`. It proves the email was OTP-verified
without granting access to protected resources. It is NOT the same as the
access token.

### Access Token (JWT)

- **Payload**: `{ userId, email, username }`
- **Secret**: `JWT_SECRET` environment variable
- **Expiry**: 24 hours
- **No refresh tokens** — user re-authenticates via OTP when the token expires.

### OTP Storage

OTPs are stored in Redis, NOT in the User model:

- **Key**: `otp:{email}`
- **Value**: JSON string `{ otp: "<hashed-4-digit>", createdAt: <timestamp> }`
- **TTL**: 300 seconds (5 minutes)
- OTP is hashed with bcrypt before storage.
- After successful verification, the key is deleted from Redis.

### File Responsibilities

| File | Responsibility |
|------|---------------|
| `auth.routes.js` | Define POST routes: `/send-otp`, `/verify-otp`, `/register` |
| `auth.controller.js` | Parse request, call service, format response |
| `auth.service.js` | Generate OTP, hash with bcrypt, store in Redis, send via SendGrid, verify OTP, generate JWT, create user |
| `auth.middleware.js` | Extract Bearer token from Authorization header, verify JWT, attach `req.user`, call `next()` |
| `config/sendgrid.js` | Initialize SendGrid client with API key |
| `upload.middleware.js` | Multer disk storage config for profile image |

---

## 6. MongoDB Architecture

### Connection Setup

**File: `src/config/database.js`**

```js
import mongoose from "mongoose";

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  // Log success or exit on failure
};

export default connectDB;
```

Following Maguz-API convention: a single exported `connectDB` function called
during server startup in `app.js`.

### Collections

Three collections, matching `PRODUCT_REQUIREMENTS.md`:

#### User

```js
{
  _id:            ObjectId (auto),
  username:       String, required, unique, trimmed, lowercased,
  name:           String, required, trimmed,
  email:          String, required, unique, trimmed, lowercased,
  dateOfBirth:    Date, required,
  profileImage:   String, default null   // relative file path in /uploads
}
// timestamps: true → createdAt, updatedAt
```

**Changes from PRODUCT_REQUIREMENTS.md**:
- `passwordHash` removed — passwordless OTP auth.
- `name`, `dateOfBirth`, `profileImage` added per owner decision.

**Indexes**:
- `email`: unique (for OTP lookup during login)
- `username`: unique (for registration validation)

#### Game

```js
{
  _id:            ObjectId (auto),
  whitePlayerId:  ObjectId, ref "User", required,
  blackPlayerId:  ObjectId, ref "User", required,
  winnerId:       ObjectId, ref "User", default null,
  status:         String, enum ["ACTIVE", "COMPLETED", "ABANDONED"], default "ACTIVE",
  result:         String, enum ["CHECKMATE", "RESIGNATION", "TIMEOUT", "DRAW", null], default null,
  startedAt:      Date, default Date.now,
  endedAt:        Date, default null,
  totalMoves:     Number, default 0,
  mode:           String, enum ["MULTIPLAYER", "BOT"], default "MULTIPLAYER"
}
// timestamps: true → createdAt, updatedAt
```

**Changes from PRODUCT_REQUIREMENTS.md**:
- `mode` added so bot games are distinguishable in history. It defaults to
  `MULTIPLAYER`, so existing documents and the matchmaking flow are unaffected.
- `WHITE_WIN` and `BLACK_WIN` removed from result enum. The winner is identified
  by `winnerId`. The result describes HOW the game ended (checkmate, resignation,
  timeout, draw), not WHO won. This avoids redundancy.
- `TIMEOUT` kept — used for the 30-second per-turn expiry.
- `ABANDONED` kept in status — used if Redis state is lost or unrecoverable.

**Indexes**:
- `{ whitePlayerId: 1, status: 1 }` — find active games for a user
- `{ blackPlayerId: 1, status: 1 }` — find active games for a user
- `{ whitePlayerId: 1, endedAt: -1 }` — history listing sorted by recency
- `{ blackPlayerId: 1, endedAt: -1 }` — history listing sorted by recency

#### Move

```js
{
  _id:            ObjectId (auto),
  gameId:         ObjectId, ref "Game", required, indexed,
  moveNumber:     Number, required,
  playerId:       ObjectId, ref "User", required,
  from:           String, required,        // e.g. "e2"
  to:             String, required,        // e.g. "e4"
  piece:          String, required,        // e.g. "p" (pawn)
  capturedPiece:  String, default null,    // e.g. "q" (queen)
  promotion:      String, default null,    // e.g. "q"
  notation:       String, default null     // e.g. "e4", "Nf3", "O-O"
}
// timestamps: true → createdAt (serves as move timestamp)
```

**Indexes**:
- `{ gameId: 1, moveNumber: 1 }` — retrieve moves for a game in order

### Persistence Flow

**On every validated move:**
1. Create a Move document in MongoDB.
2. Increment `Game.totalMoves` via `findOneAndUpdate`.

**On game end:**
1. Update Game document: `status`, `result`, `winnerId`, `endedAt`, `totalMoves`.

### History Retrieval

```
GET /api/v1/games
→ Find Game documents where whitePlayerId = userId OR blackPlayerId = userId
→ Filter by status = COMPLETED
→ Sort by endedAt DESC
→ Populate opponent username
→ Return paginated list

GET /api/v1/games/:gameId
→ Find Game document by _id
→ Verify requesting user is a participant
→ Find Move documents where gameId = :gameId, sort by moveNumber ASC
→ Return game + moves
```

### What Does NOT Go in MongoDB

- Active board state (that is Redis).
- Matchmaking queue (Redis).
- OTPs (Redis with TTL).
- Room codes (Redis with TTL).

---

## 7. Redis Architecture

### Connection Setup

**File: `src/config/redis.js`**

```js
import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
});

export default redis;
```

Single ioredis instance exported and imported where needed.

### Key Structure

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `otp:{email}` | String (JSON) | 300s | OTP for authentication |
| `game:{gameId}` | String (JSON) | None (deleted on game end) | Active game state |
| `matchmaking:queue` | List | None | FIFO matchmaking queue |
| `room:{code}` | String (JSON) | 600s (10 min) | Private room waiting for second player |
| `user:room:{userId}` | String | 600s (matches the room) | Reverse lookup — which room a user has open, so the server can cancel it without the client supplying the code |
| `user:active-game:{userId}` | String | None (deleted on game end) | Maps user to their active gameId |
| `user:online:{userId}` | String | None (deleted on disconnect) | Tracks online status + socketId |
| `lock:game:{gameId}` | String | 5s (safety TTL) | Per-game lock to serialize move processing |

### Active Game State

**Key**: `game:{gameId}`

```json
{
  "gameId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "whitePlayerId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "blackPlayerId": "64f1a2b3c4d5e6f7a8b9c0d3",
  "currentTurn": "white",
  "turnStartedAt": 1695000000000,
  "moveNumber": 1,
  "status": "ACTIVE",
  "lastMove": null
}
```

Bot games carry two extra fields, `"isBotGame": true` and
`"botPlayerId": "<bot user id>"`. Their absence is what marks a game as an
ordinary multiplayer game, so nothing about the multiplayer state changes.

**Why FEN instead of 2D array:**
chess.js natively uses FEN (Forsyth-Edwards Notation). FEN encodes the complete
board position, active color, castling rights, en passant target, halfmove clock,
and fullmove number in a single compact string. Storing FEN avoids converting
between representations on every move. The `PRODUCT_REQUIREMENTS.md` 2D array
is conceptually equivalent — FEN is the industry-standard serialization.

**`turnStartedAt`**: Unix timestamp (milliseconds) set by the backend when a
turn begins. Used to validate `moveTimeout` events — the backend calculates
elapsed time independently of the client.

### Per-Game Locking

The sequence `GET game state → validate move in chess.js → SET game state` is
**not atomic**. The Redis GET and SET are individual commands, but the chess
validation happens in Node.js between them. If two move requests for the same
game arrive near-simultaneously, both could GET the same state, both validate
against it, and both SET — causing one move to silently overwrite the other.

To prevent this, every active game has its own Redis lock:

```
lock:game:{gameId}
```

The lock is **per game**, not global. `lock:game:A` and `lock:game:B` are
independent. Two moves for different games can still be processed concurrently.
Only moves targeting the **same game** are serialized.

**Lock mechanism** (using Redis `SET NX EX`):

- `SET lock:game:{gameId} <value> NX EX 5`
  - `NX` — only set if the key does not already exist (acquire).
  - `EX 5` — 5-second safety TTL so the lock auto-expires if the holder
    crashes or hangs. Normal move processing completes in milliseconds.
- If the SET returns `null`, the lock is already held — the move request waits
  briefly and retries, or is rejected.
- After the operation completes (success or error), the lock is released by
  deleting the key: `DEL lock:game:{gameId}`.

**The lock must be released in a `finally` block** so that it is freed even if
chess validation throws, Redis SET fails, or MongoDB persistence errors out.

### Read/Write Flow (Per Move)

```
1. Acquire lock:game:{gameId}        → SET lock:game:{gameId} NX EX 5
2. Redis GET  game:{gameId}          → parse JSON → game state
3. Load FEN into chess.js            → validate move
4. chess.js produces new FEN         → serialize updated state
5. Redis SET  game:{gameId}          → updated JSON with new FEN, turn, turnStartedAt
6. Persist Move to MongoDB
7. Broadcast via Socket.IO
8. Release lock:game:{gameId}        → DEL lock:game:{gameId} (in finally block)
```

### Matchmaking Queue

**Key**: `matchmaking:queue` (Redis List)

- `RPUSH matchmaking:queue <userId>` — player joins queue.
- `LPOP matchmaking:queue` — next player is dequeued for matching.
- When player B joins and player A is already waiting:
  1. `LPOP` to get player A.
  2. Create game, assign random colors, initialize Redis game state.
  3. Notify both players via Socket.IO.

### Private Room Codes

**Key**: `room:{code}` (e.g., `room:X7K2M9`)

```json
{
  "creatorId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "createdAt": 1695000000000
}
```

A second key, `user:room:{userId}` → `code`, is written with the same TTL. The
room mapping is deliberately bidirectional: `room:{code}` answers "who owns this
code?" for a joiner, and `user:room:{userId}` answers "which code does this user
own?" for a cancel. Without the reverse key the server cannot cancel a room
unless the client still remembers the code, which fails after a reload.

- TTL: 600 seconds (10 minutes). If no one joins, the room expires.
- **One open room per user.** `createRoom` cancels the caller's previous room
  first, so old codes cannot accumulate or be joined after a new code is issued.
- When a second player joins with the code:
  1. `GET room:{code}` → get creator.
  2. `DEL room:{code}` and `DEL user:room:{creatorId}` → room consumed.
  3. Create game, assign random colors, initialize Redis game state.
- **Cancelling** (`cancelRoom`, or the creator disconnecting) deletes both keys.
  Deleting `room:{code}` is the whole invalidation: `joinRoom` already rejects a
  missing key, so a later join attempt gets "Room not found or expired". No
  separate revocation list or tombstone is needed.

### Expiration / Deletion Strategy

| Key | Deleted When |
|-----|-------------|
| `otp:{email}` | After successful verification, OR auto-expires after 300s |
| `game:{gameId}` | After game ends (checkmate, resignation, timeout, stalemate) |
| `room:{code}` | After second player joins, cancelled via `cancelRoom`, superseded by a new `createRoom`, creator disconnects, OR auto-expires after 600s |
| `user:room:{userId}` | Always deleted together with `room:{code}` |
| `user:active-game:{userId}` | After game ends. Never written for the bot user — the bot plays many games at once, so binding it to one would break the "one active game per user" rule. |
| `user:online:{userId}` | After socket disconnect |
| `lock:game:{gameId}` | Released (DEL) after move processing completes, OR auto-expires after 5s safety TTL |
| `matchmaking:queue` entries | Removed when matched or when player leaves queue |

### Reconnection Flow

```
Player reconnects
       |
       v
Socket.IO connection + JWT auth
       |
       v
GET user:active-game:{userId}
       |
       v
If gameId exists:
       |
       v
GET game:{gameId} from Redis
       |
       v
Rejoin Socket.IO room: game:{gameId}
       |
       v
Send full game state to reconnected client
       |
       v
Frontend synchronizes board
```

### What Does NOT Go in Redis

- User profiles (MongoDB).
- Completed game records (MongoDB).
- Move history (MongoDB).
- Any data that must survive a Redis restart.

---

## 8. Chess Engine Architecture

### Overview

The chess engine is a **wrapper module** around the `chess.js` library. It
provides a clean interface that the game service calls without coupling the rest
of the application to chess.js internals.

**File: `src/engine/chessEngine.js`**

### Responsibilities

| Responsibility | How |
|---------------|-----|
| Board representation | FEN string (managed by chess.js `Chess` instance) |
| Load game state | `new Chess(fen)` — reconstruct from Redis FEN |
| Move validation | `chess.move({ from, to, promotion })` — **throws** if illegal; the wrapper catches it and returns `{ valid: false }` |
| Turn validation | `chess.turn()` — returns "w" or "b" |
| Piece ownership | Check that the piece at `from` belongs to the current turn color |
| King safety | chess.js automatically rejects moves that leave the king in check |
| Check detection | `chess.inCheck()` after a move |
| Checkmate detection | `chess.isCheckmate()` after a move |
| Stalemate detection | `chess.isStalemate()` after a move |
| Castling validation | chess.js handles all 6 castling conditions internally |
| En passant | chess.js tracks en passant target via FEN |
| Pawn promotion | `chess.move({ from, to, promotion: "q" })` — validated by chess.js |
| Game-over detection | `chess.isGameOver()` — checks checkmate, stalemate, draw |
| FEN export | `chess.fen()` — returns updated FEN after a valid move |
| Move notation | `chess.move()` returns SAN notation (e.g., "Nf3", "O-O") |

### Interface

The chess engine module exports these functions:

```js
// Validate and apply a move. Returns result object or throws on invalid move.
validateAndApplyMove(fen, from, to, promotion)
→ {
    valid: true,
    newFen: "...",
    notation: "Nf3",
    piece: "n",
    capturedPiece: null | "p",
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isGameOver: false
  }

// Check whose turn it is.
getCurrentTurn(fen) → "w" | "b"

// Get the full board state for client sync (reconnection).
getGameStatus(fen) → { inCheck, isCheckmate, isStalemate, isGameOver, turn }

// Validate that a FEN string is valid.
isValidFen(fen) → boolean

// Every legal move for the side to move. Each promotion piece is a separate
// entry, so any entry can be played as-is. Empty at checkmate or stalemate.
getLegalMoves(fen) → [{ from, to, promotion }]
```

`getLegalMoves` is the engine's whole contribution to bot mode: it reports what
is legal, and the bot service decides which of those to play. Keeping the
*strategy* out of the engine means a stronger bot later is a change to one
function in `bot.service.js`, not to the chess wrapper.

### Integration With Game Service

```
Game Service (socket/gameHandler.js)
       |
       | validateAndApplyMove(currentFen, from, to, promotion)
       v
Chess Engine (engine/chessEngine.js)
       |
       | chess.js performs validation
       v
Returns { valid, newFen, notation, ... }  OR  throws ApiError
       |
       v
Game Service updates Redis with newFen
       |
       v
Game Service persists Move to MongoDB
       |
       v
Game Service broadcasts via Socket.IO
```

### Why chess.js Over Custom Implementation

1. **Correctness**: chess.js handles all FIDE rules including obscure edge cases
   (e.g., en passant discovered check, castling through attacked squares,
   promotion to underpromotion pieces). Implementing these from scratch is error-
   prone and time-consuming.
2. **FEN support**: Native FEN parsing and serialization — maps directly to our
   Redis storage format.
3. **SAN notation**: Automatically generates standard algebraic notation for the
   move history display.
4. **Maintenance**: Well-maintained open-source library with extensive test
   coverage.

**What chess.js does NOT handle (our responsibility):**
- Turn timer enforcement (30-second per-turn — our backend logic).
- Player identity verification (is this socket connection actually the player
  whose turn it is — our auth + game service logic).
- Redis state management.
- MongoDB persistence.
- Socket.IO broadcasting.
- Matchmaking.

---

## 9. Real-Time Architecture

### Socket.IO Server Setup

**File: `src/socket/index.js`**

Socket.IO is attached to the same HTTP server as Express (following Maguz-API
convention):

```js
import { createServer } from "http";
import { Server } from "socket.io";
import app from "../app.js";

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || "*" }
});
```

### Socket Authentication

**File: `src/socket/socketAuth.js`**

Socket.IO middleware that runs on every new connection:

```
Client connects with: { auth: { token: "<JWT>" } }
       |
       v
Middleware extracts token
       |
       v
jwt.verify(token, JWT_SECRET)
       |
       v
Find user in MongoDB by userId from payload
       |
       v
Attach user to socket: socket.user = { userId, username, email }
       |
       v
Store online status: SET user:online:{userId} = socketId
       |
       v
Check for active game: GET user:active-game:{userId}
       |
       v
If active game exists → auto-rejoin room, send current state
```

If authentication fails, the connection is rejected with an error event.

### Socket Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `joinQueue` | — | Add authenticated user to matchmaking FIFO queue |
| `leaveQueue` | — | Remove user from matchmaking queue |
| `createRoom` | — | Create private room, receive 6-char code |
| `cancelRoom` | — | Withdraw your open room, invalidating the code |
| `joinRoom` | `{ code }` | Join a private room by code |
| `makeMove` | `{ gameId, from, to, promotion? }` | Submit a chess move |
| `resign` | `{ gameId }` | Resign from active game |
| `moveTimeout` | `{ gameId }` | Report that the current player's 30s expired |
| `startBotGame` | — | Start a single-player game against the bot |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `queueJoined` | — | Confirmation: you are in the queue |
| `queueLeft` | — | Confirmation: you left the queue |
| `roomCreated` | `{ code }` | Room code for sharing |
| `roomCancelled` | `{ code }` | Your room was withdrawn; the code no longer works |
| `gameStarted` | `{ gameId, whitePlayerId, blackPlayerId, fen, yourColor, turnStartedAt }` | Game is ready, board initialized |
| `moveMade` | `{ gameId, from, to, piece, capturedPiece, promotion, notation, fen, moveNumber, currentTurn, isCheck, turnStartedAt }` | Valid move broadcast to both players |
| `moveRejected` | `{ gameId, reason }` | Move was invalid (sent only to the submitter) |
| `gameEnded` | `{ gameId, status, result, winnerId }` | Game is over — broadcast to both players |
| `opponentDisconnected` | `{ gameId }` | Opponent's socket disconnected |
| `opponentReconnected` | `{ gameId }` | Opponent reconnected |
| `gameState` | `{ gameId, fen, currentTurn, moveNumber, turnStartedAt, status, whitePlayerId, blackPlayerId }` | Full state sent on reconnection |
| `error` | `{ message }` | Generic error |

### Move Event Flow

```
Client (White)                    Server                           Redis          MongoDB
     |                              |                                |               |
     |-- makeMove ----------------->|                                |               |
     |   { gameId, from:"e2",      |                                |               |
     |     to:"e4" }               |                                |               |
     |                              |-- Acquire lock:game:{gameId} ->|               |
     |                              |   (SET NX EX 5)               |               |
     |                              |<-- lock acquired --------------|               |
     |                              |                                |               |
     |                              |-- GET game:{gameId} ---------->|               |
     |                              |<-- game state (JSON) ---------|               |
     |                              |                                |               |
     |                              |-- Validate:                    |               |
     |                              |   1. Is game ACTIVE?           |               |
     |                              |   2. Is it this player's turn? |               |
     |                              |   3. Is it within 30 seconds?  |               |
     |                              |   4. chess.js: is move legal?  |               |
     |                              |                                |               |
     |                              |-- If valid:                    |               |
     |                              |   Update state with new FEN    |               |
     |                              |   Set new turnStartedAt        |               |
     |                              |-- SET game:{gameId} ---------->|               |
     |                              |-- Create Move document --------|-------------->|
     |                              |-- Update Game.totalMoves ------|-------------->|
     |                              |                                |               |
     |                              |-- Release lock:game:{gameId} ->|               |
     |                              |   (DEL, in finally block)     |               |
     |                              |                                |               |
     |<-- moveMade (broadcast) -----|                                |               |
     |                              |-- moveMade (to Black) -------->               |
     |                              |                                |               |
     |                              |-- If checkmate/stalemate:      |               |
     |                              |   Update Game document --------|-------------->|
     |                              |   DEL game:{gameId} ---------->|               |
     |                              |   DEL user:active-game:* ----->|               |
     |                              |-- gameEnded (broadcast) ------>               |
```

### moveTimeout Event Flow

```
Client (whose turn it is NOT)      Server                           Redis
     |                              |                                |
     |  (or the timed-out client    |                                |
     |   itself can send this)      |                                |
     |                              |                                |
     |-- moveTimeout { gameId } --->|                                |
     |                              |-- GET game:{gameId} ---------->|
     |                              |<-- game state -----------------|
     |                              |                                |
     |                              |-- Calculate elapsed time:      |
     |                              |   now - turnStartedAt          |
     |                              |                                |
     |                              |-- If elapsed >= 30000ms:       |
     |                              |   Determine timed-out player   |
     |                              |   Set winnerId = opponent      |
     |                              |   result = TIMEOUT             |
     |                              |   Persist to MongoDB           |
     |                              |   DEL game:{gameId}            |
     |                              |   DEL user:active-game:*       |
     |                              |-- gameEnded (broadcast) ------>|
     |                              |                                |
     |                              |-- If elapsed < 30000ms:        |
     |                              |   Ignore (not yet timed out)   |
```

### Disconnect / Reconnect Flow

```
Player disconnects (socket close)
       |
       v
Server detects disconnect
       |
       v
DEL user:online:{userId}
       |
       v
Check user:active-game:{userId}
       |
       v
If active game:
       |
       v
Emit opponentDisconnected to game room
       |
       v
Game state STAYS in Redis (no cleanup)
       |
       v
Turn timer continues — if it's the disconnected
player's turn, they have until 30s expires

--- Later ---

Player reconnects (new socket + JWT)
       |
       v
Socket auth middleware
       |
       v
SET user:online:{userId} = new socketId
       |
       v
GET user:active-game:{userId}
       |
       v
If gameId exists:
       |
       v
socket.join(game:{gameId})
       |
       v
GET game:{gameId} from Redis
       |
       v
Emit gameState to reconnected player
       |
       v
Emit opponentReconnected to game room
```

---

## 10. API Structure

### REST Endpoints

All routes prefixed with `/api/v1`.

#### Auth Routes (public — no auth middleware)

| Method | Route | Body / Params | Response | Purpose |
|--------|-------|---------------|----------|---------|
| POST | `/auth/send-otp` | `{ email }` | `{ message: "OTP sent" }` | Generate + send 4-digit OTP |
| POST | `/auth/verify-otp` | `{ email, otp }` | `{ token?, registrationToken?, user?, isNewUser }` | Verify OTP, return JWT or registration token |
| POST | `/auth/register` | multipart: `registrationToken, username, name, dateOfBirth, profileImage` | `{ token, user }` | Complete new user registration |

#### User Routes (protected — auth middleware required)

| Method | Route | Body / Params | Response | Purpose |
|--------|-------|---------------|----------|---------|
| GET | `/users/me` | — | `{ user }` | Get authenticated user's profile |
| PUT | `/users/me` | `{ name?, dateOfBirth? }` | `{ user }` | Update profile fields |
| PUT | `/users/me/profile-image` | multipart: `profileImage` | `{ user }` | Update profile image |

#### Game Routes (protected — auth middleware required)

| Method | Route | Body / Params | Response | Purpose |
|--------|-------|---------------|----------|---------|
| GET | `/games` | query: `page, limit` | `{ games: [...], pagination }` | List authenticated user's completed games |
| GET | `/games/:gameId` | param: `gameId` | `{ game, moves }` | Get game detail with full move history |

#### Controller / Service Responsibility Split

| Layer | Does | Does NOT |
|-------|------|----------|
| **Controller** | Parse `req`, validate input shape, call service, format response with `ApiResponse` / `ApiError` | Contain business logic, access DB directly, access Redis |
| **Service** | Business logic, DB queries (Mongoose), Redis operations | Format HTTP responses, access `req`/`res` |

---

## 11. Game Lifecycle

### Complete Lifecycle

```
 1. User authenticates
          |
          v
 2. User connects via Socket.IO (JWT in handshake)
          |
          v
 3. Server stores online status in Redis
          |
          v
 4. User requests matchmaking:
          |
          +--- joinQueue (auto-match)
          |         |
          |         v
          |    Added to matchmaking:queue (Redis list)
          |         |
          |         v
          |    If queue has another player:
          |         |
          |         v
          |    LPOP + pair
          |
          +--- createRoom (private)
          |         |
          |         v
          |    Generate 6-char code
          |    Store in room:{code} (Redis, 10-min TTL)
          |    Emit roomCreated { code } to creator
          |         |
          |         v
          |    Second player: joinRoom { code }
          |         |
          |         v
          |    GET room:{code}, DEL room:{code}
          |    Pair both players
          |
          v
 5. Assign colors randomly
          |
          v
 6. Create Game document in MongoDB (status: ACTIVE)
          |
          v
 7. Initialize Redis game state:
    SET game:{gameId} = { gameId, fen (starting position), whitePlayerId,
        blackPlayerId, currentTurn: "white", turnStartedAt: now,
        moveNumber: 1, status: "ACTIVE", lastMove: null }
          |
          v
 8. SET user:active-game:{whitePlayerId} = gameId
    SET user:active-game:{blackPlayerId} = gameId
          |
          v
 9. Both players join Socket.IO room: game:{gameId}
          |
          v
10. Emit gameStarted to both players with gameId, FEN, assigned color,
    turnStartedAt
          |
          v
11. Gameplay loop:
    a. Current player submits makeMove { gameId, from, to, promotion? }
    b. Server: GET Redis state → chess engine validates → if valid:
       - Update FEN in Redis
       - Set new turnStartedAt
       - Create Move in MongoDB
       - Increment Game.totalMoves
       - Emit moveMade to room
       - Check game-over conditions
    c. If invalid: emit moveRejected to submitter only
    d. If 30s pass without a move: frontend sends moveTimeout
       - Server validates elapsed time ≥ 30s
       - End game with result = TIMEOUT
          |
          v
12. Game-end detected (checkmate, stalemate, resignation, timeout):
    a. Update Game document in MongoDB:
       - status = COMPLETED
       - result = CHECKMATE | DRAW | RESIGNATION | TIMEOUT
       - winnerId = winner (or null for DRAW)
       - endedAt = now
       - totalMoves = final count
    b. DEL game:{gameId} from Redis
    c. DEL user:active-game:{whitePlayerId}
    d. DEL user:active-game:{blackPlayerId}
    e. Emit gameEnded to room
    f. Both sockets leave the room
          |
          v
13. Frontend shows end state for 30 seconds (per product requirement)
          |
          v
14. User can later view history:
    GET /api/v1/games → list of completed games
    GET /api/v1/games/:gameId → game + moves
```

---

## 12. Edge Cases

### Chess Rule Edge Cases

| Edge Case | Behavior | Handled By |
|-----------|----------|------------|
| **Wrong turn** | White submits move during Black's turn. Move rejected. | Game handler checks `currentTurn` vs `socket.user.userId` mapping to `whitePlayerId` / `blackPlayerId`. |
| **Invalid move** | e.g., pawn e2 → e5. Move rejected. | chess.js `move()` returns null for illegal moves. |
| **Moving opponent's piece** | White tries to move a Black piece. Move rejected. | chess.js enforces turn-based piece ownership. Additionally, our handler verifies the submitting player matches `currentTurn`. |
| **Move exposes own king** | Pinned piece tries to move. Move rejected. | chess.js automatically rejects moves that leave the king in check. |
| **Check** | After a valid move, opponent king is attacked. Game continues with check state. | chess.js `inCheck()` — include `isCheck: true` in `moveMade` event. |
| **Checkmate** | Opponent king in check + no legal moves. Game ends. | chess.js `isCheckmate()` → trigger game-end flow. `result = CHECKMATE`. |
| **Stalemate** | Opponent not in check + no legal moves. Game ends as draw. | chess.js `isStalemate()` → trigger game-end flow. `result = DRAW`, `winnerId = null`. |
| **Castling** | King + rook move. All 6 FIDE conditions must hold. | chess.js validates all castling conditions internally (king/rook not moved, squares clear, no check through). |
| **En passant** | Pawn captures passing pawn. Requires knowledge of previous move. | chess.js tracks en passant target square via FEN. |
| **Promotion** | Pawn reaches 8th rank. Must specify promotion piece. | Client sends `promotion: "q"` (or n/r/b). chess.js validates. If promotion is required but not provided → move rejected. |
| **Resignation** | Player sends resign event. Opponent wins immediately. | Game handler: `result = RESIGNATION`, `winnerId = opponent`. |

### Timer Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| **moveTimeout before 30s** | Backend calculates actual elapsed time from `turnStartedAt`. If < 30000ms, event is ignored. |
| **moveTimeout after valid move** | If a move was already made (turn changed), the timeout is for the previous turn and is ignored because `currentTurn` and `turnStartedAt` already advanced. |
| **Both clients send moveTimeout** | First valid one processes the game end. Second one sees game is no longer ACTIVE and is ignored. |

### Connection Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| **Player disconnects during own turn** | `opponentDisconnected` emitted. Turn timer continues. If 30s expire without reconnection + move, opponent can trigger `moveTimeout`. |
| **Player disconnects during opponent's turn** | `opponentDisconnected` emitted. No timer impact. Game continues normally when disconnected player reconnects. |
| **Both players disconnect** | Redis state preserved. Turn timer still applies conceptually — when either reconnects, if 30s+ elapsed on the current turn, the game can be ended via `moveTimeout`. |
| **Reconnection** | Socket auth → check `user:active-game:{userId}` → rejoin room → receive `gameState` event with full Redis state. |
| **Missing Redis state on reconnect** | If `game:{gameId}` key is missing (e.g., Redis restart), check MongoDB for game status. If ACTIVE in MongoDB but missing in Redis, mark game as ABANDONED in MongoDB. Notify player. |

### Bot Mode Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| **Bot is assigned white** | The bot must move before the player can. `startBotGame` plays its opening move immediately after emitting `gameStarted`, under the game lock. |
| **Player's move ends the game** | Checkmate/stalemate is settled first; the bot is never asked for a reply in a finished game, so it can never be asked for a move it does not have. |
| **Bot has no legal move** | Impossible in normal flow — no legal moves means checkmate or stalemate, which is settled before the bot's turn. Logged as an error if it ever occurs, and the game is left untouched rather than corrupted. |
| **Player already in a game** | `startBotGame` is rejected with "You are already in an active game" — bot games use the same `user:active-game:{userId}` key as multiplayer. |
| **Player is queued, then starts a bot game** | The player is removed from `matchmaking:queue` so they cannot be matched with a human while playing the bot. |
| **Player resigns a bot game** | The bot is recorded as `winnerId`, using the existing resignation path unchanged. |
| **Player's turn times out** | The player loses on time to the bot, using the existing timeout path unchanged. |
| **Bot's turn appears to time out** | The bot never forfeits on time. If its turn is somehow still pending (a persistence error cut its reply short), `moveTimeout` replays the bot's turn instead of awarding the player an unearned win. |
| **Player disconnects mid bot game** | State stays in Redis exactly as for multiplayer. On reconnect the player rejoins `game:{gameId}` and receives `gameState`, which includes `isBotGame` and `botPlayerId`. `opponentDisconnected` reaches nobody, since the bot has no socket. |
| **Many players vs the bot at once** | Each game is independent: the bot has no `user:active-game` key, and locks are per game. |

### Matchmaking Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| **Player in active game tries to join queue** | Rejected. Check `user:active-game:{userId}` before allowing queue join. A bot game counts as an active game. |
| **Player disconnects while in queue** | On disconnect, remove user from `matchmaking:queue`. |
| **Player joins queue then goes offline** | Same as above — socket disconnect triggers queue removal. |
| **Room code expires** | Redis TTL (10 min) auto-deletes the key. Creator is notified via `error` event if they're still connected. |
| **Creator cancels the room** | `cancelRoom` deletes `room:{code}` and `user:room:{userId}`, and emits `roomCancelled`. Any later join attempt hits the existing missing-key path and is rejected. |
| **Cancel with no open room** | `cancelRoom` returns null; `error: "You have no open room to cancel"`. Cancelling twice is a safe no-op, not an error. |
| **Creator disconnects while waiting** | The room is cancelled on `disconnect`, next to the existing `leaveQueue` cleanup. Without this the code stayed joinable for up to 10 minutes and could match someone into a game against an absent opponent. |
| **Creator clicks Create Room repeatedly** | Each `createRoom` cancels the previous room first, so exactly one code is live per user. |
| **Someone joins a cancelled code** | `GET room:{code}` returns null → `error: "Room not found or expired"` — the same path as an expired or already-used code. |
| **Invalid room code** | `GET room:{code}` returns null. Emit `error` to joining player. |
| **Player tries to join own room** | Rejected. Check `creatorId !== joiningUserId`. |

### General Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| **Duplicate move request** | After a valid move, `currentTurn` changes and `moveNumber` increments. A duplicate of the same move would fail turn validation (it's no longer that player's turn). |
| **Move on ended game** | `status !== "ACTIVE"` check. Move rejected with "game already ended." |
| **Invalid/expired JWT on socket** | Socket auth middleware rejects connection. |
| **Invalid/expired JWT on HTTP** | Auth middleware returns 401. |
| **Concurrent move submissions** | The `GET → validate → SET` sequence is NOT atomic — chess validation runs in Node.js between the Redis commands. A per-game Redis lock (`lock:game:{gameId}`) serializes all move processing for the same game. The second request waits for or fails to acquire the lock, then reads the already-updated state and fails turn validation. Different games are unaffected — locks are per game. |

---

## 13. Error Handling

### Error Response Format

Following Maguz-API convention, all errors use the `ApiError` class:

```js
{
  success: false,
  statusCode: 400,
  message: "Invalid move: pawn cannot move from e2 to e5",
  error: null  // optional additional detail
}
```

### Error Categories

#### Authentication Errors (HTTP)

| Scenario | Status | Message |
|----------|--------|---------|
| Missing email in send-otp | 400 | "Email is required" |
| Invalid email format | 400 | "Invalid email format" |
| OTP expired or not found | 400 | "OTP expired or invalid" |
| Incorrect OTP | 400 | "Incorrect OTP" |
| Invalid registration token | 401 | "Invalid or expired registration token" |
| Username already taken | 409 | "Username already taken" |
| Missing Authorization header | 401 | "Authentication required" |
| Invalid/expired JWT | 401 | "Invalid or expired token" |

#### Game History Errors (HTTP)

| Scenario | Status | Message |
|----------|--------|---------|
| Game not found | 404 | "Game not found" |
| User not a participant | 403 | "You are not a participant in this game" |
| Invalid gameId format | 400 | "Invalid game ID" |

#### Socket Errors

Socket errors are emitted as `moveRejected` (for move-specific errors) or
`error` (for general errors) events to the specific client.

| Scenario | Event | Reason |
|----------|-------|--------|
| Not your turn | `moveRejected` | "It is not your turn" |
| Illegal move | `moveRejected` | "Illegal move" |
| Promotion required | `moveRejected` | "Promotion piece is required" |
| Game not active | `moveRejected` | "Game is not active" |
| Game not found in Redis | `error` | "Game state not found" |
| Already in a game | `error` | "You are already in an active game" |
| Already in queue | `error` | "You are already in the matchmaking queue" |
| Invalid room code | `error` | "Room not found or expired" |
| Cannot join own room | `error` | "Cannot join your own room" |

#### Redis Failure

If Redis is unreachable during a game operation:

1. Log error with Winston.
2. Emit `error` event to the client: "Server error. Please try again."
3. Do NOT update MongoDB with a guess — wait for Redis to recover.

#### MongoDB Failure

If MongoDB write fails after a validated move:

1. The Redis state is already updated (game continues in real-time).
2. Log the MongoDB failure as a critical error.
3. Retry the write (move creation) once.
4. If retry fails, log for manual reconciliation. The game continues — Redis
   is the real-time source of truth. Move persistence can be reconciled later.

### Error Middleware

**File: `src/middlewares/error.middleware.js`**

Express global error handler (following Maguz-API pattern):

```js
const errorMiddleware = (err, req, res, next) => {
  logger.error(err.stack);
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";
  res.status(statusCode).json({ success: false, statusCode, message });
};
```

---

## 14. Implementation Order

### Phase 1 — Project Foundation

**Goal**: Runnable Express server with environment configuration.

**Files to create**:
- `src/index.js` — Entry point, starts HTTP server
- `src/app.js` — Express app setup, middleware registration, route mounting
- `src/utils/ApiResponse.js` — Success response class
- `src/utils/ApiError.js` — Error class with statusCode
- `src/utils/logger.js` — Winston logger
- `src/utils/enums.js` — GameStatus, GameResult constants
- `src/middlewares/error.middleware.js` — Global error handler
- `.env` — Environment variables template
- `.env.example` — Documented env var reference

**Files to modify**:
- `package.json` — Add `"start"` and `"dev"` scripts
- `.gitignore` — Ensure `uploads/`, `.env` are listed

**Dependencies**: None new (Express, helmet, cors, dotenv, winston already installed).

**Result**: `npm run dev` starts a server that responds to requests.

---

### Phase 2 — MongoDB + User Model

**Goal**: MongoDB connected, User model defined and operational.

**Files to create**:
- `src/config/database.js` — Mongoose connection
- `src/modules/user/user.model.js` — User schema
- `src/modules/user/user.service.js` — findByEmail, findById, create, update
- `src/modules/user/index.js` — Re-exports

**Dependencies**: None new (Mongoose already installed).

**Prereqs**: Phase 1 complete.

**Result**: Server connects to MongoDB on startup. User model can be imported
and used.

---

### Phase 3 — Authentication

**Goal**: Complete OTP-based auth flow working end-to-end.

**Files to create**:
- `src/config/redis.js` — ioredis client
- `src/config/sendgrid.js` — SendGrid client initialization
- `src/modules/auth/auth.service.js` — OTP generation/hashing, Redis storage, SendGrid send, OTP verification, JWT generation, registration logic
- `src/modules/auth/auth.controller.js` — send-otp, verify-otp, register handlers
- `src/modules/auth/auth.routes.js` — POST routes
- `src/modules/auth/index.js` — Re-exports router
- `src/middlewares/auth.middleware.js` — JWT verification for protected routes
- `src/middlewares/upload.middleware.js` — Multer config for profile image
- `src/modules/index.js` — Route aggregator

**Files to modify**:
- `src/app.js` — Mount `/api/v1` routes

**Dependencies to install**: `ioredis`, `@sendgrid/mail`, `multer`

**Prereqs**: Phase 2 complete (User model needed for registration).

**Result**: Full auth flow works: send OTP → verify → register (new user) or
receive JWT (existing user). Protected routes reject unauthenticated requests.

---

### Phase 4 — User Profile Endpoints

**Goal**: Authenticated users can view and update their profile.

**Files to create**:
- `src/modules/user/user.controller.js` — getMe, updateMe, uploadProfileImage
- `src/modules/user/user.routes.js` — GET/PUT routes
- Create `src/uploads/` directory (gitignored)

**Prereqs**: Phase 3 complete (auth middleware needed).

**Result**: `GET /users/me`, `PUT /users/me`, `PUT /users/me/profile-image` all
work with JWT auth.

---

### Phase 5 — Game + Move Models

**Goal**: Game and Move models defined, services operational.

**Files to create**:
- `src/modules/game/game.model.js` — Game schema with indexes
- `src/modules/game/game.service.js` — create, findById, update, listByUser
- `src/modules/game/index.js` — Re-exports
- `src/modules/move/move.model.js` — Move schema with indexes
- `src/modules/move/move.service.js` — create, findByGameId
- `src/modules/move/index.js` — Re-exports

**Dependencies**: None new.

**Prereqs**: Phase 2 complete.

**Result**: Game and Move documents can be created and queried.

---

### Phase 6 — Chess Engine

**Goal**: Chess engine wrapper fully functional and independently testable.

**Files to create**:
- `src/engine/chessEngine.js` — chess.js wrapper with exported functions

**Dependencies to install**: `chess.js`

**Prereqs**: None (standalone module).

**Result**: `validateAndApplyMove(fen, from, to, promotion)` correctly validates
all chess rules and returns the new FEN + move metadata.

---

### Phase 7 — Socket.IO Foundation + Matchmaking

**Goal**: Socket.IO server running, authenticated connections, matchmaking
operational (both queue and room code).

**Files to create**:
- `src/socket/index.js` — Socket.IO server setup, handler registration
- `src/socket/socketAuth.js` — JWT middleware for socket connections
- `src/socket/matchmakingHandler.js` — joinQueue, leaveQueue, createRoom, joinRoom handlers
- `src/modules/matchmaking/matchmaking.service.js` — Queue operations, room code generation, pairing logic, random color assignment
- `src/modules/matchmaking/index.js` — Re-exports

**Files to modify**:
- `src/index.js` — Use the HTTP server from socket setup instead of `app.listen`

**Dependencies**: None new (Socket.IO already installed).

**Prereqs**: Phase 3 (Redis), Phase 5 (Game model), Phase 6 (chess engine for
initial FEN).

**Result**: Two authenticated socket clients can be matched (via queue or room
code), a Game is created in MongoDB, Redis state is initialized, both clients
receive `gameStarted` with their assigned color.

---

### Phase 8 — Real-Time Gameplay

**Goal**: Complete move flow — submit, validate, persist, broadcast. Game-end
detection. Turn timer. Resignation.

**Files to create**:
- `src/socket/gameHandler.js` — makeMove, resign, moveTimeout, disconnect/reconnect handlers

**Prereqs**: Phase 7 complete (socket + matchmaking + Redis game state).

**Result**: Two players can play a full chess game in real-time. Moves are
validated, broadcast, and persisted. Checkmate, stalemate, resignation, and
timeout correctly end the game. Disconnect/reconnect works. Redis state is
cleaned up on game end.

---

### Phase 9 — Game History Endpoints

**Goal**: REST endpoints for viewing past games and their moves.

**Files to create**:
- `src/modules/game/game.controller.js` — listMyGames, getGameDetail
- `src/modules/game/game.routes.js` — GET routes

**Files to modify**:
- `src/modules/index.js` — Add game routes

**Prereqs**: Phase 8 complete (games must end and persist for history to exist).

**Result**: `GET /games` returns paginated completed games. `GET /games/:gameId`
returns game + ordered moves. Frontend can display the move-by-move history.

---

### Phase 10 — Integration Testing + Hardening

**Goal**: End-to-end validation of all flows, edge case coverage.

**Work**:
- Test complete auth flow (send OTP → verify → register → JWT).
- Test matchmaking (queue + room code) with two socket clients.
- Test full game (moves → checkmate/stalemate/resignation/timeout).
- Test reconnection flow.
- Test edge cases: duplicate moves, wrong turn, invalid moves, expired OTP,
  expired room code, player already in game, etc.
- Test Redis failure handling (game state missing).
- Verify MongoDB indexes are created.
- Verify Redis keys are cleaned up after game end.
- Load test with multiple concurrent games.

**Prereqs**: All previous phases complete.

**Result**: All documented flows and edge cases verified working.

---

### Phase 11 — Play Against Bot

**Goal**: Single-player mode against a bot that plays random legal moves,
reusing the existing move pipeline end to end.

**Files to create**:
- `src/modules/bot/bot.service.js` — bot user seeding, bot game creation, move choice
- `src/modules/bot/index.js` — Re-exports
- `src/socket/botHandler.js` — `startBotGame` handler
- `src/socket/gameLock.js` — per-game lock, extracted so both handlers share it

**Files to modify**:
- `src/engine/chessEngine.js` — add `getLegalMoves`
- `src/utils/enums.js` — add `GameMode`
- `src/modules/game/game.model.js` — add `mode`
- `src/socket/gameHandler.js` — share one move pipeline; play the bot's reply
- `src/socket/index.js` — register `botHandler`

**Dependencies**: None new.

**Prereqs**: Phase 8 complete (the move pipeline the bot reuses).

**Result**: A player can start a bot game, play it to checkmate, stalemate,
resignation or timeout, and see it in their history. Multiplayer is unchanged.

**Verified**: both color assignments; the bot opening when it holds white; one
`makeMove` persisting exactly two `Move` documents with contiguous, strictly
alternating move numbers; `Game.totalMoves` matching the persisted count;
checkmate settling with the correct winner and clearing Redis; resignation
naming the bot as winner; out-of-turn and illegal moves rejected without the bot
replying; and ~9,000 plies of random play without a single illegal bot move.

---

## 15. Play Against Bot

### Goal

A single-player mode where the opponent is a server-side bot. For v1 the bot
only has to play a **legal** move — it is deliberately not a strong engine.

### Guiding Constraint

Bot mode reuses the existing chess/game infrastructure and adds nothing
operational. No queues, no workers, no separate service, no Stockfish, no
external chess API, no extra Redis structures. The bot's reply is computed
inline, in the same function call that processed the player's move.

### Why the Bot Is a Real User Document

`Game.whitePlayerId`, `Game.blackPlayerId` and `Move.playerId` are all
`required` ObjectId refs to `User`. The bot is therefore seeded as one ordinary
`User` document:

| Field | Value |
|-------|-------|
| `username` | `checkmate_bot` |
| `name` | `Checkmate Bot` |
| `email` | `bot@checkmate.local` |
| `dateOfBirth` | epoch |

The alternative — making the player id fields nullable and adding a `botColor` —
would have forced changes to the schema, every history query, both `populate`
chains, the participant check in `getGameDetail`, and the resignation and
timeout winner logic. Seeding one document instead means **every existing path
works on bot games unmodified**: moves persist, history populates the bot as the
opponent, resignation and timeout name it as the winner.

The document is created lazily on the first bot game via an atomic upsert keyed
on email, so concurrent first-time requests cannot create duplicates, and the
id is cached in memory afterwards.

### Ownership of Bot State

```
Redis  game:{gameId}                 + isBotGame, botPlayerId
       user:active-game:{humanId}      set for the human only
       lock:game:{gameId}              unchanged, now also covers the bot's reply

Mongo  Game.mode = "BOT"
       Move documents for the bot, with playerId = the bot user
```

The bot deliberately has **no** `user:active-game` key. It plays an unbounded
number of games simultaneously, so binding it to one game would make the second
player's game unstartable.

### Move Selection

```
current FEN
      |
      v
chessEngine.getLegalMoves(fen)      <- chess.js generates every legal move
      |
      v
botService.selectMove(...)          <- uniformly random pick
      |
      v
chessEngine.validateAndApplyMove()  <- the same validation a human move gets
      |
      v
Redis SET -> Mongo Move -> broadcast moveMade
```

The bot's move is validated by the same function as a player's move. The bot is
not trusted more than a client is. Because chess.js both generated and validated
the move from the same position, it cannot be illegal; if validation ever
failed, it is logged and the game is left untouched rather than corrupted.

Promotions are handled for free: chess.js emits each promotion piece as a
separate legal move, so a randomly chosen promotion always carries a valid
piece.

### Turn Flow

```
Player                     Server                        Redis        Mongo
  |                          |                             |            |
  |-- startBotGame --------->|                             |            |
  |                          |-- seed/lookup bot user -----|----------->|
  |                          |-- random colors             |            |
  |                          |-- Game(mode: BOT) ----------|----------->|
  |                          |-- SET game:{id} (+isBotGame)|            |
  |                          |-- SET user:active-game:human|            |
  |<-- gameStarted ----------|                             |            |
  |                          |                             |            |
  |   (if the bot is white, it opens here, under the lock) |            |
  |<-- moveMade (bot) -------|                             |            |
  |                          |                             |            |
  |-- makeMove ------------->|                             |            |
  |                          |-- acquire lock:game:{id} -->|            |
  |                          |-- validate turn + timer     |            |
  |                          |-- validate move (chess.js)  |            |
  |                          |-- SET game, Move, totalMoves|----------->|
  |<-- moveMade (player) ----|                             |            |
  |                          |-- game over? --> gameEnded  |            |
  |                          |-- else: bot replies         |            |
  |                          |   select + apply + persist -|----------->|
  |<-- moveMade (bot) -------|                             |            |
  |                          |-- game over? --> gameEnded  |            |
  |                          |-- release lock (finally) -->|            |
```

### Why the Bot Moves Inside the Player's Lock

The player's move and the bot's reply are applied inside a single
`lock:game:{gameId}` critical section. That makes the pair atomic: no other
request can observe a position where the player has moved but the bot has not,
and the existing `finally` release covers both. It also needs no new locking
primitive — only the extraction of `acquireLock` / `releaseLock` into
`socket/gameLock.js` so `botHandler` can reuse them for the bot's opening move.

### Shared Move Pipeline

`gameHandler.js` was factored into three internal helpers so the player's move
and the bot's move run the *same* code rather than two parallel copies:

| Helper | Responsibility |
|--------|---------------|
| `applyMove(...)` | Validate, mutate Redis state, persist the `Move`, increment `totalMoves`, broadcast `moveMade` |
| `settleIfGameOver(...)` | End the game on checkmate or stalemate; returns whether it ended |
| `playBotTurn(...)` | Choose the bot's move and run it through the two helpers above |

The player's path is unchanged in behaviour and ordering — it now just calls the
helpers. Multiplayer games never reach `playBotTurn`, because it returns
immediately unless `isBotGame` is set and the side to move is the bot.

### What Was Deliberately Not Done

- **No difficulty levels.** v1 is a single random-move bot.
- **No artificial "thinking" delay.** The bot replies instantly; pacing is a
  frontend concern.
- **No new draw conditions.** Games still end only on checkmate, stalemate,
  resignation or timeout, per the existing product rules. A random bot reaches
  dead-drawn material more often than a human would, and such a game runs until
  the player resigns or a turn times out. Adding insufficient-material or
  repetition draws would change the rules for multiplayer too, so it is left as
  a separate decision.
- **No REST endpoint.** Game creation is a socket event, consistent with
  `joinQueue` and `joinRoom`. History is already covered by `GET /games`.

---

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

# MongoDB
MONGO_URI=mongodb://localhost:27017/checkmate

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-jwt-secret-here
REGISTRATION_TOKEN_SECRET=your-reg-token-secret-here

# SendGrid
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@checkmate.com

# Game Config
TURN_TIMEOUT_MS=30000
ROOM_CODE_TTL_SECONDS=600
OTP_TTL_SECONDS=300
```

---

## Summary of Decisions

| Decision | Chosen | Rejected |
|----------|--------|----------|
| Auth | Passwordless OTP (SendGrid) | Password-based, OAuth |
| Color assignment | Always random | Player choice |
| Chess clocks | 30s per-turn (timestamp-based) | Cumulative timers, no timers |
| Chess engine | chess.js (wrapped) | Custom implementation |
| Board format in Redis | FEN string | 2D array |
| Draw conditions | Stalemate only | Draw offers, repetition, 50-move |
| Matchmaking | FIFO queue + room codes | Lobby system |
| Concurrent games | One per user | Multiple |
| Refresh tokens | None | Refresh token rotation |
| Module pattern | Standalone per module | Base class inheritance |
| Module system | ES modules (import/export) | CommonJS (require) |
| Redis client | ioredis | node-redis |
| Abandonment | Handled by 30s turn timer | Separate disconnect timer |
| Room codes | 6-char alphanumeric | UUID, word-based |
| OTP | 4-digit, 5-min, Redis-stored | 6-digit, DB-stored |
| Profile image | Multer disk upload | URL only, GridFS, Cloudinary |
| Bot opponent identity | A seeded `User` document | Nullable player ids, a synthetic non-user id |
| Bot move strategy (v1) | Uniformly random legal move | Minimax, evaluation heuristics, Stockfish, external APIs |
| Bot execution | Inline, inside the mover's existing game lock | Queues, workers, a separate bot service, Kafka |
| Bot game creation | Dedicated `startBotGame` socket event | Reusing the matchmaking queue or room codes |
