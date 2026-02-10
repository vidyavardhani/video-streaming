const User = require('../models/User');
const ClassModel = require('../models/Class');
const Chat = require('../models/Chat');
const logger = require('../../config/logger');

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Failed to load users' });
  }
};

exports.listLiveUsers = async (req, res) => {
  try {
    const users = await User.find({ status: 'online' }).select('-password');
    res.json(users);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Failed to load live users' });
  }
};

exports.analyticsOverview = async (req, res) => {
  try {
    const [totalUsers, liveUsers, runningClasses] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'online' }),
      ClassModel.countDocuments({ status: 'live' })
    ]);
    res.json({
      totalUsers,
      liveUsers,
      runningClasses
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Failed to load analytics' });
  }
};

exports.classChatLogs = async (req, res) => {
  try {
    const messages = await Chat.find({ class: req.params.classId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Failed to load chat logs' });
  }
};
