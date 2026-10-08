import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/chat_db',
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  clamav: {
    enabled: process.env.CLAMAV_ENABLED !== 'false',
    host: process.env.CLAMAV_HOST || '127.0.0.1',
    port: parseInt(process.env.CLAMAV_PORT || '3310', 10),
    timeout: parseInt(process.env.CLAMAV_TIMEOUT || '60000', 10),
    blockOnFail: process.env.CLAMAV_BLOCK_ON_FAIL === 'true',
  },
};
