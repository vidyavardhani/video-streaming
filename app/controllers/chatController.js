const { validationResult } = require('express-validator');
const Chat = require('../models/Chat');
const ClassModel = require('../models/Class');
const { getIO } = require('../sockets/manager');

const ensureParticipant = async (classCode, user, joinToken) => {
  const klass = await ClassModel.findOne({ meetingCode: classCode });
  if (!klass) {
    return { error: 'Class not found' };
  }

  if (user) {
    const isHost = klass.host.toString() === user._id.toString();
    const isParticipant = klass.participants.some((entry) => entry.user?.toString() === user._id.toString());
    if (isHost || isParticipant) {
      return { klass, displayName: user.name, userId: user._id };
    }
  }

  if (joinToken) {
    const participant = klass.participants.find((entry) => entry.token === joinToken);
    if (participant) {
      return { klass, displayName: participant.displayName, joinToken };
    }
  }

  return { error: 'Not part of the class' };
};

exports.sendMessage = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { klass, displayName, userId, error } = await ensureParticipant(
      req.params.code,
      req.user,
      req.body.joinToken
    );

    if (error) {
      return res.status(403).json({ message: error });
    }

    const message = await Chat.create({
      class: klass._id,
      sender: userId,
      senderName: displayName,
      message: req.body.message
    });

    getIO().to(klass.meetingCode).emit('chat:new', message);

    return res.status(201).json(message);
  } catch (error) {
    console.error('Send chat error', error);
    return res.status(500).json({ message: 'Unable to send message' });
  }
};

exports.history = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code });
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const messages = await Chat.find({ class: klass._id }).sort('createdAt');
    return res.json(messages);
  } catch (error) {
    console.error('Chat history error', error);
    return res.status(500).json({ message: 'Unable to fetch chat history' });
  }
};

exports.remove = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code });
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (!req.user || klass.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can remove messages' });
    }

    await Chat.findByIdAndDelete(req.params.msgId);
    getIO().to(klass.meetingCode).emit('chat:remove', { msgId: req.params.msgId });
    return res.json({ message: 'Message removed' });
  } catch (error) {
    console.error('Delete chat error', error);
    return res.status(500).json({ message: 'Unable to delete message' });
  }
};
