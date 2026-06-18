const crypto = require('crypto');

const ALGORITHM = 'pbkdf2_sha256';
const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function safeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) {
    crypto.timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password) {
  if (!password) {
    throw new Error('Password is required');
  }

  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');

  return `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, encodedPassword) {
  if (!password || !encodedPassword) {
    return false;
  }

  const [algorithm, iterationsValue, salt, expectedHash, extra] = String(encodedPassword).split('$');
  const iterations = Number.parseInt(iterationsValue, 10);

  if (algorithm !== ALGORITHM || extra !== undefined || !Number.isInteger(iterations) || !salt || !expectedHash) {
    return false;
  }

  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, KEY_LENGTH, DIGEST).toString('base64url');

  return safeEqualString(hash, expectedHash);
}

module.exports = {
  hashPassword,
  safeEqualString,
  verifyPassword
};
