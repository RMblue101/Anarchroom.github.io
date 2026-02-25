const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.on('join', room => {
    socket.join(room);
    console.log(`${socket.id} joined ${room}`);
    // optional system message
    socket.to(room).emit('chat message', { user: 'Sistema', msg: `${socket.id} entrou na sala.` });
  });

  socket.on('chat message', ({ room, user, msg }) => {
    // broadcast to room
    io.to(room).emit('chat message', { user, msg });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Anarchroom socket server listening on port ${PORT}`);
});
