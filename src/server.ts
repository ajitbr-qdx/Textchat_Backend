import http from 'http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { initSocketIO } from './sockets/socket.handler.js';
import { prisma } from './config/prisma.js';

const app = createApp();
const server = http.createServer(app);

// Initialize Socket.IO
initSocketIO(server);

import os from 'os';

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

import { initClamAV } from './services/clamav.service.js';

// Test database connection and start server
async function startServer() {
  try {
    // Attempt DB connection check
    await prisma.$connect();
    console.log('✅ Connected to MySQL Database successfully');
  } catch (error: any) {
    console.warn('⚠️ Warning: Could not connect to MySQL at startup. Please ensure your MySQL server is running and DATABASE_URL is correct.');
    console.warn(`Details: ${error.message}`);
  }

  // Check ClamAV Antivirus Daemon
  if (config.clamav.enabled) {
    initClamAV().catch(() => {});
  }

  const localIp = getLocalIp();

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 Server running in ${config.nodeEnv} mode:`);
    console.log(`   - Local:    http://localhost:${config.port}`);
    console.log(`   - Network:  http://${localIp}:${config.port}`);
    console.log(`📡 Socket.IO listening on ws://${localIp}:${config.port}`);
    console.log(`🩺 Health check: http://${localIp}:${config.port}/api/health`);
  });
}

// Graceful shutdown
const shutdown = async () => {
  console.log('\nGracefully shutting down server...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Server and database connections closed.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();
