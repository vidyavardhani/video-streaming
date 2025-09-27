const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const User = require('../models/User');
const ClassModel = require('../models/Class');
const DeveloperKey = require('../models/DeveloperKey');
const HostKey = require('../models/HostKey');
const { ensureChatRoom, ensureWhiteboard } = require('../utils/classState');
const { upsertAutoJoinEntry, syncAutoJoinees } = require('../utils/autoJoin');
const { getIO } = require('../sockets/manager');

const baseUrl = () => process.env.BASE_URL || 'http://localhost:4000';

const generateMeetingCode = async () => {
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const digits = Math.floor(100000000 + Math.random() * 900000000).toString();
    const candidate = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    const exists = await ClassModel.exists({ meetingCode: candidate });
    if (!exists) {
      return candidate;
    }
  }
  return uuid();
};

const toClassPayload = (klass) => ({
  classId: klass._id.toString(),
  classCode: klass.meetingCode,
  title: klass.title,
  status: klass.status,
  meetingLink: klass.meetingLink || `${baseUrl()}/class/${klass.meetingCode}`,
  autoJoineeIds: Array.isArray(klass.autoJoineeIds) ? klass.autoJoineeIds : [],
  autoJoinRoster: (klass.autoJoinRoster || []).map((entry) => ({
    studentId: entry.studentId,
    displayName: entry.displayName,
    joinToken: entry.joinToken,
    lastJoinedAt: entry.lastJoinedAt
  }))
});

const toParticipantPayload = (participant) => ({
  displayName: participant.displayName,
  token: participant.token,
  autoJoinId: participant.autoJoinId || null,
  mediaState: participant.mediaState || { audio: false, video: false },
  joinedAt: participant.joinedAt
});

exports.registerHost = async (req, res) => {
  const name = req.body?.name?.trim();
  const email = req.body?.email?.toLowerCase();
  const password = req.body?.password;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, and password are required' });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role: 'teacher' });

    const developerKey = await DeveloperKey.create({
      owner: user._id,
      label: `${name}'s key`,
      key: `dev_${uuid()}`
    });

    const hostKey = await HostKey.create({
      developerKey: developerKey._id,
      key: `host_${uuid()}`,
      assignedTo: user._id,
      label: `${name}'s host key`
    });

    developerKey.touchHostCount(1);
    await developerKey.save();

    return res.status(201).json({
      hostId: user._id.toString(),
      developerKey: developerKey.key,
      hostKey: hostKey.key
    });
  } catch (error) {
    console.error('registerHost error', error);
    return res.status(500).json({ message: 'Unable to register host' });
  }
};

const resolveDeveloperKey = async (key) => {
  if (!key) return null;
  return DeveloperKey.findOne({ key }).populate('owner');
};

const findHostKey = async (developerKey, hostId) => {
  if (!developerKey || !hostId) return null;
  const hostKey = await HostKey.findOne({
    developerKey: developerKey._id,
    assignedTo: hostId,
    active: true
  });
  return hostKey;
};

exports.createClass = async (req, res) => {
  const { developerKey: keyValue, hostId, title } = req.body || {};
  if (!keyValue || !hostId || !title) {
    return res.status(400).json({ message: 'developerKey, hostId, and title are required' });
  }

  try {
    const developerKey = await resolveDeveloperKey(keyValue);
    if (!developerKey) {
      return res.status(401).json({ message: 'Invalid developerKey' });
    }

    const host = await User.findById(hostId);
    if (!host || host.role !== 'teacher') {
      return res.status(404).json({ message: 'Host not found' });
    }

    if (developerKey.owner.toString() !== host._id.toString()) {
      return res.status(403).json({ message: 'Developer key does not match host' });
    }

    const hostKey = await findHostKey(developerKey, hostId);
    const meetingCode = await generateMeetingCode();
    const klass = await ClassModel.create({
      title: title.trim(),
      meetingCode,
      meetingLink: `${baseUrl()}/class/${meetingCode}`,
      host: host._id,
      developerKey: developerKey._id,
      hostKey: hostKey ? hostKey._id : undefined
    });
    ensureChatRoom(klass);
    ensureWhiteboard(klass);
    await klass.save();

    return res.status(201).json({
      class: toClassPayload(klass)
    });
  } catch (error) {
    console.error('createClass error', error);
    return res.status(500).json({ message: 'Unable to create class' });
  }
};

const findClassByIdentifier = async (identifier) => {
  if (!identifier) return null;
  if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
    const byId = await ClassModel.findById(identifier).populate('host');
    if (byId) return byId;
  }
  return ClassModel.findOne({ meetingCode: identifier }).populate('host');
};

