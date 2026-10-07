import { Router } from 'express';
import { register, login, getMe, registerSchema, loginSchema } from '../controllers/auth.controller.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { authenticateJwt } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.get('/me', authenticateJwt, getMe);

export default router;
