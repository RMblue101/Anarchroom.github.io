const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
// Configurável via variáveis de ambiente:
// - ALLOWED_ORIGINS: lista separada por vírgulas de origins a permitir (ex.: https://meu-site.com,https://outro.com)
// - BIND_HOST: host para bind do server (por omissão '127.0.0.1'; use '0.0.0.0' para expor publicamente)

const envOrigins = process.env.ALLOWED_ORIGINS;
const allowedOrigins = envOrigins ? envOrigins.split(',').map(s => s.trim()) : [
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:80',
  'http://127.0.0.1:80',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://192.168.0.141:3000'
];

const io = socketIo(server, { cors: { origin: allowedOrigins } });

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (e.g., curl, same-origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf('*') !== -1) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    return callback(new Error('CORS policy: origin not allowed'));
  }
}));
app.use(express.json());

const rooms = {};
// pending export requests: requestId -> { room, requester, pending:Set, approvals: {}, timeout }
const pendingExports = {};

app.get('/', (req, res) => res.send('✅ Anarchroom Server online'));

io.on('connection', (socket) => {
  console.log('Novo socket:', socket.id);

  socket.on('entrarSala', ({ room, user }) => {
    socket.join(room);
    if (!rooms[room]) rooms[room] = { users: {}, messages: [] };
    rooms[room].users[user] = { id: socket.id, lastSeen: Date.now() };
    io.to(room).emit('atualizarOnline', Object.keys(rooms[room].users).length);
    io.to(room).emit('usuarioEntrou', user);
    socket.emit('carregarMensagens', rooms[room].messages);
  });

  socket.on('enviarMensagem', ({ room, user, msg, time }) => {
    if (!rooms[room]) rooms[room] = { users: {}, messages: [] };
    const newMsg = { user, msg, time };
    rooms[room].messages.push(newMsg);
    if (rooms[room].messages.length > 500) rooms[room].messages.shift();
    io.to(room).emit('mensagem', newMsg);
  });

  socket.on('sairSala', ({ room, user }) => {
    socket.leave(room);
    if (rooms[room]) {
      delete rooms[room].users[user];
      if (Object.keys(rooms[room].users).length === 0) delete rooms[room];
      else io.to(room).emit('atualizarOnline', Object.keys(rooms[room].users).length);
    }
  });

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(room => {
      Object.keys(rooms[room].users).forEach(user => {
        if (rooms[room].users[user].id === socket.id) {
          delete rooms[room].users[user];
          io.to(room).emit('atualizarOnline', Object.keys(rooms[room].users).length);
        }
      });
      if (Object.keys(rooms[room].users).length === 0) delete rooms[room];
    });
    console.log('Socket desconectado:', socket.id);
  });

  socket.on('heartbeat', ({ room, user }) => {
    if (rooms[room] && rooms[room].users[user]) rooms[room].users[user].lastSeen = Date.now();
  });

  // Request to export conversation (PDF) — asks all participants for permission
  socket.on('requestExport', ({ room, user }) => {
    if (!rooms[room]) { socket.emit('exportError', 'room_not_found'); return; }
    const users = Object.keys(rooms[room].users);
    if (!users.length) { socket.emit('exportError', 'no_users'); return; }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const pending = new Set(users);
    pendingExports[requestId] = {
      room,
      requester: user,
      pending,
      approvals: {},
      timeout: setTimeout(() => {
        // timeout => treat as denied
        const req = pendingExports[requestId];
        if (!req) return;
        const requesterSid = rooms[req.room] && rooms[req.room].users[req.requester] && rooms[req.room].users[req.requester].id;
        if (requesterSid) io.to(requesterSid).emit('exportDenied', { requestId, reason: 'timeout' });
        delete pendingExports[requestId];
      }, 30 * 1000)
    };

    // send exportRequest to all participants (including requester — they must confirm too)
    users.forEach(u => {
      const sid = rooms[room].users[u].id;
      io.to(sid).emit('exportRequest', { requestId, room, requester: user });
    });
  });

  // Responses from participants to exportRequest
  socket.on('exportResponse', ({ requestId, user, approve }) => {
    const req = pendingExports[requestId];
    if (!req) return;
    if (!req.pending.has(user)) return; // unknown participant
    req.pending.delete(user);
    req.approvals[user] = !!approve;

    if (!approve) {
      // someone denied — notify requester and cancel
      const requesterSid = rooms[req.room] && rooms[req.room].users[req.requester] && rooms[req.room].users[req.requester].id;
      if (requesterSid) io.to(requesterSid).emit('exportDenied', { requestId, by: user });
      clearTimeout(req.timeout);
      delete pendingExports[requestId];
      return;
    }

    // if all responded and all approved -> send messages to requester
    if (req.pending.size === 0) {
      const messages = rooms[req.room] ? (rooms[req.room].messages || []) : [];
      const requesterSid = rooms[req.room] && rooms[req.room].users[req.requester] && rooms[req.room].users[req.requester].id;
      if (requesterSid) io.to(requesterSid).emit('exportApproved', { requestId, messages });
      clearTimeout(req.timeout);
      delete pendingExports[requestId];
    }
  });
});

// Limpeza periódica de salas inativas
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000;
  Object.keys(rooms).forEach(room => {
    Object.keys(rooms[room].users).forEach(user => {
      if (now - (rooms[room].users[user].lastSeen || 0) > timeout) {
        delete rooms[room].users[user];
      }
    });
    if (Object.keys(rooms[room].users).length === 0) delete rooms[room];
  });
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
server.listen(PORT, BIND_HOST, () => console.log(`Anarchroom Server em http://${BIND_HOST}:${PORT} (ALLOWED_ORIGINS=${allowedOrigins.join(',')})`));
