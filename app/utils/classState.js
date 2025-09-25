const Chat = require('../models/Chat');
const { getIO } = require('../sockets/manager');

const ensureWhiteboard = (klass) => {
  if (!klass.whiteboard) {
    klass.whiteboard = { strokes: [], updatedAt: null };
  }
  if (!Array.isArray(klass.whiteboard.strokes)) {
    klass.whiteboard.strokes = [];
  }
};

const ensureChatRoom = (klass) => {
  if (!klass.chatRoomId) {
    klass.chatRoomId = klass.meetingCode;
  }
};

const startParticipantSession = (participant) => {
  if (!participant) return;
  const now = new Date();
  participant.joinedAt = now;
  participant.sessions = participant.sessions || [];
  const lastSession = participant.sessions[participant.sessions.length - 1];
  if (lastSession && !lastSession.leftAt) {
    return;
  }
  participant.sessions.push({ joinedAt: now });
};

const endParticipantSession = (participant) => {
  if (!participant) return;
  const now = new Date();
  participant.sessions = participant.sessions || [];
  const lastSession = participant.sessions[participant.sessions.length - 1];
  if (lastSession && !lastSession.leftAt) {
    lastSession.leftAt = now;
  } else {
    participant.sessions.push({ joinedAt: participant.joinedAt || now, leftAt: now });
  }
};

const pushSystemMessage = async (klass, message, meta = {}) => {
  if (!klass || !message) return null;
  ensureChatRoom(klass);
  const payload = await Chat.create({
    class: klass._id,
    room: klass.chatRoomId || klass.meetingCode,
    senderName: 'System',
    message,
    type: 'system',
    meta
  });
  try {
    getIO().to(klass.meetingCode).emit('chat:new', payload);
  } catch (error) {
    // no-op if sockets unavailable
  }
  return payload;
};

module.exports = {
  ensureChatRoom,
  ensureWhiteboard,
  startParticipantSession,
  endParticipantSession,
  pushSystemMessage
};
