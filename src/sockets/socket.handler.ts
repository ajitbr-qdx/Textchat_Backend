import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AuthUser } from '../types/index.js';

let ioInstance: Server | null = null;

export const getSocketIO = (): Server => {
  if (!ioInstance) {
    throw new Error('Socket.IO is not initialized yet');
  }
  return ioInstance;
};

export const initSocketIO = (server: HttpServer): Server => {
  const io = new Server(server, {
    cors: {
      origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication Middleware for WebSockets
  // Supports query parameter (?token=...), auth payload, or Authorization header
  io.use((socket: Socket, next) => {
    const queryToken = typeof socket.handshake.query?.token === 'string' ? socket.handshake.query.token : undefined;
    const authToken = socket.handshake.auth?.token;
    const headerToken = socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    const token = queryToken || authToken || headerToken;

    if (!token) {
      return next(new Error('Authentication error: Token missing. Pass ?token=<JWT_TOKEN> or auth object'));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
      socket.data.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthUser;
    console.log(`[Socket] User connected: ${user.name} (#${user.id}) - Socket ID: ${socket.id}`);

    // Join user's personal channel for direct user notifications
    socket.join(`user_${user.id}`);
    socket.join(String(user.id));

    // Room Joining: Listen for "join_chat" with { "chatId": "101" } or { chatId: 101 }
    socket.on('join_chat', async (data: { chatId: string | number }, callback?: (response: any) => void) => {
      try {
        const rawChatId = data?.chatId;
        if (!rawChatId) {
          if (callback) callback({ success: false, message: 'chatId is required' });
          return;
        }

        const chatId = parseInt(String(rawChatId), 10);
        if (isNaN(chatId)) {
          if (callback) callback({ success: false, message: 'Invalid chatId format' });
          return;
        }

        // Verify participant
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
        });

        if (!chat || (chat.user1Id !== user.id && chat.user2Id !== user.id)) {
          if (callback) callback({ success: false, message: 'Unauthorized access to chat room' });
          return;
        }

        // Join both "chat_<id>" and "<id>" rooms for flexible client compatibility
        socket.join(`chat_${chatId}`);
        socket.join(String(chatId));
        console.log(`[Socket] User ${user.name} (${user.id}) joined room chat_${chatId}`);

        if (callback) {
          callback({
            success: true,
            chatId: String(chatId),
            room: `chat_${chatId}`,
          });
        }
      } catch (err: any) {
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // Leave chat room
    socket.on('leave_chat', (data: { chatId: string | number }) => {
      if (data?.chatId) {
        const chatId = String(data.chatId);
        socket.leave(`chat_${chatId}`);
        socket.leave(chatId);
        console.log(`[Socket] User ${user.id} left room chat_${chatId}`);
      }
    });

    // Send Message: Listen for "send_message" with { "chatId", "recipientId", "message", "mediaUrl"? }
    socket.on(
      'send_message',
      async (
        data: {
          chatId?: string | number;
          recipientId?: string | number;
          message?: string;
          mediaUrl?: string;
        },
        callback?: (response: any) => void
      ) => {
        try {
          const rawChatId = data?.chatId;
          const rawRecipientId = data?.recipientId;
          const messageText = data?.message?.trim() || '';
          const mediaUrl = data?.mediaUrl || null;

          if (!messageText && !mediaUrl) {
            if (callback) callback({ success: false, message: 'Message text or mediaUrl is required' });
            return;
          }

          let resolvedChatId: number | null = null;
          let chat: any = null;

          if (rawChatId) {
            const parsedChatId = parseInt(String(rawChatId), 10);
            if (!isNaN(parsedChatId)) {
              chat = await prisma.chat.findUnique({ where: { id: parsedChatId } });
              if (chat && (chat.user1Id === user.id || chat.user2Id === user.id)) {
                resolvedChatId = chat.id;
              }
            }
          }

          // If no chatId provided or not found, look up by recipientId
          if (!resolvedChatId && rawRecipientId) {
            const parsedRecipientId = parseInt(String(rawRecipientId), 10);
            if (!isNaN(parsedRecipientId) && parsedRecipientId !== user.id) {
              const u1 = Math.min(user.id, parsedRecipientId);
              const u2 = Math.max(user.id, parsedRecipientId);
              chat = await prisma.chat.upsert({
                where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
                update: {},
                create: { user1Id: u1, user2Id: u2 },
              });
              resolvedChatId = chat.id;
            }
          }

          if (!resolvedChatId || !chat) {
            if (callback) callback({ success: false, message: 'Valid chatId or recipientId required, or access denied' });
            return;
          }

          // Persist message in MySQL
          const savedMessage = await prisma.message.create({
            data: {
              chatId: resolvedChatId,
              senderId: user.id,
              message: messageText || (mediaUrl ? '[Attachment]' : ''),
              mediaUrl: mediaUrl,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          });

          // Android expected payload structure:
          // { "id", "chatId", "senderId", "senderName", "message", "mediaUrl", "timestamp" }
          const formattedMessage = {
            id: savedMessage.id,
            chatId: String(savedMessage.chatId),
            senderId: savedMessage.senderId,
            senderName: user.name,
            message: savedMessage.message,
            mediaUrl: savedMessage.mediaUrl || null,
            timestamp: savedMessage.createdAt.toISOString(),
            // Backward-compatible fields
            chat_id: savedMessage.chatId,
            sender_id: savedMessage.senderId,
            created_at: savedMessage.createdAt.toISOString(),
            sender: {
              id: user.id,
              name: user.name,
              email: user.email,
            },
          };

          // Broadcast to chat room(s)
          io.to(`chat_${resolvedChatId}`).emit('new_message', formattedMessage);
          io.to(String(resolvedChatId)).emit('new_message', formattedMessage);

          // Direct broadcast to recipient's personal user channel
          const targetRecipientId = chat.user1Id === user.id ? chat.user2Id : chat.user1Id;
          io.to(`user_${targetRecipientId}`).emit('new_message', formattedMessage);
          io.to(String(targetRecipientId)).emit('new_message', formattedMessage);
          io.to(`user_${targetRecipientId}`).emit('chat_notification', {
            chatId: String(resolvedChatId),
            message: formattedMessage,
          });

          console.log(`[Socket] Message sent by ${user.name} to chat #${resolvedChatId}: "${formattedMessage.message}"`);

          if (callback) callback({ success: true, data: formattedMessage });
        } catch (err: any) {
          console.error('[Socket] send_message error:', err);
          if (callback) callback({ success: false, message: err.message });
        }
      }
    );

    // Typing status
    socket.on('typing', (data: { chatId: string | number }) => {
      if (data?.chatId) {
        const cId = String(data.chatId);
        socket.to(`chat_${cId}`).emit('user_typing', {
          chatId: cId,
          userId: user.id,
          name: user.name,
        });
        socket.to(cId).emit('user_typing', {
          chatId: cId,
          userId: user.id,
          name: user.name,
        });
      }
    });

    socket.on('stop_typing', (data: { chatId: string | number }) => {
      if (data?.chatId) {
        const cId = String(data.chatId);
        socket.to(`chat_${cId}`).emit('user_stop_typing', {
          chatId: cId,
          userId: user.id,
        });
        socket.to(cId).emit('user_stop_typing', {
          chatId: cId,
          userId: user.id,
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${user.name} (#${user.id})`);
    });
  });

  ioInstance = io;
  return io;
};
