const { v4: uuid } = require('uuid');
const ClassModel = require('../models/Class');
const DeveloperKey = require('../models/DeveloperKey');
const HostKey = require('../models/HostKey');
const ChatModel = require('../models/Chat');
const { ensureChatRoom, ensureWhiteboard } = require('../utils/classState');
const { getIO } = require('../sockets/manager');

const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 120;
const rateBuckets = new Map();

const formatKeyForLog = (key = '') => {
  if (!key) return 'unknown';
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
};

const hitRateLimit = (identifier, { limit = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS } = {}) => {
  if (!identifier) return false;
  const now = Date.now();
  const bucket = rateBuckets.get(identifier);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(identifier, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  rateBuckets.set(identifier, bucket);
  return bucket.count > limit;
};

const enforceRateLimit = (identifier, res, options = {}) => {
  if (hitRateLimit(identifier, options)) {
    res.status(429).json({ message: 'Rate limit exceeded' });
    return true;
  }
  return false;
};

const auditLog = (event, context = {}) => {
  try {
    const payload = { ...context };
    if (payload.developerKey) {
      payload.developerKey = formatKeyForLog(payload.developerKey);
    }
    if (payload.hostKey) {
      payload.hostKey = formatKeyForLog(payload.hostKey);
    }
    console.info(`[IntegrationAPI] ${event}`, payload);
  } catch (error) {
    console.warn('Integration audit log failed', error);
  }
};

const parseCursor = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const meetingShape = (klass) => ({
  code: klass.meetingCode,
  title: klass.title,
  status: klass.status,
  meetingLink: klass.meetingLink,
  startTime: klass.startTime,
  endTime: klass.endTime,
  developerKey: klass.developerKey,
  hostKey: klass.hostKey
});

exports.createDeveloperKey = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const label = req.body?.label?.trim() || 'Default';
    if (enforceRateLimit(`user:${req.user._id}`, res, { limit: 20 })) {
      return;
    }
    const key = `dev_${uuid()}`;
    const developerKey = await DeveloperKey.create({ owner: req.user._id, label, key });
    auditLog('developerKey:create', { user: req.user._id?.toString(), label });
    return res.status(201).json({ key: developerKey.key, label: developerKey.label });
  } catch (error) {
    console.error('createDeveloperKey error', error);
    return res.status(500).json({ message: 'Unable to create developer key' });
  }
};

exports.createHostKey = async (req, res) => {
  const developerKey = req.developerKey;
  if (!developerKey) {
    return res.status(401).json({ message: 'Developer key required' });
  }
  try {
    const label = req.body?.label?.trim() || `Host ${developerKey.hostCount + 1}`;
    if (enforceRateLimit(`developer:${developerKey.key}`, res)) {
      return;
    }
    const projectSlug = req.body?.projectSlug?.trim();
    const key = `host_${uuid()}`;
    const hostKey = await HostKey.create({
      developerKey: developerKey._id,
      key,
      label,
      projectSlug,
      assignedTo: req.body?.assignedTo || developerKey.owner
    });
    developerKey.touchHostCount(1);
    await developerKey.save();
    auditLog('hostKey:create', {
      developerKey: developerKey.key,
      hostKey: key,
      label,
      projectSlug
    });
    return res.status(201).json({ key: hostKey.key, label: hostKey.label, projectSlug: hostKey.projectSlug });
  } catch (error) {
    console.error('createHostKey error', error);
    return res.status(500).json({ message: 'Unable to create host key' });
  }
};

exports.createMeeting = async (req, res) => {
  const hostKey = req.hostKey;
  if (!hostKey) {
    return res.status(401).json({ message: 'Host key required' });
  }
  try {
    const title = req.body?.title?.trim();
    if (!title) {
      return res.status(400).json({ message: 'title is required' });
    }
    if (enforceRateLimit(`host:${hostKey.key}`, res, { limit: 60 })) {
      return;
    }
    const meetingCode = await (async () => {
      let code;
      for (let i = 0; i < 6; i += 1) {
        code = `${Math.floor(100000 + Math.random() * 900000)}-${Math.floor(100000 + Math.random() * 900000)}`;
        const exists = await ClassModel.exists({ meetingCode: code });
        if (!exists) return code;
      }
      return uuid();
    })();

    const hostUser = hostKey.assignedTo || hostKey.developerKey?.owner;
    if (!hostUser) {
      return res.status(400).json({ message: 'Host key is not linked to a user account' });
    }

    const klass = await ClassModel.create({
      title,
      meetingCode,
      meetingLink: `${process.env.BASE_URL || 'https://stream.kalp.ltd'}/class/${meetingCode}`,
      host: hostUser,
      developerKey: hostKey.developerKey,
      hostKey: hostKey._id
    });
    ensureChatRoom(klass);
    ensureWhiteboard(klass);
    await klass.save();

    auditLog('meeting:create', { hostKey: hostKey.key, meetingCode });
    return res.status(201).json({ meeting: meetingShape(klass) });
  } catch (error) {
    console.error('createMeeting error', error);
    return res.status(500).json({ message: 'Unable to create meeting' });
  }
};

