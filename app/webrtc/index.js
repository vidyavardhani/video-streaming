const peers = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    socket.on('signal', ({ roomId, target, payload }) => {
      if (target) {
        io.to(target).emit('signal', {
          from: socket.id,
          payload
        });
      } else if (roomId) {
        socket.to(roomId).emit('signal', {
          from: socket.id,
          payload
        });
      }
    });

    socket.on('startScreenShare', ({ roomId }) => {
      socket.to(roomId).emit('screenShareStarted', { from: socket.id });
    });

    socket.on('stopScreenShare', ({ roomId }) => {
      socket.to(roomId).emit('screenShareStopped', { from: socket.id });
    });

    socket.on('register-peer', ({ classId, role }) => {
      peers.set(socket.id, { classId, role });
      socket.join(classId);
    });

    socket.on('disconnect', () => {
      const peer = peers.get(socket.id);
      if (peer) {
        socket.to(peer.classId).emit('peer-disconnected', { socketId: socket.id });
        peers.delete(socket.id);
      }
    });
  });
};
