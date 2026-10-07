import { Router } from 'express';
import {
  getOrCreateChat,
  getUserChats,
  getChatById,
  createChatSchema,
} from '../controllers/chat.controller.js';
import {
  getMessages,
  sendMessage,
  uploadAttachment,
  markChatAsSeen,
  sendMessageSchema,
} from '../controllers/message.controller.js';
import { authenticateJwt } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { uploadAttachment as multerUpload } from '../middlewares/upload.middleware.js';

const router = Router();

router.use(authenticateJwt);

// Chat conversations
router.post('/', validateBody(createChatSchema), getOrCreateChat);
router.get('/', getUserChats);
router.get('/:chatId', getChatById);

// Chat messages
router.get('/:chatId/messages', getMessages);
router.post('/:chatId/messages', validateBody(sendMessageSchema), sendMessage);
router.put('/:chatId/seen', markChatAsSeen);

// Photo / file attachments upload (accepts field names: file, photo, image, attachment, etc.)
const handleAttachmentUpload = (req: any, res: any, next: any) => {
  multerUpload.any()(req, res, (err: any) => {
    if (err) return next(err);
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

router.post('/:chatId/attachments', handleAttachmentUpload, uploadAttachment);

export default router;
