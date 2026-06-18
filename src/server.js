const http = require('http');
const { Server } = require('socket.io');
const { createApp } = require('./app');
const { close, query } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { seed } = require('./db/seed');
const { attachRealtime } = require('./realtime/socket');
const {
  corsOrigin,
  dbConnectRetries,
  dbConnectRetryDelayMs,
  port,
  runMigrationsOnStart,
  seedOnStart,
  validateRuntimeConfig
} = require('./config');

let server;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= dbConnectRetries; attempt += 1) {
    try {
      await query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === dbConnectRetries) {
        throw error;
      }

      console.warn(`Database is not ready, retrying (${attempt}/${dbConnectRetries})`);
      await sleep(dbConnectRetryDelayMs);
    }
  }
}

async function prepareDatabase() {
  validateRuntimeConfig({ includeSeedPasswords: seedOnStart });

  if (!runMigrationsOnStart && !seedOnStart) {
    return;
  }

  await waitForDatabase();

  if (runMigrationsOnStart) {
    await migrate();
  }

  if (seedOnStart) {
    await seed({ skipIfUsersExist: true });
  }
}

async function start() {
  await prepareDatabase();

  const app = createApp();
  server = http.createServer(app);
  const io = new Server(server, {
    cors: corsOrigin ? { origin: corsOrigin, credentials: true } : undefined
  });

  app.locals.realtime = attachRealtime(io);

  server.listen(port, () => {
    console.log(`Restaurant booking system listening on port ${port}`);
  });
}

start().catch(async (error) => {
  console.error('Failed to start restaurant booking system', error);
  await close();
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);

  if (!server) {
    await close();
    process.exit(0);
  }

  server.close(async () => {
    await close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
