const { pool, withTransaction } = require('../db/pool');
const { normalizeRole } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../domain/passwords');
const { badRequest, conflict, forbidden, notFound } = require('../domain/errors');
const { parsePositiveInteger } = require('../domain/validators');

const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    throw badRequest('Tên đăng nhập phải dài 3-50 ký tự và chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang');
  }

  return username;
}

function normalizeDisplayName(value) {
  const displayName = String(value || '').trim();

  if (!displayName) {
    throw badRequest('Tên hiển thị là bắt buộc');
  }

  if (displayName.length > 120) {
    throw badRequest('Tên hiển thị tối đa 120 ký tự');
  }

  return displayName;
}

function normalizePassword(value) {
  const password = String(value || '');

  if (password.length < 6) {
    throw badRequest('Mật khẩu phải có ít nhất 6 ký tự');
  }

  return password;
}

function normalizeUserRow(row) {
  return {
    id: Number(row.id),
    branch_id: row.branch_id === null || row.branch_id === undefined ? null : Number(row.branch_id),
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    is_active: row.is_active,
    created_by_user_id: row.created_by_user_id === null || row.created_by_user_id === undefined ? null : Number(row.created_by_user_id),
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function canCreateRole(actorRole, targetRole) {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);

  if (!actor || !target) {
    return false;
  }

  return actor === 'admin' && Boolean(target);
}

function canManageUser(actor, target) {
  if (!actor || !target) {
    return false;
  }

  return actor.role === 'admin';
}

async function ensureBranch(client, branchId) {
  if (!branchId) {
    return;
  }

  const result = await client.query('SELECT id FROM branches WHERE id = $1', [branchId]);

  if (result.rowCount === 0) {
    throw badRequest('Chi nhánh không tồn tại');
  }
}

async function ensureAnotherActiveAdmin(client, userId) {
  const result = await client.query(
    `SELECT 1
     FROM users
     WHERE role = 'admin' AND is_active = TRUE AND id <> $1
     LIMIT 1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw conflict('Hệ thống phải còn ít nhất một quản trị viên đang hoạt động');
  }
}

async function authenticateUser(usernameValue, password) {
  let username;

  try {
    username = normalizeUsername(usernameValue);
  } catch (error) {
    return null;
  }

  const result = await pool.query(
    `SELECT *
     FROM users
     WHERE username = $1 AND is_active = TRUE`,
    [username]
  );

  if (result.rowCount === 0 || !verifyPassword(password, result.rows[0].password_hash)) {
    return null;
  }

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [result.rows[0].id]);

  return normalizeUserRow({ ...result.rows[0], last_login_at: new Date().toISOString() });
}

async function createUser(input = {}, actor) {
  const username = normalizeUsername(input.username);
  const displayName = normalizeDisplayName(input.display_name);
  const password = normalizePassword(input.password);
  const role = normalizeRole(input.role);
  const branchId = input.branch_id ? parsePositiveInteger(input.branch_id, 'branch_id') : null;

  if (!role) {
    throw badRequest('Vai trò không hợp lệ');
  }

  if (!actor || !canCreateRole(actor.role, role)) {
    throw forbidden('Vai trò hiện tại không được phép tạo tài khoản này');
  }

  const targetBranchId = branchId;

  return withTransaction(async (client) => {
    await ensureBranch(client, targetBranchId);

    try {
      const result = await client.query(
        `INSERT INTO users (branch_id, username, display_name, role, password_hash, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, branch_id, username, display_name, role, is_active, created_by_user_id, last_login_at, created_at, updated_at`,
        [targetBranchId, username, displayName, role, hashPassword(password), actor.id || null]
      );

      return normalizeUserRow(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        throw conflict('Tên đăng nhập đã tồn tại');
      }

      throw error;
    }
  });
}

async function getUserById(id, actor, executor = pool) {
  const userId = parsePositiveInteger(id, 'id');
  const result = await executor.query(
    `SELECT id, branch_id, username, display_name, role, is_active, created_by_user_id, last_login_at, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy người dùng');
  }

  const user = normalizeUserRow(result.rows[0]);
  if (!canManageUser(actor, user)) {
    throw forbidden('Bạn không có quyền quản lý tài khoản này');
  }

  return user;
}

async function updateUser(id, input = {}, actor) {
  const userId = parsePositiveInteger(id, 'id');

  return withTransaction(async (client) => {
    const currentUser = await getUserById(userId, actor, client);
    const updates = [];
    const values = [];

    function setColumn(column, value) {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    }

    if (hasOwn(input, 'username')) {
      setColumn('username', normalizeUsername(input.username));
    }

    if (hasOwn(input, 'display_name')) {
      setColumn('display_name', normalizeDisplayName(input.display_name));
    }

    let nextRole = currentUser.role;
    if (hasOwn(input, 'role')) {
      nextRole = normalizeRole(input.role);
      if (!nextRole) {
        throw badRequest('Vai trò không hợp lệ');
      }

      if (Number(actor.id) === userId && nextRole !== currentUser.role) {
        throw badRequest('Không thể tự thay đổi vai trò của tài khoản đang đăng nhập');
      }

      if (currentUser.role === 'admin' && currentUser.is_active && nextRole !== 'admin') {
        await ensureAnotherActiveAdmin(client, userId);
      }
      setColumn('role', nextRole);
    }

    let nextBranchId = currentUser.branch_id;
    if (hasOwn(input, 'branch_id')) {
      nextBranchId = input.branch_id ? parsePositiveInteger(input.branch_id, 'branch_id') : null;
      if (Number(actor.id) === userId && Number(nextBranchId) !== Number(currentUser.branch_id)) {
        throw badRequest('Không thể tự thay đổi chi nhánh của tài khoản đang đăng nhập');
      }
      await ensureBranch(client, nextBranchId);
      setColumn('branch_id', nextBranchId);
    }

    if (hasOwn(input, 'password') && input.password !== '') {
      setColumn('password_hash', hashPassword(normalizePassword(input.password)));
    }

    if (hasOwn(input, 'is_active')) {
      const isActive = input.is_active === true || input.is_active === 'true' || input.is_active === '1' || input.is_active === 'on';
      if (Number(actor.id) === userId && !isActive) {
        throw badRequest('Không thể vô hiệu hóa tài khoản đang đăng nhập');
      }
      if (currentUser.role === 'admin' && currentUser.is_active && !isActive) {
        await ensureAnotherActiveAdmin(client, userId);
      }
      setColumn('is_active', isActive);
    }

    if (updates.length === 0) {
      throw badRequest('Chưa cung cấp thông tin người dùng cần cập nhật');
    }

    values.push(userId);

    try {
      await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}`,
        values
      );
    } catch (error) {
      if (error.code === '23505') {
        throw conflict('Tên đăng nhập đã tồn tại');
      }

      throw error;
    }

    return getUserById(userId, actor, client);
  });
}

async function deleteUser(id, actor) {
  const userId = parsePositiveInteger(id, 'id');

  if (Number(actor && actor.id) === userId) {
    throw badRequest('Không thể xóa tài khoản đang đăng nhập');
  }

  return withTransaction(async (client) => {
    const user = await getUserById(userId, actor, client);
    if (user.role === 'admin' && user.is_active) {
      await ensureAnotherActiveAdmin(client, userId);
    }
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    return user;
  });
}

async function listUsers(actor, executor = pool) {
  if (!actor || !normalizeRole(actor.role)) {
    throw notFound('Không tìm thấy người dùng');
  }

  if (actor.role !== 'admin') {
    throw forbidden('Bạn không có quyền quản lý tài khoản');
  }

  const result = await executor.query(
    `SELECT id, branch_id, username, display_name, role, is_active, created_by_user_id, last_login_at, created_at, updated_at
     FROM users
     ORDER BY CASE role WHEN 'admin' THEN 3 WHEN 'manager' THEN 2 WHEN 'sale' THEN 1 END DESC, username ASC`,
    []
  );

  return result.rows.map(normalizeUserRow);
}

module.exports = {
  authenticateUser,
  canManageUser,
  canCreateRole,
  createUser,
  deleteUser,
  getUserById,
  hashPassword,
  listUsers,
  normalizeUserRow,
  normalizeUsername,
  updateUser,
  verifyPassword
};
