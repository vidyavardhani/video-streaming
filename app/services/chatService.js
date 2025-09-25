const Chat = require('../models/Chat');
const { getIO } = require('../sockets/manager');

const SYSTEM_SENDER_NAME = 'System';

const postSystemMessage = async (klass, message) => {
  if (!klass || !message) return null;
  try {
    const room = klass.chatRoomId || klass.meetingCode;
    if (!room) return null;
    const entry = await Chat.create({
      class: klass._id,
      room,
      sender: null,
      senderName: SYSTEM_SENDER_NAME,
      message,
      system: true
    });
    try {
      getIO().to(klass.meetingCode).emit('chat:new', entry);
    } catch (socketError) {
      console.error('System message socket error', socketError.message);
    }
    return entry;
  } catch (error) {
    console.error('System message error', error.message);
    return null;
  }
};

module.exports = {
  postSystemMessage
};
