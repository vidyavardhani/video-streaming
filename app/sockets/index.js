const ClassModel = require('../models/Class');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { init } = require('./io');

const activeUsers = new Map();

module.exports = (io) => {
  init(io);

  io.on('connection', (socket) => {
    socket.on('joinRoom', async ({ classId, userId, name, role }) => {
      try {
        const classItem = await ClassModel.findById(classId);
        if (!classItem) {
          socket.emit('error', { message: 'Class not found' });
          return;
        }
        socket.join(classId);
        activeUsers.set(socket.id, { classId, userId, name, role });

        if (userId) {
          socket.join(userId);
          await User.findByIdAndUpdate(userId, { status: 'online', currentClass: classId });
        }

        // Update participant socketId
        let updated = false;
        if (userId) {
          const participant = classItem.participants.find((p) => p.user && p.user.toString() === userId);
          if (participant) {
            participant.socketId = socket.id;
            updated = true;
          }
          const lobbyEntry = classItem.lobby.find((p) => p.user && p.user.toString() === userId);
          if (lobbyEntry) {
            lobbyEntry.socketId = socket.id;
            updated = true;
          }
          if (updated) {
            await classItem.save();
          }
        }

        io.to(classId).emit('participant-joined', {
          socketId: socket.id,
          userId,
          name,
          role
        });

        if (classItem.host) {
          io.to(classItem.host.toString()).emit('lobby-update', classItem.lobby);
        }
      } catch (error) {
        console.error('joinRoom error', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('newMessage', async (data) => {
      try {
        const { classId, userId, message, name } = data;
        if (!message) return;
        const chat = await Chat.create({
          class: classId,
          sender: userId,
          senderName: name,
          message
        });
        io.to(classId).emit('messageCreated', chat);
      } catch (error) {
        console.error('newMessage error', error);
      }
    });

    socket.on('removeMessage', async ({ classId, msgId }) => {
      try {
        await Chat.findByIdAndDelete(msgId);
        io.to(classId).emit('messageRemoved', { msgId });
      } catch (error) {
        console.error('removeMessage error', error);
      }
    });

    socket.on('disconnect', async () => {
      const session = activeUsers.get(socket.id);
      if (session) {
        activeUsers.delete(socket.id);
        if (session.userId) {
          await User.findByIdAndUpdate(session.userId, { status: 'offline', currentClass: null });
        }
        io.to(session.classId).emit('participant-left', {
          socketId: socket.id,
          userId: session.userId
        });
      }
    });
  });
};
