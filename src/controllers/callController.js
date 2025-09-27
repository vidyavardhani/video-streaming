const Call = require('../models/Call');
const ChatSession = require('../models/ChatSession');
const Settings = require('../models/Settings');
const webhookService = require('../services/webhookService');

const emitToRoom = (req, room, event, payload) => {
  const io = req.app.get('io');
  if (io) {
    io.to(room).emit(event, payload);
  }
};

exports.initiateCall = async (req, res) => {
  try {
    const { sessionId, offer, customerSessionId } = req.body;
    const chat = await ChatSession.findOne({ sessionId });
    if (!chat) {
      return res.status(404).json({ message: 'Chat session not found' });
    }
    if (!req.user.permissions.canInitiateCall) {
      return res.status(403).json({ message: 'Agent cannot initiate calls' });
    }
    const call = await Call.create({
      chat: chat._id,
      agent: req.user._id,
      customerSessionId,
      status: 'initiated',
      offer
    });
    emitToRoom(req, sessionId, 'call:incoming', { callId: call._id, offer });
    const settings = await Settings.findOne({ accountId: 'default' });
    if (settings) {
      webhookService.dispatch({
        integrations: settings.webhookIntegrations,
        event: 'call.started',
        payload: { callId: call._id, sessionId }
      });
    }
    return res.status(201).json({ call });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to initiate call', error: error.message });
  }
};

exports.answerCall = async (req, res) => {
  try {
    const { callId, answer } = req.body;
    const call = await Call.findByIdAndUpdate(
      callId,
      { status: 'active', answer },
      { new: true }
    );
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }
    const chat = await ChatSession.findById(call.chat);
    emitToRoom(req, chat.sessionId, 'call:answered', { callId, answer });
    return res.json({ call });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to answer call', error: error.message });
  }
};

exports.endCall = async (req, res) => {
  try {
    const { callId, reason } = req.body;
    const call = await Call.findByIdAndUpdate(
      callId,
      { status: 'ended', endedAt: new Date() },
      { new: true }
    );
    if (!call) {
      return res.status(404).json({ message: 'Call not found' });
    }
    const chat = await ChatSession.findById(call.chat);
    emitToRoom(req, chat.sessionId, 'call:ended', { callId, reason });
    return res.json({ call });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to end call', error: error.message });
  }
};
