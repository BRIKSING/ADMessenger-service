# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (watch mode with auto-restart)
npm run dev

# Build TypeScript → dist/
npm run build

# Run compiled output
npm start

# Prisma
npm run prisma:generate   # regenerate client after schema changes
npm run prisma:migrate    # apply migrations (dev)

# Full stack via Docker
docker-compose up
```

There are no test scripts configured yet.

## Architecture

**ADMessenger-service** is a Node.js/TypeScript backend for a family messenger app. It serves both a REST API (Express) and a real-time layer (Socket.IO) on a single HTTP server.

### Entry point & server setup (`src/index.ts`)

Express app and Socket.IO server share one `http.Server`. Routes are mounted at `/auth`, `/calls`, `/users`. The socket server is initialised via `createSocketServer(httpServer)`.

### Auth flow (`src/middleware/auth.ts`, `src/modules/auth/`)

- JWT-based, no refresh tokens yet (access token only, 15 min TTL by default).
- `POST /auth/login` accepts a phone number (`+7XXXXXXXXXX`). If the user does not exist it is created automatically — **no OTP/SMS verification in the current implementation**.
- `requireAuth` middleware validates `Authorization: Bearer <token>` on REST routes.
- Socket.IO handshake accepts the token via `auth.token` or the `Authorization` header.
- `JwtPayload` carries `{ userId, phone }` and is attached to `req.user` / `socket.user`.

### Module structure (`src/modules/<module>/`)

Each feature module owns its routes file and optionally a service file:

| Module | Files | Notes |
|--------|-------|-------|
| `auth` | `auth.routes.ts` | Login + `/auth/me` |
| `calls` | `calls.routes.ts`, `calls.socket.ts` | REST: paginated call history. Socket: WebRTC signalling |
| `users` | `users.routes.ts`, `users.service.ts` | Contacts, search, block/unblock, profile update |
| `chats` | `chats.routes.ts`, `chats.service.ts`, `chats.socket.ts` | Full text chat (see below) |
| `notifications`, `media` | empty stubs | Not yet implemented |

### Chats (`src/modules/chats/`)

**REST:**
- `GET /chats` — список чатов пользователя с последним сообщением и счётчиком непрочитанных
- `POST /chats` — создать чат: `{ type: "DIRECT", targetUserId }` или `{ type: "GROUP", name, memberIds[] }`
- `GET /chats/:id/messages` — история (cursor-based, по 50, параметр `?cursor=&limit=`)
- `PATCH /chats/:id/messages/:msgId` — редактировать своё сообщение (поле `editedAt` выставляется)
- `DELETE /chats/:id/messages/:msgId` — мягкое удаление; тело `{ forAll: true }` очищает `content` (только своё, только в течение 48 ч)

**Socket.IO (клиент → сервер):**
- `message:send` `{ chatId, content, replyToId? }` — сохраняет в БД, рассылает `message:new` всем участникам чата (кроме отправителя) и `message:ack` отправителю; поддерживает ack-callback
- `message:read` `{ chatId, messageId }` — помечает это и все более ранние сообщения прочитанными; рассылает `message:read` остальным участникам
- `typing:start` / `typing:stop` `{ chatId }` — ретранслируется остальным участникам как `{ chatId, userId }`

Изображения и медиа пока не реализованы (модуль `media` — заглушка).

### WebRTC signalling (`src/modules/calls/calls.socket.ts`)

Calls are peer-to-peer via WebRTC; the server is a signalling relay only. Each connected socket joins a room named after its `userId`. The signalling flow:

1. `call:offer` → server creates a `CallLog` (status `MISSED`), forwards SDP to target room as `call:incoming`.
2. `call:answer` → server updates `CallLog` to `ACCEPTED`, forwards SDP to caller as `call:answered`.
3. `call:ice-candidate` → forwarded to `targetUserId`.
4. `call:hangup` / `call:decline` → updates `CallLog`, notifies the other party.

Active calls are tracked in an in-memory `Map<callId, {initiatorId, targetId, startedAt}>` — this state is **lost on server restart**.

### Database (`prisma/schema.prisma`, `src/prisma/client.ts`)

PostgreSQL via Prisma. Key models: `User`, `Contact`, `Block`, `Chat`, `ChatMember`, `Message` (with `@@index([chatId, createdAt(sort: Desc)])`), `MessageRead`, `CallLog`. The Prisma client is a singleton exported from `src/prisma/client.ts`.

### Config (`src/config/index.ts`)

All runtime config is read from environment variables. Copy `.env.example` → `.env` before running locally.

### Infrastructure (docker-compose)

`postgres:16`, `redis:7-alpine` (not yet used in code), `minio` (S3-compatible, not yet wired), `coturn` (TURN server for WebRTC NAT traversal).