exports.purchaseCourse = async (req, res) => {
  const { studentId, classId, displayName, developerKey: keyValue } = req.body || {};
  if (!studentId || !classId) {
    return res.status(400).json({ message: 'studentId and classId are required' });
  }
  if (!keyValue) {
    return res.status(400).json({ message: 'developerKey is required' });
  }

  try {
    const developerKey = await resolveDeveloperKey(keyValue);
    if (!developerKey) {
      return res.status(401).json({ message: 'Invalid developerKey' });
    }

    const klass = await findClassByIdentifier(classId);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (developerKey._id.toString() !== String(klass.developerKey)) {
      return res.status(403).json({ message: 'Developer key does not match class' });
    }

    const entry = upsertAutoJoinEntry(klass, { studentId, displayName });
    const live = klass.status === 'live';
    const created = live ? syncAutoJoinees(klass, { live: true }) : [];
    klass.markModified('autoJoinRoster');
    klass.markModified('autoJoineeIds');
    if (live) {
      klass.markModified('participants');
    }
    await klass.save();

    if (created.length) {
      const io = getIO();
      created.forEach((participant) => {
        io.to(klass.meetingCode).emit('participant:joined', {
          classCode: klass.meetingCode,
          participant: {
            displayName: participant.displayName,
            token: participant.token,
            mediaState: participant.mediaState || { audio: false, video: false },
            autoJoinId: participant.autoJoinId
          }
        });
      });
    }

    return res.status(200).json({
      classId: klass._id.toString(),
      studentId: entry.studentId,
      joinToken: entry.joinToken,
      autoJoineeIds: klass.autoJoineeIds
    });
  } catch (error) {
    console.error('purchaseCourse error', error);
    return res.status(500).json({ message: 'Unable to register purchase' });
  }
};

exports.startClass = async (req, res) => {
  const { hostId, classId, developerKey: keyValue } = req.body || {};
  if (!hostId || !classId) {
    return res.status(400).json({ message: 'hostId and classId are required' });
  }

  try {
    const klass = await findClassByIdentifier(classId);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (klass.host.toString() !== hostId) {
      return res.status(403).json({ message: 'Host mismatch' });
    }

    if (keyValue) {
      const developerKey = await resolveDeveloperKey(keyValue);
      if (!developerKey || developerKey._id.toString() !== String(klass.developerKey)) {
        return res.status(401).json({ message: 'Invalid developerKey' });
      }
    }

    if (klass.status !== 'live') {
      klass.status = 'live';
      klass.startTime = new Date();
    }
    const created = syncAutoJoinees(klass, { live: true });
    klass.markModified('autoJoinRoster');
    klass.markModified('participants');
    klass.markModified('autoJoineeIds');
    await klass.save();

    const io = getIO();
    io.to(klass.meetingCode).emit('class:started', {
      classCode: klass.meetingCode,
      autoJoinees: created.map((participant) => ({
        displayName: participant.displayName,
        token: participant.token,
        autoJoinId: participant.autoJoinId
      }))
    });
    created.forEach((participant) => {
      io.to(klass.meetingCode).emit('participant:joined', {
        classCode: klass.meetingCode,
        participant: {
          displayName: participant.displayName,
          token: participant.token,
          mediaState: participant.mediaState || { audio: false, video: false },
          autoJoinId: participant.autoJoinId
        }
      });
    });

    return res.status(200).json({
      message: 'Class started',
      class: toClassPayload(klass)
    });
  } catch (error) {
    console.error('startClass error', error);
    return res.status(500).json({ message: 'Unable to start class' });
  }
};

exports.listParticipants = async (req, res) => {
  try {
    const klass = await findClassByIdentifier(req.params.id);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    return res.status(200).json({
      class: {
        classId: klass._id.toString(),
        classCode: klass.meetingCode,
        title: klass.title,
        status: klass.status,
        host: klass.host?._id ? {
          id: klass.host._id.toString(),
          name: klass.host.name
        } : null,
        participants: (klass.participants || []).map(toParticipantPayload),
        autoJoineeIds: Array.isArray(klass.autoJoineeIds) ? klass.autoJoineeIds : []
      }
    });
  } catch (error) {
    console.error('listParticipants error', error);
    return res.status(500).json({ message: 'Unable to load participants' });
  }
};

exports.summary = async (req, res) => {
  if (!req.user || req.user.role !== 'teacher') {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const developerKey = await DeveloperKey.findOne({ owner: req.user._id });
    const hostKey = developerKey
      ? await HostKey.findOne({ developerKey: developerKey._id, assignedTo: req.user._id })
      : null;
    const classes = await ClassModel.find({ host: req.user._id }).sort({ createdAt: -1 });

    return res.json({
      hostId: req.user._id.toString(),
      developerKey: developerKey ? developerKey.key : null,
      hostKey: hostKey ? hostKey.key : null,
      classes: classes.map(toClassPayload)
    });
  } catch (error) {
    console.error('summary error', error);
    return res.status(500).json({ message: 'Unable to load developer summary' });
  }
};
