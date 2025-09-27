const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const ClassModel = require('../models/Class');
const User = require('../models/User');
const DirectChatMessage = require('../models/DirectChatMessage');
const { register } = require('./manager');
const {
  ensureWhiteboard,
  ensureChatRoom,
  startParticipantSession,
  endParticipantSession
} = require('../utils/classState');
const { postSystemMessage } = require('../services/chatService');

const directChatStore = new Map();
const chatStoreHydrated = new Set();

const ensureChatStore = (classCode) => {
  if (!classCode) return null;
  if (!directChatStore.has(classCode)) {
    directChatStore.set(classCode, new Map());
  }
  return directChatStore.get(classCode);
};

const serializeDirectMessage = (doc) => {
  if (!doc) return null;
  const payload = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    id: payload.id || (payload._id ? payload._id.toString() : uuidv4()),
    from: payload.from || payload.fromToken,
    to: payload.to || payload.toToken,
    senderName: payload.senderName,
    message: payload.message,
    media: payload.media || null,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    seen: payload.seen ?? Boolean(payload.seenAt),
    seenAt: payload.seenAt || null
  };
};

const primeChatStore = async (classCode) => {
  if (!classCode) return null;
  const store = ensureChatStore(classCode);
  if (chatStoreHydrated.has(classCode)) {
    return store;
  }
  try {
    const history = await DirectChatMessage.find({ classCode })
      .sort({ createdAt: 1 })
      .limit(500);
    history.forEach((doc) => {
      const key = doc.conversation || conversationKey(doc.fromToken, doc.toToken);
      const existing = store.get(key) || [];
      existing.push(serializeDirectMessage(doc));
      store.set(key, existing.slice(-200));
    });
  } catch (error) {
    console.error('primeChatStore error', error);
  }
  chatStoreHydrated.add(classCode);
  return store;
};