exports.inviteParticipants = async (req, res) => {
  const hostKey = req.hostKey;
  if (!hostKey) {
    return res.status(401).json({ message: 'Host key required' });
  }
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code, hostKey: hostKey._id });
    if (!klass) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    const participants = Array.isArray(req.body?.participants) ? req.body.participants : [];
    if (!participants.length) {
      return res.status(400).json({ message: 'participants array required' });
    }
    if (enforceRateLimit(`host:${hostKey.key}:invite`, res, { limit: 200 })) {
      return;
    }
    const created = participants.map((entry) => {
      const displayName = entry.displayName?.trim();
      if (!displayName) return null;
      const token = entry.token?.trim() || uuid();
      const existing = klass.participants.find((participant) => participant.token === token || participant.displayName === displayName);
      if (existing) {
        existing.autoAdmit = true;
        existing.inviteSource = 'api';
        return existing;
      }
      const participant = {
        displayName,
        token,
        autoAdmit: true,
        inviteSource: 'api',
        mediaState: { audio: false, video: false },
        sessions: []
      };
      klass.participants.push(participant);
      return participant;
    }).filter(Boolean);
    await klass.save();
    auditLog('participants:invite', {
      hostKey: hostKey.key,
      meetingCode: klass.meetingCode,
      count: created.length
    });
    return res.status(200).json({ participants: created.map((p) => ({ displayName: p.displayName, token: p.token })) });
  } catch (error) {
    console.error('inviteParticipants error', error);
    return res.status(500).json({ message: 'Unable to invite participants' });
  }
};

exports.joinViaApi = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code });
    if (!klass) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    const token = req.body?.token?.trim();
    if (!token) {
      return res.status(400).json({ message: 'token is required' });
    }
    if (enforceRateLimit(`join:${klass.meetingCode}:${token}`, res, { limit: 30, windowMs: 300000 })) {
      return;
    }
    const participant = klass.participants.find((entry) => entry.token === token);
    if (!participant) {
      return res.status(404).json({ message: 'Invite not found' });
    }
    participant.autoAdmit = true;
    participant.inviteSource = participant.inviteSource || 'api';
    await klass.save();
    auditLog('invite:confirm', { meetingCode: klass.meetingCode, token });
    return res.json({
      message: 'Invite confirmed',
      joinToken: participant.token,
      displayName: participant.displayName,
      meeting: meetingShape(klass)
    });
  } catch (error) {
    console.error('joinViaApi error', error);
    return res.status(500).json({ message: 'Unable to process join' });
  }
};

exports.fetchChatHistory = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code });
    if (!klass) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    const room = klass.chatRoomId;
    if (enforceRateLimit(`chatFetch:${room}`, res, { limit: 240, windowMs: 60000 })) {
      return;
    }
    const limitParam = Number.parseInt(req.query?.limit, 10);
    const limit = Number.isNaN(limitParam) ? 100 : Math.min(Math.max(limitParam, 1), 500);
    const before = parseCursor(req.query?.before);
    const criteria = { room };
    if (before) {
      criteria.createdAt = { ...criteria.createdAt, $lt: before };
    }
    const docs = await ChatModel.find(criteria).sort({ createdAt: -1 }).limit(limit + 1);
    const hasMore = docs.length > limit;
    const slice = docs.slice(0, limit);
    const ordered = slice.reverse();
    const nextCursor = hasMore && ordered.length ? ordered[0].createdAt : null;
    const latestCursor = ordered.length ? ordered[ordered.length - 1].createdAt : null;
    auditLog('chat:history', {
      meetingCode: klass.meetingCode,
      count: ordered.length,
      before: before ? before.toISOString() : undefined
    });
    return res.json({
      messages: ordered,
      nextCursor,
      latestCursor,
      hasMore
    });
  } catch (error) {
    console.error('fetchChatHistory error', error);
    return res.status(500).json({ message: 'Unable to fetch chat' });
  }
};

exports.sendChatMessage = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code });
    if (!klass) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    const message = req.body?.message?.trim();
    if (!message) {
      return res.status(400).json({ message: 'message is required' });
    }
    if (enforceRateLimit(`chatSend:${klass.chatRoomId}`, res, { limit: 120, windowMs: 60000 })) {
      return;
    }
    const sender = req.body?.sender || { id: null, name: 'API Bot' };
    const entry = await ChatModel.create({
      room: klass.chatRoomId,
      message: message.slice(0, 4000),
      senderId: sender.id,
      senderName: sender.name,
      type: 'text'
    });
    getIO().to(klass.meetingCode).emit('chat:new', entry);
    auditLog('chat:send', {
      meetingCode: klass.meetingCode,
      sender: sender.name,
      length: message.length
    });
    return res.status(201).json({ message: entry });
  } catch (error) {
    console.error('sendChatMessage error', error);
    return res.status(500).json({ message: 'Unable to send chat message' });
  }
};

exports.setRecordingState = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code });
    if (!klass) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    if (enforceRateLimit(`recording:${klass.meetingCode}`, res, { limit: 30, windowMs: 300000 })) {
      return;
    }
    const recording = req.body?.recording === true;
    klass.recording = klass.recording || {};
    klass.recording.isRecording = recording;
    klass.recording.startedAt = recording ? new Date() : klass.recording.startedAt;
    await klass.save();
    getIO().to(klass.meetingCode).emit('recording:status', { recording: klass.recording });
    auditLog('recording:toggle', { meetingCode: klass.meetingCode, recording });
    return res.json({ recording: klass.recording });
  } catch (error) {
    console.error('setRecordingState error', error);
    return res.status(500).json({ message: 'Unable to toggle recording' });
  }
};

exports.toggleScreenShare = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code });
    if (!klass) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    if (enforceRateLimit(`screen:${klass.meetingCode}`, res, { limit: 60, windowMs: 300000 })) {
      return;
    }
    const active = req.body?.active === true;
    getIO().to(klass.meetingCode).emit('screen:api-toggle', { active });
    auditLog('screen:toggle', { meetingCode: klass.meetingCode, active });
    return res.json({ active });
  } catch (error) {
    console.error('toggleScreenShare error', error);
    return res.status(500).json({ message: 'Unable to toggle screen share' });
  }
};
