const { validationResult } = require('express-validator');
const ClassModel = require('../models/Class');
const User = require('../models/User');
const { getIO } = require('../sockets/io');

const generateMeetingCode = () => {
  const digits = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
};

exports.createClass = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const host = req.user;
    if (host.role !== 'teacher' && host.role !== 'admin') {
      return res.status(403).json({ message: 'Only teachers can create classes' });
    }
    const { title } = req.body;
    const meetingCode = generateMeetingCode();
    const newClass = await ClassModel.create({
      title,
      host: host._id,
      meetingCode
    });
    newClass.meetingLink = `${process.env.BASE_URL || 'http://localhost:4000'}/class/${newClass._id}`;
    await newClass.save();
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    res.status(201).json({
      classId: newClass._id,
      meetingLink: newClass.meetingLink,
      meetingCode: newClass.meetingCode
    });
    if (io) {
      io.to(host._id.toString()).emit('class-created', newClass);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to create class' });
  }
};

exports.startClass = async (req, res) => {
  try {
    const classItem = await ClassModel.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (classItem.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can start class' });
    }
    classItem.status = 'live';
    classItem.startTime = new Date();
    await classItem.save();
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    if (io) {
      io.to(classItem._id.toString()).emit('class-started', classItem);
    }
    res.json({ message: 'Class started', class: classItem });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to start class' });
  }
};

exports.endClass = async (req, res) => {
  try {
    const classItem = await ClassModel.findById(req.params.id).populate('participants.user');
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (classItem.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can end class' });
    }
    classItem.status = 'ended';
    classItem.endTime = new Date();
    const updates = classItem.participants.map(async (p) => {
      if (p.user) {
        await User.findByIdAndUpdate(p.user, { status: 'offline', currentClass: null });
      }
    });
    await Promise.all(updates);
    await classItem.save();
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    if (io) {
      io.to(classItem._id.toString()).emit('class-ended', { classId: classItem._id });
    }
    res.json({ message: 'Class ended' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to end class' });
  }
};

exports.joinClass = async (req, res) => {
  const { displayName } = req.body;
  try {
    const classItem = await ClassModel.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const existingLobby = classItem.lobby.find((l) => l.user?.toString() === req.user?._id?.toString());
    if (existingLobby) {
      return res.json({ message: 'Already in lobby', lobby: classItem.lobby });
    }
    classItem.lobby.push({
      user: req.user ? req.user._id : undefined,
      displayName: displayName || req.user?.name,
      status: 'pending'
    });
    await classItem.save();
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    if (io) {
      io.to(classItem.host.toString()).emit('lobby-update', classItem.lobby);
    }
    res.json({ message: 'Request sent to host', lobby: classItem.lobby });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to join class' });
  }
};

exports.admitStudent = async (req, res) => {
  const { studentId } = req.body;
  try {
    const classItem = await ClassModel.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (classItem.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can admit students' });
    }
    const lobbyIndex = classItem.lobby.findIndex((item) => (item.user && item.user.toString() === studentId) || item.displayName === studentId);
    if (lobbyIndex === -1) {
      return res.status(404).json({ message: 'Student not in lobby' });
    }
    const lobbyEntry = classItem.lobby.splice(lobbyIndex, 1)[0];
    lobbyEntry.status = 'admitted';
    classItem.participants.push(lobbyEntry);
    await classItem.save();
    await User.findByIdAndUpdate(lobbyEntry.user, { status: 'online', currentClass: classItem._id });
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    if (io) {
      io.to(classItem._id.toString()).emit('participant-admitted', lobbyEntry);
      io.to(classItem.host.toString()).emit('lobby-update', classItem.lobby);
    }
    res.json({ message: 'Student admitted', participants: classItem.participants });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to admit student' });
  }
};

exports.removeStudent = async (req, res) => {
  const { studentId } = req.body;
  try {
    const classItem = await ClassModel.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (classItem.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can remove students' });
    }
    classItem.participants = classItem.participants.filter((participant) => {
      const match = participant.user && participant.user.toString() === studentId;
      if (match) {
        User.findByIdAndUpdate(participant.user, { status: 'offline', currentClass: null }).exec();
      }
      return !match;
    });
    classItem.lobby = classItem.lobby.filter((participant) => {
      const match = participant.user && participant.user.toString() === studentId;
      return !match;
    });
    await classItem.save();
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    if (io) {
      io.to(classItem._id.toString()).emit('participant-removed', { studentId });
      io.to(classItem.host.toString()).emit('lobby-update', classItem.lobby);
    }
    res.json({ message: 'Student removed', participants: classItem.participants });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to remove student' });
  }
};

exports.getClassDetails = async (req, res) => {
  try {
    const classItem = await ClassModel.findById(req.params.id)
      .populate('host', 'name email')
      .populate('participants.user', 'name email role');
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    res.json(classItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to get class details' });
  }
};

exports.getLiveClasses = async (req, res) => {
  try {
    const classes = await ClassModel.find({ status: 'live' })
      .populate('host', 'name email');
    res.json(classes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to get live classes' });
  }
};

exports.updateRecordingUrl = async (req, res) => {
  try {
    const { recordingUrl } = req.body;
    const classItem = await ClassModel.findById(req.params.id);
    
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    // Validate that it's a full URL (not just a path)
    if (recordingUrl && !recordingUrl.startsWith('http://') && !recordingUrl.startsWith('https://')) {
      return res.status(400).json({ message: 'Recording URL must be a full URL (starting with http:// or https://)' });
    }
    
    classItem.recordingUrl = recordingUrl;
    await classItem.save();
    
    res.json({ message: 'Recording URL updated', class: classItem });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update recording URL' });
  }
};
