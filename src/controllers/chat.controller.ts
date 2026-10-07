import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

export const createChatSchema = z.object({
  recipientId: z.number().int().positive('Recipient ID must be a positive integer'),
});

export const getOrCreateChat = async (
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

    const { recipientId } = req.body;

    if (currentUserId === recipientId) {
      res.status(400).json({
        success: false,
        message: 'Cannot create a chat with yourself',
      });
      return;
    }

    // Verify recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, name: true, email: true },
    });

    if (!recipient) {
      res.status(404).json({
        success: false,
        message: 'Recipient user not found',
      });
      return;
    }

    // Normalize IDs so user1_id < user2_id
    const user1Id = Math.min(currentUserId, recipientId);
    const user2Id = Math.max(currentUserId, recipientId);

    // Find existing chat or create new one
    let chat = await prisma.chat.findUnique({
      where: {
        user1Id_user2Id: {
          user1Id,
          user2Id,
        },
      },
      include: {
        user1: { select: { id: true, name: true, email: true } },
        user2: { select: { id: true, name: true, email: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          user1Id,
          user2Id,
        },
        include: {
          user1: { select: { id: true, name: true, email: true } },
          user2: { select: { id: true, name: true, email: true } },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    }

    const partner = chat.user1Id === currentUserId ? chat.user2 : chat.user1;

    res.status(200).json({
      success: true,
      data: {
        chat: {
          ...chat,
          partner,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserChats = async (
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

    const chats = await prisma.chat.findMany({
      where: {
        OR: [
          { user1Id: currentUserId },
          { user2Id: currentUserId },
        ],
      },
      include: {
        user1: { select: { id: true, name: true, email: true } },
        user2: { select: { id: true, name: true, email: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Map partner to each chat
    const formattedChats = chats.map((chat) => ({
      id: chat.id,
      user1_id: chat.user1Id,
      user2_id: chat.user2Id,
      created_at: chat.createdAt,
      partner: chat.user1Id === currentUserId ? chat.user2 : chat.user1,
      lastMessage: chat.messages[0] || null,
    }));

    res.status(200).json({
      success: true,
      data: { chats: formattedChats },
    });
  } catch (error) {
    next(error);
  }
};

export const getChatById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    const chatId = parseInt(String(req.params.chatId), 10);

    if (isNaN(chatId)) {
      res.status(400).json({ success: false, message: 'Invalid chat ID' });
      return;
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        user1: { select: { id: true, name: true, email: true } },
        user2: { select: { id: true, name: true, email: true } },
      },
    });

    if (!chat) {
      res.status(404).json({ success: false, message: 'Chat not found' });
      return;
    }

    // Verify user is a participant
    if (chat.user1Id !== currentUserId && chat.user2Id !== currentUserId) {
      res.status(403).json({ success: false, message: 'Access forbidden: You are not in this chat' });
      return;
    }

    const partner = chat.user1Id === currentUserId ? chat.user2 : chat.user1;

    res.status(200).json({
      success: true,
      data: {
        chat: {
          ...chat,
          partner,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
