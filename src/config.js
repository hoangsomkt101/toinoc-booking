const dotenv = require('dotenv');

dotenv.config();

function booleanFromEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function integerFromEnv(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : defaultValue;
}

function requiredEnvNames(names) {
  return names.filter((name) => !process.env[name]);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const runMigrationsOnStart = booleanFromEnv(process.env.RUN_MIGRATIONS_ON_START, true);
const seedOnStart = booleanFromEnv(process.env.SEED_ON_START, true);
const sessionTtlMinutes = integerFromEnv(process.env.SESSION_TTL_MINUTES, 480);
const dbConnectRetries = integerFromEnv(process.env.DB_CONNECT_RETRIES, 30);
const dbConnectRetryDelayMs = integerFromEnv(process.env.DB_CONNECT_RETRY_DELAY_MS, 2000);

function validateRuntimeConfig({ includeSeedPasswords = false } = {}) {
  const missing = [];

  if (isProduction) {
    missing.push(...requiredEnvNames(['DATABASE_URL', 'SESSION_SECRET']));

    if (includeSeedPasswords) {
      missing.push(...requiredEnvNames(['ADMIN_PASSWORD', 'MANAGER_PASSWORD', 'SALE_PASSWORD']));
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (sessionTtlMinutes <= 0) {
    throw new Error('SESSION_TTL_MINUTES must be greater than 0');
  }

  if (dbConnectRetries <= 0) {
    throw new Error('DB_CONNECT_RETRIES must be greater than 0');
  }

  if (dbConnectRetryDelayMs <= 0) {
    throw new Error('DB_CONNECT_RETRY_DELAY_MS must be greater than 0');
  }
}

module.exports = {
  nodeEnv,
  port: integerFromEnv(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/restaurant_booking',
  dbSsl: booleanFromEnv(process.env.DB_SSL, false),
  dbConnectRetries,
  dbConnectRetryDelayMs,
  corsOrigin: process.env.CORS_ORIGIN || '',
  sessionSecret: process.env.SESSION_SECRET || (isProduction ? '' : 'dev-session-secret-change-me'),
  sessionTtlMinutes,
  runMigrationsOnStart,
  seedOnStart,
  authPasswords: {
    admin: process.env.ADMIN_PASSWORD || (isProduction ? '' : 'admin123'),
    manager: process.env.MANAGER_PASSWORD || (isProduction ? '' : 'manager123'),
    sale: process.env.SALE_PASSWORD || (isProduction ? '' : 'sale123')
  },
  validateRuntimeConfig
};
