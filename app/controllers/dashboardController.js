const crypto = require('crypto');
const User = require('../models/User');
const ClassModel = require('../models/Class');
const Chat = require('../models/Chat');

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('List users error', error);
    res.status(500).json({ message: 'Unable to load users' });
  }
};

exports.listLiveUsers = async (req, res) => {
  try {
    const liveClasses = await ClassModel.find({ status: 'live' }).populate('participants.user');
    const liveUsers = [];
    liveClasses.forEach((klass) => {
      klass.participants.forEach((p) => {
        if (p.user) {
          liveUsers.push({
            id: p.user._id,
            name: p.user.name,
            email: p.user.email,
            role: p.user.role,
            classCode: klass.meetingCode,
            classTitle: klass.title
          });
        } else {
          liveUsers.push({
            id: p.token,
            name: p.displayName,
            role: 'guest',
            classCode: klass.meetingCode,
            classTitle: klass.title
          });
        }
      });
    });
    res.json(liveUsers);
  } catch (error) {
    console.error('List live users error', error);
    res.status(500).json({ message: 'Unable to load live users' });
  }
};

exports.analyticsOverview = async (req, res) => {
  try {
    const [totalUsers, runningClasses] = await Promise.all([
      User.countDocuments(),
      ClassModel.countDocuments({ status: 'live' })
    ]);
    const liveUsers = await ClassModel.aggregate([
      { $match: { status: 'live' } },
      { $project: { count: { $size: '$participants' } } },
      { $group: { _id: null, total: { $sum: '$count' } } }
    ]);
    res.json({
      totalUsers,
      liveUsers: liveUsers[0]?.total || 0,
      runningClasses
    });
  } catch (error) {
    console.error('Analytics error', error);
    res.status(500).json({ message: 'Unable to load analytics' });
  }
};

exports.classChatLogs = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code });
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const messages = await Chat.find({ class: klass._id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error('Chat logs error', error);
    res.status(500).json({ message: 'Unable to load chat logs' });
  }
};

exports.generateApiKey = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+apiKey');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    user.apiKey = token;
    await user.save();
    res.json({ apiKey: token });
  } catch (error) {
    console.error('Generate API key error', error);
    res.status(500).json({ message: 'Unable to generate API key' });
  }
};
