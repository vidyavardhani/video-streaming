const User = require('../models/User');
const ClassModel = require('../models/Class');
const Chat = require('../models/Chat');
const logger = require('../../config/logger');
const { USER_STATUS, CLASS_STATUS } = require('../../config/constants');

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    logger.error('[dashboard] listUsers failed', error);
    res.status(500).json({ message: 'Failed to load users', error: error.message });
  }
};

exports.listLiveUsers = async (req, res) => {
  try {
    const users = await User.find({ status: USER_STATUS.ONLINE }).select('-password');
    res.json(users);
  } catch (error) {
    logger.error('[dashboard] listLiveUsers failed', error);
    res.status(500).json({ message: 'Failed to load live users', error: error.message });
  }
};

exports.analyticsOverview = async (req, res) => {
  try {
    const [totalUsers, liveUsers, runningClasses] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: USER_STATUS.ONLINE }),
      ClassModel.countDocuments({ status: CLASS_STATUS.LIVE })
    ]);
    res.json({
      totalUsers,
      liveUsers,
      runningClasses
    });
  } catch (error) {
    logger.error('[dashboard] analyticsOverview failed', error);
    res.status(500).json({ message: 'Failed to load analytics', error: error.message });
  }
};

exports.classChatLogs = async (req, res) => {
  try {
    const messages = await Chat.find({ class: req.params.classId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    logger.error('[dashboard] classChatLogs failed', error);
    res.status(500).json({ message: 'Failed to load chat logs', error: error.message });
  }
};
