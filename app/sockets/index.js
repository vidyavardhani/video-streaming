const jwt = require('jsonwebtoken');
const ClassModel = require('../models/Class');
const User = require('../models/User');
const { register } = require('./manager');

const decodeToken = async (token) => {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key');
    const user = await User.findById(payload.id);
    return user || null;
  } catch (error) {
    return null;
  }
};

module.exports = (io) => {
  register(io);

  io.on('connection', (socket) => {
    socket.data = { role: 'guest' };

    socket.on('session:join', async (payload, callback = () => {}) => {
      try {
        const { classCode: providedCode, classId, token, joinToken, displayName } = payload || {};
        const classCode = providedCode || classId;
        if (!classCode) {
          callback({ error: 'classCode missing' });
          return;
        }

        const klass = await ClassModel.findOne({ meetingCode: classCode });
        if (!klass) {
          callback({ error: 'Class not found' });
          return;
        }

        const user = await decodeToken(token);
        let role = 'lobby';
        let participantToken = joinToken;
        let participant = null;

        if (user && klass.host.toString() === user._id.toString()) {
          role = 'host';
          participantToken = 'host';
        } else if (user) {
          participant = klass.participants.find((entry) => entry.user?.toString() === user._id.toString());
          if (participant) {
            role = 'participant';
            participantToken = participant.token;
          }
        }

        if (!participant && joinToken) {
          participant = klass.participants.find((entry) => entry.token === joinToken);
          if (participant) {
            role = 'participant';
            participantToken = participant.token;
          }
        }

        if (!participant && joinToken) {
          const lobbyEntry = klass.lobby.find((entry) => entry.token === joinToken);
          if (lobbyEntry) {
            role = 'lobby';
            participantToken = lobbyEntry.token;
            participant = lobbyEntry;
          }
        }

        if (role !== 'host' && !participantToken) {
          callback({ error: 'Join token required' });
          return;
        }

        socket.join(classCode);
        if (participantToken) {
          socket.join(participantToken);
        }
        if (klass.host && klass.host.toString()) {
          socket.join(klass.host.toString());
        }

        socket.data = {
          classCode,
          classMongoId: klass._id.toString(),
          role,
          userId: user ? user._id.toString() : null,
          name: user ? user.name : (participant?.displayName || displayName || 'Guest'),
          token: participantToken || null
        };

        if (role === 'participant') {
          const index = klass.participants.findIndex((entry) => entry.token === participantToken);
          if (index !== -1) {
            klass.participants[index].socketId = socket.id;
            await klass.save();
          }
        }

        callback({
          role: socket.data.role,
          name: socket.data.name,
          joinToken: socket.data.token,
          classStatus: klass.status
        });
      } catch (error) {
        console.error('session:join error', error);
        callback({ error: 'Unable to join session' });
      }
    });

    socket.on('class:lobby:update', async (payload, callback = () => {}) => {
      try {
        if (socket.data.role !== 'host') {
          callback({ error: 'Forbidden' });
          return;
        }
        const klass = await ClassModel.findById(socket.data.classMongoId);
        callback({ lobby: klass?.lobby || [] });
      } catch (error) {
        callback({ error: 'Failed to fetch lobby' });
      }
    });

    socket.on('webrtc:signal', ({ classCode, target, data }) => {
      const roomCode = classCode || socket.data.classCode;
      if (!roomCode || !target || !data) return;
      io.to(target).emit('webrtc:signal', {
        from: socket.id,
        data,
        classCode: roomCode,
        role: socket.data.role,
        fromToken: socket.data.token || (socket.data.role === 'host' ? 'host' : socket.id)
      });
    });

    socket.on('disconnect', async () => {
      const { classMongoId, classCode, token, role } = socket.data || {};
      if (!classMongoId || role === 'host') {
        return;
      }
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) return;
        const participant = klass.participants.find((entry) => entry.token === token);
        if (participant) {
          participant.socketId = null;
          await klass.save();
          io.to(classCode).emit('participant:disconnected', { joinToken: token });
        }
      } catch (error) {
        console.error('disconnect error', error);
      }
    });
  });
};
