const { v4: uuid } = require('uuid');
const ChatSession = require('../models/ChatSession');
const Ticket = require('../models/Ticket');
const Settings = require('../models/Settings');
const webhookService = require('../services/webhookService');

const emitToRoom = (req, room, event, payload) => {
  const io = req.app.get('io');
  if (io) {
    io.to(room).emit(event, payload);
  }
};

exports.initiateChat = async (req, res) => {
  try {
    const { customer, metadata, channel = 'web' } = req.body;
    const sessionId = uuid();
    const chat = await ChatSession.create({
      sessionId,
      customer,
      channel,
      messages: [
        {
          senderType: 'system',
          body: 'Chat session created',
          metadata: metadata || {}
        }
      ]
    });
    emitToRoom(req, 'agents', 'chat:new', chat);
    const settings = await Settings.findOne({ accountId: 'default' });
    if (settings) {
      webhookService.dispatch({
        integrations: settings.webhookIntegrations,
        event: 'chat.created',
        payload: { sessionId, customer }
      });
    }
    return res.status(201).json({ sessionId, chat });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to initiate chat', error: error.message });
  }
};

exports.postMessage = async (req, res) => {
  try {
    const { sessionId, senderType, body, metadata } = req.body;
    const chat = await ChatSession.findOne({ sessionId });
    if (!chat) {
      return res.status(404).json({ message: 'Chat session not found' });
    }
    const message = { senderType, body, metadata, senderId: req.user?._id?.toString() };
    chat.messages.push(message);
    chat.lastMessageAt = new Date();
    await chat.save();

    emitToRoom(req, sessionId, 'chat:message', {
      sessionId,
      message
    });

    const settings = await Settings.findOne({ accountId: 'default' });
    if (settings) {
      webhookService.dispatch({
        integrations: settings.webhookIntegrations,
        event: 'chat.message.created',
        payload: { sessionId, message }
      });
    }

    return res.status(201).json({ chat });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to post chat message', error: error.message });
  }
};

exports.assignAgent = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { agentId } = req.body;
    const chat = await ChatSession.findOneAndUpdate(
      { sessionId },
      { agent: agentId, status: 'assigned' },
      { new: true }
    );
    if (!chat) {
      return res.status(404).json({ message: 'Chat session not found' });
    }
    emitToRoom(req, sessionId, 'chat:assigned', { chat });
    return res.json({ chat });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to assign agent', error: error.message });
  }
};

exports.history = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const chats = await ChatSession.find().sort({ updatedAt: -1 }).limit(Number(limit));
    return res.json({ chats });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch chat history', error: error.message });
  }
};

exports.createTicketFromChat = async (req, res) => {
  try {
    const { sessionId, subject, priority } = req.body;
    const chat = await ChatSession.findOne({ sessionId });
    if (!chat) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    const ticket = await Ticket.create({
      subject,
      description: chat.messages.map((m) => `${m.senderType}: ${m.body}`).join('\n'),
      priority,
      customer: chat.customer,
      linkedChat: chat._id
    });
    emitToRoom(req, 'agents', 'ticket:new', ticket);
    return res.status(201).json({ ticket });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create ticket', error: error.message });
  }
};
