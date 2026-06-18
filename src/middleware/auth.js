const crypto = require('crypto');
const { ApiError } = require('../domain/errors');
const { nodeEnv, sessionSecret, sessionTtlMinutes } = require('../config');
const { safeEqualString } = require('../domain/passwords');

const SESSION_COOKIE = 'rb_session';
const ROLE_LEVELS = Object.freeze({
  sale: 1,
  manager: 2,
  admin: 3
});
const ROLE_ALIASES = Object.freeze({
  sale: 'sale',
  manager: 'manager',
  admin: 'admin',
  owner: 'admin'
});

function normalizeRole(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return ROLE_ALIASES[String(value).trim().toLowerCase()] || null;
}

function normalizeSessionUser(value) {
  if (!value) {
    return null;
  }

  const role = normalizeRole(value.role);
  const id = Number(value.id);
  const username = String(value.username || '').trim();
  const displayName = String(value.display_name || '').trim();

  if (!role || !Number.isSafeInteger(id) || id <= 0 || !username || !displayName) {
    return null;
  }

  return {
    id,
    branch_id: value.branch_id === undefined || value.branch_id === null ? null : Number(value.branch_id),
    username,
    display_name: displayName,
    role
  };
}

function getSessionSecret() {
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required');
  }

  return sessionSecret;
}

function sign(value) {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function parseCookies(header) {
  const cookies = {};

  if (!header) {
    return cookies;
  }

  for (const part of header.split(';')) {
    const index = part.indexOf('=');

    if (index === -1) {
      continue;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }

  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  parts.push(`Path=${options.path || '/'}`);
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);

  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function createSessionValue(user, now = Date.now()) {
  const sessionUser = normalizeSessionUser(user);

  if (!sessionUser) {
    throw new Error('Valid user is required');
  }

  const ttlMs = sessionTtlMinutes * 60 * 1000;
  const payload = {
    ...sessionUser,
    iat: now,
    exp: now + ttlMs,
    nonce: crypto.randomBytes(16).toString('base64url')
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function readSessionValue(value, now = Date.now()) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const [encodedPayload, signature, extra] = value.split('.');

  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  if (!safeEqualString(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const sessionUser = normalizeSessionUser(payload);

    if (!sessionUser || !Number.isFinite(payload.exp) || payload.exp <= now) {
      return null;
    }

    return sessionUser;
  } catch (error) {
    return null;
  }
}

function readSessionFromCookie(cookieHeader) {
  const cookies = parseCookies(cookieHeader || '');

  return readSessionValue(cookies[SESSION_COOKIE]);
}

function sessionCookie(user) {
  return serializeCookie(SESSION_COOKIE, createSessionValue(user), {
    httpOnly: true,
    maxAge: sessionTtlMinutes * 60,
    path: '/',
    sameSite: 'Lax',
    secure: nodeEnv === 'production'
  });
}

function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'Lax',
    secure: nodeEnv === 'production'
  });
}

function setSessionCookie(res, user) {
  res.setHeader('Set-Cookie', sessionCookie(user));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', clearSessionCookie());
}

function loadSession(req, res, next) {
  req.user = readSessionFromCookie(req.headers.cookie || '');
  res.locals.currentUser = req.user;
  return next();
}

function requireAuthenticated(req, res, next) {
  if (req.user) {
    return next();
  }

  if (!req.path.startsWith('/api') && req.accepts('html')) {
    const nextPath = encodeURIComponent(req.originalUrl || '/dashboard');
    return res.redirect(`/login?next=${nextPath}`);
  }

  return next(new ApiError(401, 'Vui lòng đăng nhập'));
}

function requireRole(minimumRole) {
  const normalizedMinimumRole = normalizeRole(minimumRole);

  if (!normalizedMinimumRole) {
    throw new Error(`Unknown role: ${minimumRole}`);
  }

  const minimumLevel = ROLE_LEVELS[normalizedMinimumRole];

  return function authorizeRole(req, res, next) {
    const role = req.user && req.user.role;

    if (!role) {
      return next(new ApiError(401, 'Vui lòng đăng nhập'));
    }

    if (ROLE_LEVELS[role] < minimumLevel) {
      return next(new ApiError(403, 'Bạn không có quyền thực hiện thao tác này.'));
    }

    return next();
  };
}

module.exports = {
  SESSION_COOKIE,
  ROLE_LEVELS,
  clearSession,
  clearSessionCookie,
  createSessionValue,
  loadSession,
  normalizeRole,
  normalizeSessionUser,
  parseCookies,
  readSessionFromCookie,
  readSessionValue,
  requireAuthenticated,
  requireRole,
  setSessionCookie
};
