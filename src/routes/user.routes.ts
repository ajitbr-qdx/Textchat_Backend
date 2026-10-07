import { Router } from 'express';
import { getUsers, getUserById } from '../controllers/user.controller.js';
import { authenticateJwt } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticateJwt);

router.get('/', getUsers);
router.get('/:id', getUserById);

export default router;