const conversationKey = (a, b) => {
  const first = a || 'unknown';
  const second = b || 'unknown';
  return [first, second].sort().join('::');
};

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

    socket.on('direct:call:initiate', ({ target, media }) => {
      if (!target || !socket.data.classCode) return;
      io.to(target).emit('direct:call:ring', {
        from: socket.data.token || socket.id,
        fromName: socket.data.name,
        media,
        classCode: socket.data.classCode
      });
    });

    socket.on('direct:call:signal', ({ target, data }) => {
      if (!target || !data || !socket.data.classCode) return;
      io.to(target).emit('direct:call:signal', {
        from: socket.data.token || socket.id,
        data,
        classCode: socket.data.classCode
      });
    });

    socket.on('direct:call:cancel', ({ target }) => {
      if (!target || !socket.data.classCode) return;
      io.to(target).emit('direct:call:cancelled', {
        from: socket.data.token || socket.id,
        classCode: socket.data.classCode
      });
    });

    socket.on('direct:call:response', ({ target, accepted }) => {
      if (!target || !socket.data.classCode) return;
      io.to(target).emit('direct:call:response', {
        from: socket.data.token || socket.id,
        accepted: !!accepted,
        classCode: socket.data.classCode
      });
    });

    socket.on('direct:call:end', ({ target }) => {
      if (!target || !socket.data.classCode) return;
      io.to(target).emit('direct:call:ended', {
        from: socket.data.token || socket.id,
        classCode: socket.data.classCode
      });
    });

    socket.on('direct:chat:history', async ({ target, cursor, limit }, callback = () => {}) => {
      try {
        const store = await primeChatStore(socket.data.classCode);
        if (!store) {
          callback({ messages: [] });
          return;
        }
        const key = conversationKey(socket.data.token || socket.id, target);
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        const query = {
          classCode: socket.data.classCode,
          conversation: key
        };
        const before = cursor ? new Date(cursor) : null;
        if (before && !Number.isNaN(before.getTime())) {
          query.createdAt = { $lt: before };
        }
        const docs = await DirectChatMessage.find(query)
          .sort({ createdAt: -1 })
          .limit(safeLimit + 1);
        const hasMore = docs.length > safeLimit;
        const slice = docs.slice(0, safeLimit);
        const ordered = slice.reverse().map(serializeDirectMessage);
        callback({
          messages: ordered,
          nextCursor: hasMore && ordered.length ? ordered[0].createdAt : null,
          hasMore
        });
      } catch (error) {
        console.error('direct:chat:history error', error);
        callback({ error: 'Unable to load messages' });
      }
    });

    socket.on('direct:chat:send', async ({ target, message, media }, callback = () => {}) => {
      if (!target) {
        callback({ error: 'target and message required' });
        return;
      }
      const content = typeof message === 'string' ? message.trim() : '';
      if (!content && !media) {
        callback({ error: 'Message cannot be empty' });
        return;
      }
      const store = await primeChatStore(socket.data.classCode);
      if (!store) {
        callback({ error: 'Missing session' });
        return;
      }
      try {
        const fromToken = socket.data.token || socket.id;
        const key = conversationKey(fromToken, target);
        const doc = await DirectChatMessage.create({
          classCode: socket.data.classCode,
          conversation: key,
          fromToken,
          toToken: target,
          senderName: socket.data.name || 'Participant',
          message: content,
          media: media || null
        });
        const entry = serializeDirectMessage(doc);
        const existing = store.get(key) || [];
        existing.push(entry);
        store.set(key, existing.slice(-200));
        io.to(target).emit('direct:chat:new', entry);
        socket.emit('direct:chat:new', entry);
        callback({ message: entry });
      } catch (error) {
        console.error('direct:chat:send error', error);
        callback({ error: 'Unable to send message' });
      }
    });

    socket.on('direct:chat:seen', async ({ target, messageIds }) => {
      if (!Array.isArray(messageIds) || !target) return;
      const store = ensureChatStore(socket.data.classCode);
      if (!store) return;
      const key = conversationKey(socket.data.token || socket.id, target);
      const messages = store.get(key) || [];
      const idSet = new Set(messageIds);
      let changed = false;
      messages.forEach((msg) => {
        if (idSet.has(msg.id) && msg.to === (socket.data.token || socket.id)) {
          msg.seen = true;
          msg.seenAt = new Date();
          changed = true;
        }
      });
      if (changed) {
        store.set(key, messages);
        const objectIds = messageIds.reduce((acc, id) => {
          try {
            acc.push(new mongoose.Types.ObjectId(id));
          } catch (error) {
            /* ignore invalid ids */
          }
          return acc;
        }, []);
        if (objectIds.length) {
          try {
            await DirectChatMessage.updateMany(
              {
                classCode: socket.data.classCode,
                conversation: key,
                _id: { $in: objectIds }
              },
              { $set: { seenAt: new Date() } }
            );
          } catch (error) {
            console.error('direct:chat:seen update error', error);
          }
        }
        io.to(target).emit('direct:chat:seen', {
          from: socket.data.token || socket.id,
          messageIds
        });
      }
    });

    socket.on('media:update', async ({ audio, video }) => {
      const { classMongoId, token, role } = socket.data || {};
      if (!classMongoId) return;
      try {
        const klass = await ClassModel.findById(classMongoId);
        if (!klass) return;
        if (role === 'host') {
          const current = klass.hostMediaState || {};
          klass.hostMediaState = {
            audio: typeof audio === 'boolean' ? audio : current.audio === true,
            video: typeof video === 'boolean' ? video : current.video === true
          };
          await klass.save();
          io.to(klass.meetingCode).emit('host:state', klass.hostMediaState);
          return;
        }
        if (role !== 'participant') return;
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
        const loweredByHost = role === 'host' && !!targetToken;
        io.to(klass.meetingCode).emit('hand:lowered', {
          joinToken: participant.token,
          loweredByHost,
          mutedByHost: false
        });
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
        const nextMediaState = {
          audio: typeof audio === 'boolean' ? audio : participant.mediaState?.audio !== false,
          video: typeof video === 'boolean' ? video : participant.mediaState?.video !== false
        };
        const revokedSpeaking = typeof audio === 'boolean' && audio === false;
        participant.mediaState = nextMediaState;
        if (revokedSpeaking && participant.allowedToSpeakAt) {
          participant.allowedToSpeakAt = null;
        }
        await klass.save();
        io.to(klass.meetingCode).emit('participant:media', {
          joinToken: participant.token,
          mediaState: participant.mediaState
        });
        io.to(participant.token).emit('host:media', participant.mediaState);
        if (revokedSpeaking) {
          io.to(klass.meetingCode).emit('hand:lowered', {
            joinToken: participant.token,
            loweredByHost: true,
            mutedByHost: true
          });
        }
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
