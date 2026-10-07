import express, { Application } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = (): Application => {
  const app = express();

  // Basic Middlewares
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static directory for test client if needed
  app.use(express.static(path.join(__dirname, '../public')));
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  // API Routes
  app.use('/api', apiRouter);

  // Root welcome
  app.get('/', (_req, res) => {
    res.json({
      message: 'Chat Backend API is running',
      version: '1.0.0',
      docs: '/api/health',
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
