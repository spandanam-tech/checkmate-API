# Checkmate API — Endpoints & Responses

All REST routes are prefixed with `/api/v1`.
Socket.IO events use the same server on the same port.

---

## Health Check

```
GET /health
```

**Auth**: None

**Response** `200`
```json
{
  "success": true,
  "message": "Checkmate API is running"
}
```

---

## Authentication

### Send OTP

```
POST /api/v1/auth/send-otp
```

**Auth**: None

**Request Body**
```json
{
  "email": "player@example.com"
}
```

**Response** `200`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP sent to your email",
  "data": null
}
```

**Errors**
| Status | Message |
|--------|---------|
| 400 | Email is required |
| 400 | Invalid email format |
| 500 | Failed to send OTP email |

---

### Verify OTP

```
POST /api/v1/auth/verify-otp
```

**Auth**: None

**Request Body**
```json
{
  "email": "player@example.com",
  "otp": "4821"
}
```

**Response — Existing User** `200`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP verified",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "magnus",
      "name": "Magnus Carlsen",
      "email": "player@example.com",
      "dateOfBirth": "1990-11-30T00:00:00.000Z",
      "profileImage": "1695000000000-123456789.jpg",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "isNewUser": false
  }
}
```

**Response — New User** `200`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP verified",
  "data": {
    "registrationToken": "eyJhbGciOiJIUzI1NiIs...",
    "isNewUser": true
  }
}
```

**Errors**
| Status | Message |
|--------|---------|
| 400 | Email and OTP are required |
| 400 | OTP expired or invalid |
| 400 | Incorrect OTP |

---

### Register (New User)

```
POST /api/v1/auth/register
Content-Type: multipart/form-data
```

**Auth**: None (uses registration token from verify-otp)

**Form Fields**
| Field | Type | Required |
|-------|------|----------|
| registrationToken | string | Yes |
| username | string | Yes |
| name | string | Yes |
| dateOfBirth | string (ISO date) | Yes |
| profileImage | file (JPEG/PNG/WebP, max 5MB) | No |

**Response** `201`
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Registration successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "magnus",
      "name": "Magnus Carlsen",
      "email": "player@example.com",
      "dateOfBirth": "1990-11-30T00:00:00.000Z",
      "profileImage": "1695000000000-123456789.jpg",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Errors**
| Status | Message |
|--------|---------|
| 400 | Registration token is required |
| 400 | Username, name, and date of birth are required |
| 401 | Invalid or expired registration token |
| 409 | Username already taken |
| 409 | Email already registered |

---

## User Profile

All user routes require `Authorization: Bearer <token>` header.

### Get My Profile

```
GET /api/v1/users/me
```

**Response** `200`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "User profile retrieved",
  "data": {
    "user": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "magnus",
      "name": "Magnus Carlsen",
      "email": "player@example.com",
      "dateOfBirth": "1990-11-30T00:00:00.000Z",
      "profileImage": "1695000000000-123456789.jpg",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

### Update My Profile

```
PUT /api/v1/users/me
```

**Request Body** (all fields optional)
```json
{
  "name": "Magnus Carlsen Updated",
  "dateOfBirth": "1990-11-30"
}
```

**Response** `200`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile updated",
  "data": {
    "user": { "...updated user object..." }
  }
}
```

---

### Upload Profile Image

```
PUT /api/v1/users/me/profile-image
Content-Type: multipart/form-data
```

**Form Fields**
| Field | Type | Required |
|-------|------|----------|
| profileImage | file (JPEG/PNG/WebP, max 5MB) | Yes |

**Response** `200`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile image updated",
  "data": {
    "user": { "...updated user object with new profileImage..." }
  }
}
```

**Errors**
| Status | Message |
|--------|---------|
| 400 | Profile image file is required |

---

## Game History

All game routes require `Authorization: Bearer <token>` header.

### List My Games

```
GET /api/v1/games?page=1&limit=10
```

**Query Params**
| Param | Type | Default |
|-------|------|---------|
| page | number | 1 |
| limit | number | 10 |

**Response** `200`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Games retrieved",
  "data": {
    "games": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d9",
        "whitePlayerId": {
          "_id": "64f1...d1",
          "username": "magnus",
          "name": "Magnus Carlsen",
          "profileImage": "1695000000000-123456789.jpg"
        },
        "blackPlayerId": {
          "_id": "64f1...d2",
          "username": "hikaru",
          "name": "Hikaru Nakamura",
          "profileImage": null
        },
        "winnerId": {
          "_id": "64f1...d1",
          "username": "magnus",
          "name": "Magnus Carlsen"
        },
        "status": "COMPLETED",
        "result": "CHECKMATE",
        "startedAt": "2024-06-15T10:00:00.000Z",
        "endedAt": "2024-06-15T10:35:00.000Z",
        "totalMoves": 47
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 23,
      "totalPages": 3
    }
  }
}
```

---

### Get Game Detail

```
GET /api/v1/games/:gameId
```

