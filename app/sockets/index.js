const jwt = require('jsonwebtoken');
const ClassModel = require('../models/Class');
const User = require('../models/User');
const { register } = require('./manager');
const {
  ensureWhiteboard,
  ensureChatRoom,
  startParticipantSession,
  endParticipantSession
} = require('../utils/classState');
const { postSystemMessage } = require('../services/chatService');

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

        ensureWhiteboard(klass);
        ensureChatRoom(klass);

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
            const participantEntry = klass.participants[index];
            const previousSession = Array.isArray(participantEntry.sessions)
              ? participantEntry.sessions[participantEntry.sessions.length - 1]
              : null;
            participantEntry.socketId = socket.id;
            if (!previousSession || previousSession.leftAt) {
              startParticipantSession(participantEntry);
            }
            await klass.save();
            if (klass.status === 'live') {
              io.to(klass.meetingCode).emit('participant:joined', {
                classCode: klass.meetingCode,
                participant: {
                  displayName: participantEntry.displayName,
                  token: participantEntry.token,
                  mediaState: participantEntry.mediaState || { audio: false, video: false }
                }
              });
            }
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

    socket.on('media:update', async ({ audio, video }) => {
      const { classMongoId, token, role } = socket.data || {};
      if (!classMongoId || role !== 'participant') return;
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) return;
        const participant = klass.participants.find((entry) => entry.token === token);
        if (!participant || participant.expelledAt) return;
        participant.mediaState = {
          audio: typeof audio === 'boolean' ? audio : participant.mediaState?.audio !== false,
          video: typeof video === 'boolean' ? video : participant.mediaState?.video !== false
        };
        await klass.save();
        io.to(klass.meetingCode).emit('participant:media', {
          joinToken: token,
          mediaState: participant.mediaState
        });
      } catch (error) {
        console.error('media:update error', error);
      }
    });

    socket.on('hand:raise', async (_, callback = () => {}) => {
      const { classMongoId, token, role } = socket.data || {};
      if (!classMongoId || role !== 'participant') {
        callback({ error: 'Only participants can raise hand' });
        return;
      }
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) {
          callback({ error: 'Class not found' });
          return;
        }
        const participant = klass.participants.find((entry) => entry.token === token);
        if (!participant || participant.expelledAt) {
          callback({ error: 'Not part of class' });
          return;
        }
        participant.handRaisedAt = new Date();
        await klass.save();
        io.to(klass.meetingCode).emit('hand:raised', {
          joinToken: token,
          name: participant.displayName,
          handRaisedAt: participant.handRaisedAt
        });
        callback({ success: true });
      } catch (error) {
        console.error('hand:raise error', error);
        callback({ error: 'Unable to raise hand' });
      }
    });

    socket.on('hand:lower', async ({ targetToken }, callback = () => {}) => {
      const { classMongoId, role, token } = socket.data || {};
      if (!classMongoId) {
        callback({ error: 'Invalid session' });
        return;
      }
      const effectiveToken = role === 'host' ? targetToken : token;
      if (!effectiveToken) {
        callback({ error: 'Missing target' });
        return;
      }
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) {
          callback({ error: 'Class not found' });
          return;
        }
        const participant = klass.participants.find((entry) => entry.token === effectiveToken);
        if (!participant) {
          callback({ error: 'Participant not found' });
          return;
        }
        participant.handRaisedAt = null;
        if (role === 'host' && targetToken && participant.allowedToSpeakAt) {
          participant.allowedToSpeakAt = null;
        }
        await klass.save();
        io.to(klass.meetingCode).emit('hand:lowered', { joinToken: participant.token });
        callback({ success: true });
      } catch (error) {
        console.error('hand:lower error', error);
        callback({ error: 'Unable to lower hand' });
      }
    });

    socket.on('hand:allow', async ({ targetToken }, callback = () => {}) => {
      const { classMongoId, role } = socket.data || {};
      if (role !== 'host') {
        callback({ error: 'Only host can allow' });
        return;
      }
      if (!targetToken) {
        callback({ error: 'targetToken required' });
        return;
      }
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) {
          callback({ error: 'Class not found' });
          return;
        }
        const participant = klass.participants.find((entry) => entry.token === targetToken);
        if (!participant) {
          callback({ error: 'Participant not found' });
          return;
        }
        participant.allowedToSpeakAt = new Date();
        participant.handRaisedAt = null;
        await klass.save();
        io.to(targetToken).emit('host:allow-speak');
        io.to(klass.meetingCode).emit('hand:allowed', { joinToken: participant.token });
        callback({ success: true });
      } catch (error) {
        console.error('hand:allow error', error);
        callback({ error: 'Unable to allow participant' });
      }
    });

    socket.on('whiteboard:stroke', async (stroke, callback = () => {}) => {
      const { classMongoId, role, name } = socket.data || {};
      if (role !== 'host') {
        callback({ error: 'Only host can draw' });
        return;
      }
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) {
          callback({ error: 'Class not found' });
          return;
        }
        ensureWhiteboard(klass);
        const payload = {
          id: stroke?.id || socket.id,
          path: Array.isArray(stroke?.path) ? stroke.path : [],
          color: stroke?.color || '#111827',
          size: stroke?.size || 3,
          author: name
        };
        klass.whiteboard.strokes.push(payload);
        klass.whiteboard.updatedAt = new Date();
        await klass.save();
        io.to(klass.meetingCode).emit('whiteboard:stroke', payload);
        callback({ success: true });
      } catch (error) {
        console.error('whiteboard:stroke error', error);
        callback({ error: 'Unable to sync whiteboard' });
      }
    });

    socket.on('whiteboard:clear', async (callback = () => {}) => {
      const { classMongoId, role } = socket.data || {};
      if (role !== 'host') {
        callback({ error: 'Only host can clear' });
        return;
      }
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) {
          callback({ error: 'Class not found' });
          return;
        }
        ensureWhiteboard(klass);
        klass.whiteboard.strokes = [];
        klass.whiteboard.updatedAt = new Date();
        await klass.save();
        io.to(klass.meetingCode).emit('whiteboard:clear');
        callback({ success: true });
      } catch (error) {
        console.error('whiteboard:clear error', error);
        callback({ error: 'Unable to clear whiteboard' });
      }
    });

    socket.on('media:control', async ({ targetToken, audio, video }, callback = () => {}) => {
      const { role, classMongoId } = socket.data || {};
      if (role !== 'host') {
        callback({ error: 'Only host can control media' });
        return;
      }
      if (!targetToken) {
        callback({ error: 'targetToken required' });
        return;
      }
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) {
          callback({ error: 'Class not found' });
          return;
        }
        const participant = klass.participants.find((entry) => entry.token === targetToken);
        if (!participant) {
          callback({ error: 'Participant not found' });
          return;
        }
        participant.mediaState = {
          audio: typeof audio === 'boolean' ? audio : participant.mediaState?.audio !== false,
          video: typeof video === 'boolean' ? video : participant.mediaState?.video !== false
        };
        await klass.save();
        io.to(klass.meetingCode).emit('participant:media', {
          joinToken: participant.token,
          mediaState: participant.mediaState
        });
        io.to(participant.token).emit('host:media', participant.mediaState);
        callback({ success: true });
      } catch (error) {
        console.error('media:control error', error);
        callback({ error: 'Unable to control media' });
      }
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
          endParticipantSession(participant);
          await klass.save();
          io.to(classCode).emit('participant:disconnected', { joinToken: token });
          if (!participant.expelledAt && participant.displayName) {
            await postSystemMessage(klass, `${participant.displayName} left the class.`);
          }
        }
      } catch (error) {
        console.error('disconnect error', error);
      }
    });
  });
};
