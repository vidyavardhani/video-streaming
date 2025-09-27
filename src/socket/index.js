const User = require('../models/User');
const ChatSession = require('../models/ChatSession');
const Call = require('../models/Call');
const Settings = require('../models/Settings');
const { verify } = require('../utils/jwt');
const webhookService = require('../services/webhookService');

const RETRY_INTERVAL_MS = 1000;

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const { token, sessionId, role = 'customer' } = socket.handshake.auth || {};
      if (role === 'agent') {
        if (!token) {
          return next(new Error('Agent token required'));
        }
        const payload = verify(token);
        socket.data.userId = payload.sub;
        socket.data.role = 'agent';
      } else {
        if (!sessionId) {
          return next(new Error('Session ID required'));
        }
        socket.data.sessionId = sessionId;
        socket.data.role = 'customer';
      }
      return next();
    } catch (error) {
      return next(error);
    }
  });

  io.on('connection', async (socket) => {
    socket.emit('connection:ready', { retryInterval: RETRY_INTERVAL_MS });

    if (socket.data.role === 'agent') {
      socket.join('agents');
      const user = await User.findByIdAndUpdate(
        socket.data.userId,
        { 'availability.online': true, 'availability.lastOnlineAt': new Date() },
        { new: true }
      );
      socket.data.agent = user;
      socket.emit('agent:profile', user);
    } else if (socket.data.role === 'customer') {
      socket.join(socket.data.sessionId);
      socket.emit('chat:joined', { sessionId: socket.data.sessionId });
    }

    socket.on('chat:join', async ({ sessionId }) => {
      if (!sessionId) return;
      socket.join(sessionId);
      const chat = await ChatSession.findOne({ sessionId });
      socket.emit('chat:sync', { sessionId, chat });
    });

    socket.on('chat:message', async ({ sessionId, body, metadata }) => {
      if (!sessionId || !body) return;
      const chat = await ChatSession.findOne({ sessionId });
      if (!chat) return;
      const message = {
        senderType: socket.data.role === 'agent' ? 'agent' : 'customer',
        senderId: socket.data.role === 'agent' ? socket.data.userId : socket.data.sessionId,
        body,
        metadata
      };
      chat.messages.push(message);
      chat.lastMessageAt = new Date();
      await chat.save();

      io.to(sessionId).emit('chat:message', { sessionId, message });
      const settings = await Settings.findOne({ accountId: 'default' });
      if (settings) {
        webhookService.dispatch({
          integrations: settings.webhookIntegrations,
          event: 'chat.message.created',
          payload: { sessionId, message }
        });
      }
    });

    socket.on('chat:typing', ({ sessionId, typing }) => {
      if (!sessionId) return;
      socket.to(sessionId).emit('chat:typing', {
        sessionId,
        typing,
        senderType: socket.data.role === 'agent' ? 'agent' : 'customer'
      });
    });

    socket.on('call:offer', async ({ sessionId, offer }) => {
      if (!sessionId || !offer) return;
      const chat = await ChatSession.findOne({ sessionId });
      if (!chat) return;
      const call = await Call.create({
        chat: chat._id,
        agent: socket.data.userId,
        customerSessionId: sessionId,
        status: 'ringing',
        offer
      });
      const payload = { callId: call._id.toString(), offer, initiator: socket.data.role };
      io.to(sessionId).emit('call:offer', payload);
      socket.emit('call:ringing', payload);
    });

    socket.on('call:answer', async ({ callId, answer }) => {
      if (!callId || !answer) return;
      const call = await Call.findByIdAndUpdate(
        callId,
        { status: 'active', answer },
        { new: true }
      );
      if (!call) return;
      const chat = await ChatSession.findById(call.chat);
      io.to(chat.sessionId).emit('call:answer', { callId, answer });
    });

    socket.on('call:ice-candidate', async ({ callId, candidate }) => {
      if (!callId || !candidate) return;
      const call = await Call.findById(callId);
      if (!call) return;
      call.iceCandidates.push(candidate);
      await call.save();
      io.to(call.customerSessionId).emit('call:ice-candidate', { callId, candidate });
    });

    socket.on('call:end', async ({ callId, reason }) => {
      if (!callId) return;
      const call = await Call.findByIdAndUpdate(
        callId,
        { status: 'ended', endedAt: new Date() },
        { new: true }
      );
      if (!call) return;
      const chat = await ChatSession.findById(call.chat);
      io.to(chat.sessionId).emit('call:ended', { callId, reason });
    });

    socket.on('disconnect', async () => {
      if (socket.data.role === 'agent') {
        await User.findByIdAndUpdate(socket.data.userId, {
          'availability.online': false,
          'availability.lastOnlineAt': new Date()
        });
        io.to('agents').emit('agent:offline', { agentId: socket.data.userId });
      }
    });
  });
};