**Response** `200`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Game detail retrieved",
  "data": {
    "game": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d9",
      "whitePlayerId": { "_id": "...", "username": "magnus", "name": "Magnus Carlsen" },
      "blackPlayerId": { "_id": "...", "username": "hikaru", "name": "Hikaru Nakamura" },
      "winnerId": { "_id": "...", "username": "magnus", "name": "Magnus Carlsen" },
      "status": "COMPLETED",
      "result": "CHECKMATE",
      "startedAt": "2024-06-15T10:00:00.000Z",
      "endedAt": "2024-06-15T10:35:00.000Z",
      "totalMoves": 4
    },
    "moves": [
      {
        "_id": "...",
        "gameId": "64f1a2b3c4d5e6f7a8b9c0d9",
        "moveNumber": 1,
        "playerId": "...",
        "from": "e2",
        "to": "e4",
        "piece": "p",
        "capturedPiece": null,
        "promotion": null,
        "notation": "e4",
        "createdAt": "2024-06-15T10:00:05.000Z"
      },
      {
        "moveNumber": 2,
        "from": "e7",
        "to": "e5",
        "piece": "p",
        "notation": "e5",
        "...":" "
      },
      {
        "moveNumber": 3,
        "from": "d1",
        "to": "h5",
        "piece": "q",
        "notation": "Qh5",
        "...":" "
      },
      {
        "moveNumber": 4,
        "from": "h5",
        "to": "f7",
        "piece": "q",
        "notation": "Qxf7#",
        "capturedPiece": "p",
        "...":" "
      }
    ]
  }
}
```

**Errors**
| Status | Message |
|--------|---------|
| 400 | Invalid game ID |
| 403 | You are not a participant in this game |
| 404 | Game not found |

---

## Auth Errors (all protected routes)

| Status | Message |
|--------|---------|
| 401 | Authentication required |
| 401 | Invalid or expired token |
| 401 | User not found |

---

## Socket.IO Events

Connect with JWT in handshake:
```js
const socket = io("http://localhost:3000", {
  auth: { token: "eyJhbGciOiJIUzI1NiIs..." }
});
```

### Client → Server Events

#### joinQueue

Join the FIFO matchmaking queue.

```js
socket.emit("joinQueue");
```

No payload. Server responds with `queueJoined` or `gameStarted` (if instant match).

---

#### leaveQueue

Leave the matchmaking queue.

```js
socket.emit("leaveQueue");
```

Server responds with `queueLeft`.

---

#### createRoom

Create a private game room.

```js
socket.emit("createRoom");
```

Server responds with `roomCreated`.

---

#### joinRoom

Join a private game room by code.

```js
socket.emit("joinRoom", { code: "X7K2M9" });
```

Server responds with `gameStarted` (to both players).

---

#### makeMove

Submit a chess move.

```js
socket.emit("makeMove", {
  gameId: "64f1a2b3c4d5e6f7a8b9c0d9",
  from: "e2",
  to: "e4",
  promotion: null      // "q", "r", "b", "n" when promoting a pawn
});
```

Server responds with `moveMade` (broadcast) or `moveRejected` (to sender only).

---

#### resign

Resign from the current game.

```js
socket.emit("resign", { gameId: "64f1a2b3c4d5e6f7a8b9c0d9" });
```

Server responds with `gameEnded` (broadcast to both players).

---

#### moveTimeout

Report that the current player's 30-second turn has expired.

```js
socket.emit("moveTimeout", { gameId: "64f1a2b3c4d5e6f7a8b9c0d9" });
```

Server validates elapsed time and responds with `gameEnded` if confirmed.

---

### Server → Client Events

#### queueJoined
```json
(no payload)
```

#### queueLeft
```json
(no payload)
```

#### roomCreated
```json
{
  "code": "X7K2M9"
}
```

#### gameStarted
```json
{
  "gameId": "64f1a2b3c4d5e6f7a8b9c0d9",
  "whitePlayerId": "64f1...d1",
  "blackPlayerId": "64f1...d2",
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "yourColor": "white",
  "turnStartedAt": 1695000000000
}
```

#### moveMade
```json
{
  "gameId": "64f1a2b3c4d5e6f7a8b9c0d9",
  "from": "e2",
  "to": "e4",
  "piece": "p",
  "capturedPiece": null,
  "promotion": null,
  "notation": "e4",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "moveNumber": 1,
  "currentTurn": "black",
  "isCheck": false,
  "turnStartedAt": 1695000001000
}
```

#### moveRejected
```json
{
  "gameId": "64f1a2b3c4d5e6f7a8b9c0d9",
  "reason": "Illegal move"
}
```

Possible reasons:
- `Missing move data`
- `Move is being processed, try again`
- `Game is not active`
- `It is not your turn`
- `Illegal move`

#### gameEnded
```json
{
  "gameId": "64f1a2b3c4d5e6f7a8b9c0d9",
  "status": "COMPLETED",
  "result": "CHECKMATE",
  "winnerId": "64f1...d1"
}
```

Result values: `CHECKMATE`, `RESIGNATION`, `TIMEOUT`, `DRAW`

#### gameState (sent on reconnection)
```json
{
  "gameId": "64f1a2b3c4d5e6f7a8b9c0d9",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "whitePlayerId": "64f1...d1",
  "blackPlayerId": "64f1...d2",
  "currentTurn": "black",
  "turnStartedAt": 1695000001000,
  "moveNumber": 2,
  "status": "ACTIVE",
  "lastMove": { "from": "e2", "to": "e4" }
}
```

#### opponentDisconnected
```json
{
  "gameId": "64f1a2b3c4d5e6f7a8b9c0d9"
}
```

#### opponentReconnected
```json
{
  "gameId": "64f1a2b3c4d5e6f7a8b9c0d9"
}
```

#### error
```json
{
  "message": "You are already in an active game"
}
```

Possible messages:
- `You are already in an active game`
- `Room code is required`
- `Room not found or expired`
- `Cannot join your own room`
- `Game state not found`
- `Server error processing move`
- `Action is being processed, try again`
- `Failed to join queue`
- `Failed to leave queue`
- `Failed to create room`
- `Failed to join room`

---

## Static Files

Profile images are served from:

```
GET /uploads/<filename>
```

Example: `GET /uploads/1695000000000-123456789.jpg`
