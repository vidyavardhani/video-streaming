const { validationResult } = require('express-validator');
const ClassModel = require('../models/Class');
const User = require('../models/User');
const { getIO } = require('../sockets/io');
const config = require('../../config/config');
const logger = require('../../config/logger');
const {
  HOST_ROLES,
  CLASS_STATUS,
  PARTICIPANT_STATUS,
  USER_STATUS
} = require('../../config/constants');

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
    if (!HOST_ROLES.includes(host.role)) {
      return res.status(403).json({ message: 'Only teachers can create classes' });
    }
    const { title } = req.body;
    const meetingCode = generateMeetingCode();
    const newClass = await ClassModel.create({
      title,
      host: host._id,
      meetingCode
    });
    newClass.meetingLink = `${config.BASE_URL}/class/${newClass._id}`;
    await newClass.save();
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    logger.info('[class] Class created', { classId: newClass._id, hostId: host._id, title: newClass.title });
    res.status(201).json({
      classId: newClass._id,
      meetingLink: newClass.meetingLink,
      meetingCode: newClass.meetingCode
    });
    if (io) {
      io.to(host._id.toString()).emit('class-created', newClass);
    }
  } catch (error) {
    logger.error('[class] createClass failed', error);
    res.status(500).json({ message: 'Failed to create class', error: error.message });
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
    classItem.status = CLASS_STATUS.LIVE;
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
    logger.info('[class] Class started', { classId: classItem._id });
    res.json({ message: 'Class started', class: classItem });
  } catch (error) {
    logger.error('[class] startClass failed', error);
    res.status(500).json({ message: 'Failed to start class', error: error.message });
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
    classItem.status = CLASS_STATUS.ENDED;
    classItem.endTime = new Date();
    const updates = classItem.participants.map(async (p) => {
      if (p.user) {
        await User.findByIdAndUpdate(p.user, { status: USER_STATUS.OFFLINE, currentClass: null });
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
    logger.info('[class] Class ended', { classId: classItem._id });
    res.json({ message: 'Class ended' });
  } catch (error) {
    logger.error('[class] endClass failed', error);
    res.status(500).json({ message: 'Failed to end class', error: error.message });
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
      status: PARTICIPANT_STATUS.PENDING
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
    logger.error('[class] joinClass failed', error);
    res.status(500).json({ message: 'Failed to join class', error: error.message });
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
    lobbyEntry.status = PARTICIPANT_STATUS.ADMITTED;
    classItem.participants.push(lobbyEntry);
    await classItem.save();
    await User.findByIdAndUpdate(lobbyEntry.user, { status: USER_STATUS.ONLINE, currentClass: classItem._id });
    const isRelay = classItem.participants.length <= 6;
    const lobbyData = typeof lobbyEntry.toObject === 'function' ? lobbyEntry.toObject() : { ...lobbyEntry };
    const payload = { ...lobbyData, isRelay };
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    if (io) {
      io.to(classItem._id.toString()).emit('participant-admitted', payload);
      io.to(classItem.host.toString()).emit('lobby-update', classItem.lobby);
      if (!isRelay && lobbyEntry.socketId) {
        const relayIndex = (classItem.participants.length - 1 - 6) % 6;
        const relayParticipant = classItem.participants[relayIndex];
        const relaySocketId = relayParticipant && relayParticipant.socketId;
        if (relaySocketId) {
          io.to(relaySocketId).emit('relay-add-leaf', { leafSocketId: lobbyEntry.socketId });
          io.to(lobbyEntry.socketId).emit('your-relay-is', { relaySocketId });
        }
      }
    }
    res.json({ message: 'Student admitted', participants: classItem.participants });
  } catch (error) {
    logger.error('[class] admitStudent failed', error);
    res.status(500).json({ message: 'Failed to admit student', error: error.message });
  }
};

exports.admitStudentsBatch = async (req, res) => {
  const validationErrors = validationResult(req);
  if (!validationErrors.isEmpty()) {
    return res.status(400).json({ errors: validationErrors.array() });
  }
  const { studentIds } = req.body;
  try {
    const classItem = await ClassModel.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (classItem.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can admit students' });
    }
    let io;
    try {
      io = getIO();
    } catch (error) {
      io = null;
    }
    const admitted = [];
    const errors = [];
    for (const studentId of studentIds) {
      const lobbyIndex = classItem.lobby.findIndex(
        (item) => (item.user && item.user.toString() === studentId) || item.displayName === studentId
      );
      if (lobbyIndex === -1) {
        errors.push({ studentId, message: 'Not in lobby' });
        continue;
      }
      const lobbyEntry = classItem.lobby.splice(lobbyIndex, 1)[0];
      lobbyEntry.status = PARTICIPANT_STATUS.ADMITTED;
      classItem.participants.push(lobbyEntry);
      await User.findByIdAndUpdate(lobbyEntry.user, { status: USER_STATUS.ONLINE, currentClass: classItem._id });
      const isRelay = classItem.participants.length <= 6;
      const lobbyData = typeof lobbyEntry.toObject === 'function' ? lobbyEntry.toObject() : { ...lobbyEntry };
      const payload = { ...lobbyData, isRelay };
      if (io) {
        io.to(classItem._id.toString()).emit('participant-admitted', payload);
        io.to(classItem.host.toString()).emit('lobby-update', classItem.lobby);
        if (!isRelay && lobbyEntry.socketId) {
          const relayIndex = (classItem.participants.length - 1 - 6) % 6;
          const relayParticipant = classItem.participants[relayIndex];
          const relaySocketId = relayParticipant && relayParticipant.socketId;
          if (relaySocketId) {
            io.to(relaySocketId).emit('relay-add-leaf', { leafSocketId: lobbyEntry.socketId });
            io.to(lobbyEntry.socketId).emit('your-relay-is', { relaySocketId });
          }
        }
      }
      admitted.push(studentId);
    }
    await classItem.save();
    res.json({
      message: 'Batch admit completed',
      admitted,
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    logger.error('[class] admitStudentsBatch failed', error);
    res.status(500).json({ message: 'Failed to admit students', error: error.message });
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
        User.findByIdAndUpdate(participant.user, { status: USER_STATUS.OFFLINE, currentClass: null }).exec();
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
    logger.error('[class] removeStudent failed', error);
    res.status(500).json({ message: 'Failed to remove student', error: error.message });
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
    logger.error('[class] getClassDetails failed', error);
    res.status(500).json({ message: 'Failed to get class details', error: error.message });
  }
};

exports.getLiveClasses = async (req, res) => {
  try {
    const classes = await ClassModel.find({ status: CLASS_STATUS.LIVE })
      .populate('host', 'name email');
    res.json(classes);
  } catch (error) {
    logger.error('[class] getLiveClasses failed', error);
    res.status(500).json({ message: 'Failed to get live classes', error: error.message });
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
    logger.error('[class] updateRecordingUrl failed', error);
    res.status(500).json({ message: 'Failed to update recording URL', error: error.message });
  }
};
