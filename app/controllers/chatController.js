const Chat = require('../models/Chat');
const ClassModel = require('../models/Class');
const { getIO } = require('../sockets/io');

exports.sendMessage = async (req, res) => {
  try {
    const classItem = await ClassModel.findById(req.params.classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const chat = await Chat.create({
      class: classItem._id,
      sender: req.user._id,
      senderName: req.user.name,
      message: req.body.message
    });
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    if (io) {
      io.to(classItem._id.toString()).emit('messageCreated', chat);
    }
    res.status(201).json(chat);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to send message' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const messages = await Chat.find({ class: req.params.classId })
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const classItem = await ClassModel.findById(req.params.classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (classItem.host.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only host or admin can delete messages' });
    }
    await Chat.findByIdAndDelete(req.params.msgId);
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    if (io) {
      io.to(classItem._id.toString()).emit('messageRemoved', { msgId: req.params.msgId });
    }
    res.json({ message: 'Message removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete message' });
  }
};
