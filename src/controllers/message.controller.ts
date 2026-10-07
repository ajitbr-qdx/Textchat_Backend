import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { getSocketIO } from '../sockets/socket.handler.js';

export const sendMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(5000),
  mediaUrl: z.string().optional(),
});

export const getMessages = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    const chatId = parseInt(String(req.params.chatId), 10);
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const page = parseInt(req.query.page as string, 10) || 1;
    const skip = (page - 1) * limit;

    if (isNaN(chatId)) {
      res.status(400).json({ success: false, message: 'Invalid chat ID' });
      return;
    }

    // Verify chat participant
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      res.status(404).json({ success: false, message: 'Chat not found' });
      return;
    }

    if (chat.user1Id !== currentUserId && chat.user2Id !== currentUserId) {
      res.status(403).json({ success: false, message: 'Access forbidden: You are not in this chat' });
      return;
    }

    const [messages, totalCount] = await Promise.all([
      prisma.message.findMany({
        where: { chatId },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: skip,
      }),
      prisma.message.count({
        where: { chatId },
      }),
    ]);

    // Format matching exact Android specification:
    // { "id", "chatId", "senderId", "senderName", "message", "mediaUrl", "timestamp" }
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      chatId: String(msg.chatId),
      senderId: msg.senderId,
      senderName: msg.sender?.name || '',
      message: msg.message,
      mediaUrl: msg.mediaUrl || null,
      timestamp: msg.createdAt.toISOString(),
      // Backward-compatible fields
      chat_id: msg.chatId,
      sender_id: msg.senderId,
      created_at: msg.createdAt.toISOString(),
      sender: msg.sender,
    }));

    res.status(200).json({
      success: true,
      messages: formattedMessages,
      data: {
        messages: formattedMessages,
        pagination: {
          totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const chatId = parseInt(String(req.params.chatId), 10);
    const { message, mediaUrl } = req.body;

    if (isNaN(chatId)) {
      res.status(400).json({ success: false, message: 'Invalid chat ID' });
      return;
    }

    // Verify chat participant
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      res.status(404).json({ success: false, message: 'Chat not found' });
      return;
    }

    if (chat.user1Id !== currentUserId && chat.user2Id !== currentUserId) {
      res.status(403).json({ success: false, message: 'Access forbidden: You are not in this chat' });
      return;
    }

    // Create message in database
    const newMessage = await prisma.message.create({
      data: {
        chatId,
        senderId: currentUserId,
        message: message.trim(),
        mediaUrl: mediaUrl || null,
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

    const payload = {
      id: newMessage.id,
      chatId: String(newMessage.chatId),
      senderId: newMessage.senderId,
      senderName: newMessage.sender?.name || req.user?.name || '',
      message: newMessage.message,
      mediaUrl: newMessage.mediaUrl || null,
      timestamp: newMessage.createdAt.toISOString(),
      chat_id: newMessage.chatId,
      sender_id: newMessage.senderId,
      created_at: newMessage.createdAt.toISOString(),
      sender: newMessage.sender,
    };

    // Emit real-time message through Socket.IO room if available
    try {
      const io = getSocketIO();
      if (io) {
        io.to(`chat_${chatId}`).emit('new_message', payload);
        io.to(String(chatId)).emit('new_message', payload);
        const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
        io.to(`user_${recipientId}`).emit('new_message', payload);
      }
    } catch {
      // Socket not yet initialized or disconnected, continue
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: payload,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadAttachment = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const chatId = parseInt(String(req.params.chatId), 10);
    if (isNaN(chatId)) {
      res.status(400).json({ success: false, message: 'Invalid chat ID' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded. Expected multipart field "file" or "photo"' });
      return;
    }

    // Verify chat participant
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      res.status(404).json({ success: false, message: 'Chat not found' });
      return;
    }

    if (chat.user1Id !== currentUserId && chat.user2Id !== currentUserId) {
      res.status(403).json({ success: false, message: 'Access forbidden: You are not in this chat' });
      return;
    }

    // Build accessible media URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    const caption = (req.body.message as string) || req.body.caption || '';

    // Save message with attachment to DB
    const newMessage = await prisma.message.create({
      data: {
        chatId,
        senderId: currentUserId,
        message: caption.trim() || '[Photo]',
        mediaUrl: fileUrl,
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

    const payload = {
      id: newMessage.id,
      chatId: String(newMessage.chatId),
      senderId: newMessage.senderId,
      senderName: newMessage.sender?.name || req.user?.name || '',
      message: newMessage.message,
      mediaUrl: newMessage.mediaUrl,
      timestamp: newMessage.createdAt.toISOString(),
      chat_id: newMessage.chatId,
      sender_id: newMessage.senderId,
      created_at: newMessage.createdAt.toISOString(),
      sender: newMessage.sender,
    };

    // Broadcast to WebSocket rooms
    try {
      const io = getSocketIO();
      if (io) {
        io.to(`chat_${chatId}`).emit('new_message', payload);
        io.to(String(chatId)).emit('new_message', payload);
        const recipientId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
        io.to(`user_${recipientId}`).emit('new_message', payload);
      }
    } catch {
      // Continue
    }

    res.status(201).json({
      success: true,
      message: 'Attachment uploaded successfully',
      mediaUrl: fileUrl,
      data: {
        message: payload,
        mediaUrl: fileUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};
