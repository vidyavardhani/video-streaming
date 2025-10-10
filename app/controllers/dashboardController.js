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

exports.listInstitutes = async (req, res) => {
  try {
    // Get all unique institutes and locations
    const institutes = await User.distinct('institute', { institute: { $ne: null, $ne: '' } });
    const locations = await User.distinct('location', { location: { $ne: null, $ne: '' } });
    
    res.json({
      institutes: institutes.sort(),
      locations: locations.sort()
    });
  } catch (error) {
    console.error('List institutes error', error);
    res.status(500).json({ message: 'Unable to load institutes' });
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

exports.uploadingVideos = async (req, res) => {
  try {
    // Get all classes with videos being uploaded
    const uploadingClasses = await ClassModel.find({
      $or: [
        { 'recording.uploadStatus': 'queued' },
        { 'recording.uploadStatus': 'uploading' }
      ]
    }).populate('host').sort({ 'recording.finishedAt': -1 });

    const uploadingVideos = uploadingClasses.map(klass => ({
      classId: klass._id,
      meetingCode: klass.meetingCode,
      title: klass.title,
      host: {
        id: klass.host?._id,
        name: klass.host?.name,
        email: klass.host?.email
      },
      recording: {
        startedAt: klass.recording?.startedAt,
        finishedAt: klass.recording?.finishedAt,
        durationMs: klass.recording?.durationMs,
        uploadStatus: klass.recording?.uploadStatus,
        fileKey: klass.recording?.fileKey
      },
      recordedVideoLink: klass.recordedVideoLink,
      recordingClassLink: klass.recordingClassLink
    }));

    res.json({
      count: uploadingVideos.length,
      videos: uploadingVideos
    });
  } catch (error) {
    console.error('Uploading videos error', error);
    res.status(500).json({ message: 'Unable to load uploading videos' });
  }
};
