const { SOCKET_EVENTS } = require('../domain/constants');
const { readSessionFromCookie } = require('../middleware/auth');

function attachRealtime(io) {
  const onlineSockets = new Map();

  function serializeOnlineUser(record) {
    return {
      user_id: record.user.id,
      username: record.user.username,
      display_name: record.user.display_name,
      role: record.user.role,
      socket_id: record.socket_id,
      connected_at: record.connected_at,
      last_seen: record.last_seen
    };
  }

  function onlineUsers() {
    const byUserId = new Map();

    for (const record of onlineSockets.values()) {
      const key = String(record.user.id);
      const current = byUserId.get(key);

      if (!current || current.connected_at > record.connected_at) {
        byUserId.set(key, record);
      }
    }

    return [...byUserId.values()]
      .sort((left, right) => left.user.display_name.localeCompare(right.user.display_name))
      .map(serializeOnlineUser);
  }

  function emitOnlineChange(eventName, record) {
    io.emit(eventName, {
      user: serializeOnlineUser(record),
      online_users: onlineUsers()
    });
  }

  function markOnline(socket, user) {
    if (!user) {
      return;
    }

    const now = new Date().toISOString();
    const record = {
      user,
      socket_id: socket.id,
      connected_at: now,
      last_seen: now
    };

    onlineSockets.set(socket.id, record);
    emitOnlineChange(SOCKET_EVENTS.staff_online, record);
  }

  function markOffline(socket) {
    const record = onlineSockets.get(socket.id);

    if (!record) {
      return;
    }

    record.last_seen = new Date().toISOString();
    onlineSockets.delete(socket.id);
    emitOnlineChange(SOCKET_EVENTS.staff_offline, record);
  }

  io.on('connection', (socket) => {
    const user = readSessionFromCookie(socket.handshake.headers.cookie || '');

    if (!user) {
      socket.disconnect(true);
      return;
    }

    markOnline(socket, user);
    socket.emit(SOCKET_EVENTS.staff_online, {
      user: serializeOnlineUser(onlineSockets.get(socket.id)),
      online_users: onlineUsers()
    });

    socket.on('disconnect', () => {
      markOffline(socket);
    });
  });

  return {
    broadcast(eventName, payload) {
      io.emit(eventName, payload);
    },
    getOnlineUsers() {
      return onlineUsers();
    }
  };
}

module.exports = { attachRealtime };
