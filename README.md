# 💬 Text Chat Backend

A production-ready, type-safe Real-Time Chat Backend built with **Node.js**, **Express**, **TypeScript**, **Socket.IO**, and **MySQL** (using **Prisma ORM**).

---

## 🗄️ Database Schema

The database follows the requested schema with relational constraints and indexing:

```
users
 ├── id (INT, PK, AUTO_INCREMENT)
 ├── name (VARCHAR(191))
 ├── email (VARCHAR(191), UNIQUE)
 ├── password (VARCHAR(255), BCRYPT HASH)
 └── created_at (DATETIME)

chats
 ├── id (INT, PK, AUTO_INCREMENT)
 ├── user1_id (INT, FK -> users.id)
 ├── user2_id (INT, FK -> users.id)
 └── created_at (DATETIME)

messages
 ├── id (INT, PK, AUTO_INCREMENT)
 ├── chat_id (INT, FK -> chats.id)
 ├── sender_id (INT, FK -> users.id)
 ├── message (TEXT)
 └── created_at (DATETIME)
```

- **DDL Script**: Raw SQL schema is available at [`prisma/schema.sql`](file:///c:/Users/dell/Desktop/Subhadeep/Team%20issues/Test-chat/backend/prisma/schema.sql).
- **Prisma Schema**: Object-relational mapping is available at [`prisma/schema.prisma`](file:///c:/Users/dell/Desktop/Subhadeep/Team%20issues/Test-chat/backend/prisma/schema.prisma).

---

## 🚀 Features

- **Authentication**: JWT authentication with Bcrypt password hashing.
- **REST APIs**: Full CRUD for user registration, login, user discovery, conversation creation, and message history.
- **Real-Time WebSockets (Socket.IO)**:
  - JWT handshake authentication.
  - Multi-room messaging (`chat_{chatId}`).
  - Instant message broadcasting (`new_message`).
  - Real-time typing indicators (`typing`, `stop_typing`).
  - Direct user notifications (`user_{userId}`).
- **Interactive Test Client**: Built-in modern web UI for browser testing at `http://localhost:5000`.

---

## 🛠️ Getting Started

### 1. Environment Configuration

Copy the example environment file and configure your MySQL credentials:

```bash
cp .env.example .env
```

Edit [`.env`](file:///c:/Users/dell/Desktop/Subhadeep/Team%20issues/Test-chat/backend/.env):
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="mysql://root:password@localhost:3306/chat_db"
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
CORS_ORIGIN="*"
```

### 2. Database Migration

Ensure your MySQL server is running, then sync the schema with:

```bash
# Push schema directly to MySQL database:
npm run prisma:push

# Or run Prisma migrations:
npm run prisma:migrate
```

*(Alternatively, you can execute [`prisma/schema.sql`](file:///c:/Users/dell/Desktop/Subhadeep/Team%20issues/Test-chat/backend/prisma/schema.sql) directly in MySQL Workbench or the MySQL CLI).*

### 3. Start Development Server

```bash
npm run dev
```

The server will start at:
- **HTTP Server**: `http://localhost:5000`
- **Socket.IO**: `ws://localhost:5000`
- **Interactive UI**: `http://localhost:5000/`

---

## 📡 REST API Reference

### 🔐 Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register a new user (`name`, `email`, `password`) | No |
| `POST` | `/api/auth/login` | Login with `email` and `password`, returns JWT | No |
| `GET` | `/api/auth/me` | Fetch authenticated user's profile | Yes (Bearer) |

#### Example Register Request:
```json
POST /api/auth/register
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "Password123"
}
```

---

### 👤 Users (`/api/users`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/users` | List other users (optional `?search=name`) | Yes (Bearer) |
| `GET` | `/api/users/:id` | Get user details by ID | Yes (Bearer) |

---

### 💬 Chats & Conversations (`/api/chats`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/chats` | Create or get existing 1-on-1 chat (`{ recipientId: number }`) | Yes (Bearer) |
| `GET` | `/api/chats` | List all chats for current user (with latest message) | Yes (Bearer) |
| `GET` | `/api/chats/:chatId` | Get single chat details | Yes (Bearer) |
| `GET` | `/api/chats/:chatId/messages` | Get message history (`?page=1&limit=50`) | Yes (Bearer) |
| `POST` | `/api/chats/:chatId/messages` | Send message via REST (`{ message: string }`) | Yes (Bearer) |
| `POST` | `/api/chats/:chatId/attachments` | Multipart photo/file upload (`file` or `photo`) | Yes (Bearer) |

---

## 🔌 Socket.IO Real-Time Events (Android & Web)

### Connection Handshake
Authenticate via query parameter (ideal for Android OkHttp/Socket.IO) or auth object:
```javascript
// Query parameter (Android):
// ws://<SERVER_IP>:5000?token=<JWT_TOKEN>

import { io } from "socket.io-client";

const socket = io("http://<SERVER_IP>:5000", {
  query: {
    token: "<YOUR_JWT_TOKEN>"
  }
});
```

### Client -> Server Events

| Event | Payload | Description |
|---|---|---|
| `join_chat` | `{ "chatId": "101" }` | Join real-time room for chat |
| `leave_chat` | `{ "chatId": "101" }` | Leave the chat room |
| `send_message` | `{ "chatId": "101", "recipientId": 2, "message": "hello" }` | Persists in MySQL and broadcasts to room |
| `typing` | `{ "chatId": "101" }` | Emits typing notification |
| `stop_typing` | `{ "chatId": "101" }` | Stops typing notification |

### Server -> Client Events

| Event | Payload | Description |
|---|---|---|
| `new_message` | `{ "id": 1, "chatId": "101", "senderId": 2, "senderName": "Alice", "message": "hello", "mediaUrl": null, "timestamp": "..." }` | Broadcast when any user sends message |
| `user_typing` | `{ "chatId": "101", "userId": 2, "name": "Alice" }` | Partner is typing |
| `user_stop_typing` | `{ "chatId": "101", "userId": 2 }` | Partner stopped typing |
| `user_typing` | `{ chatId, userId, name }` | Partner started typing |
| `user_stop_typing`| `{ chatId, userId }` | Partner stopped typing |
| `chat_notification`| `{ chatId, message }` | Background alert on user's personal channel |

---

## 🏗️ Project Architecture

```
backend/
├── prisma/
│   ├── schema.prisma        # Prisma ORM schema
│   └── schema.sql           # Raw MySQL DDL schema
├── public/
│   └── index.html           # Real-time interactive test client
├── src/
│   ├── config/
│   │   ├── env.ts           # Environment configuration
│   │   └── prisma.ts        # Prisma client singleton
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   ├── chat.controller.ts
│   │   └── message.controller.ts
│   ├── middlewares/
│   │   ├── auth.middleware.ts      # JWT validation
│   │   ├── validate.middleware.ts  # Zod body validation
│   │   └── error.middleware.ts     # Global error handler
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── chat.routes.ts
│   │   └── index.ts
│   ├── sockets/
│   │   └── socket.handler.ts       # Socket.IO event handlers
│   ├── types/
│   │   └── index.ts                # TypeScript definitions
│   ├── app.ts                      # Express application setup
│   └── server.ts                   # Server entrypoint
├── .env.example
├── package.json
└── tsconfig.json
```
