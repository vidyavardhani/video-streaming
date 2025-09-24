const { validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const ClassModel = require('../models/Class');
const { getIO } = require('../sockets/manager');
const {
  ensureChatRoom,
  ensureWhiteboard,
  startParticipantSession,
  endParticipantSession
} = require('../utils/classState');
const recordingService = require('../services/recordingService');

const baseUrl = () => process.env.BASE_URL || 'http://localhost:4000';

const generateMeetingCode = () => {
  const digits = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const createUniqueMeetingCode = async () => {
  let attempts = 0;
  while (attempts < 10) {
    const code = generateMeetingCode();
    const exists = await ClassModel.exists({ meetingCode: code });
    if (!exists) {
      return code;
    }
    attempts += 1;
  }
  throw new Error('Unable to generate unique meeting code');
};

const findClassByCode = async (code) => {
  if (!code) return null;
  return ClassModel.findOne({ meetingCode: code });
};

const getHostId = (klass) => {
  if (!klass || !klass.host) return null;
  if (klass.host._id) {
    return klass.host._id.toString();
  }
  return klass.host.toString();
};

const publicClassShape = (klass) => {
  if (!klass) return null;
  const lobbyEntries = Array.isArray(klass.lobby) ? klass.lobby : [];
  const participantEntries = Array.isArray(klass.participants) ? klass.participants : [];
  const activeParticipants = participantEntries.filter((entry) => !entry.expelledAt);
  const hostRef = klass.host || null;
  const hostId = hostRef?._id || hostRef;
  const hostDetails = hostRef
    ? {
        id: hostId ? hostId.toString() : undefined,
        name: hostRef.name || undefined,
        email: hostRef.email || undefined
      }
    : null;
  return {
    id: klass.meetingCode,
    code: klass.meetingCode,
    title: klass.title,
    status: klass.status,
    meetingLink: klass.meetingLink || `${baseUrl()}/class/${klass.meetingCode}`,
    meetingCode: klass.meetingCode,
    chatRoomId: klass.chatRoomId,
    host: hostDetails,
    lobby: lobbyEntries.map((entry) => ({
      displayName: entry.displayName,
      token: entry.token,
      requestedAt: entry.requestedAt
    })),
    participants: activeParticipants.map((entry) => ({
      displayName: entry.displayName,
      token: entry.token,
      joinedAt: entry.joinedAt,
      mediaState: entry.mediaState || { audio: true, video: true },
      handRaisedAt: entry.handRaisedAt,
      allowedToSpeakAt: entry.allowedToSpeakAt,
      sessions: entry.sessions || []
    })),
    attendance: participantEntries.map((entry) => ({
      displayName: entry.displayName,
      token: entry.token,
      sessions: entry.sessions || [],
      expelledAt: entry.expelledAt
    })),
    whiteboard: klass.whiteboard || { strokes: [], updatedAt: null },
    activePoll: klass.activePoll || null,
    pollHistory: klass.pollHistory || [],
    questions: klass.questions || [],
    recording: klass.recording || { isRecording: false },
    recordedVideoLink: klass.recordedVideoLink || null
  };
};

exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  if (!req.user || req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Only teachers can create classes' });
  }

  try {
    const meetingCode = await createUniqueMeetingCode();
    const klass = await ClassModel.create({
      title: req.body.title,
      host: req.user._id,
      meetingCode
    });
    klass.meetingLink = `${baseUrl()}/class/${meetingCode}`;
    ensureChatRoom(klass);
    ensureWhiteboard(klass);
    await klass.save();
    await klass.populate('host');
    return res.status(201).json({
      classCode: klass.meetingCode,
      meetingLink: klass.meetingLink,
      meetingCode: klass.meetingCode
    });
  } catch (error) {
    console.error('Create class error', error);
    return res.status(500).json({ message: 'Unable to create class' });
  }
};

exports.start = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (getHostId(klass) !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can start class' });
    }
    if (klass.status === 'ended') {
      return res.status(400).json({ message: 'Class already ended' });
    }

    ensureChatRoom(klass);
    ensureWhiteboard(klass);
    klass.status = 'live';
    klass.startTime = new Date();
    await klass.save();

    getIO().to(klass.meetingCode).emit('class:started', { classCode: klass.meetingCode });

    return res.json({ message: 'Class started', class: publicClassShape(await klass.populate('host')) });
  } catch (error) {
    console.error('Start class error', error);
    return res.status(500).json({ message: 'Unable to start class' });
  }
};

exports.end = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (getHostId(klass) !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can end class' });
    }
    if (klass.status === 'ended') {
      return res.status(400).json({ message: 'Class already ended' });
    }

    klass.status = 'ended';
    klass.endTime = new Date();
    klass.lobby = [];
    (klass.participants || []).forEach((participant) => {
      endParticipantSession(participant);
      participant.socketId = null;
      participant.handRaisedAt = null;
      participant.allowedToSpeakAt = null;
      participant.mediaState = participant.mediaState || { audio: true, video: true };
    });

    if (klass.recording?.isRecording) {
      await recordingService.stopRecording(klass);
    }
    await klass.save();

    getIO().to(klass.meetingCode).emit('class:ended', { classCode: klass.meetingCode });
    if (klass.recording) {
      getIO().to(klass.meetingCode).emit('recording:status', {
        recording: klass.recording,
        recordedVideoLink: klass.recordedVideoLink
      });
    }

    return res.json({ message: 'Class ended' });
  } catch (error) {
    console.error('End class error', error);
    return res.status(500).json({ message: 'Unable to end class' });
  }
};

exports.join = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (klass.status === 'ended') {
      return res.status(400).json({ message: 'Class has ended' });
    }

    const displayName = req.body.displayName?.trim();
    if (!displayName) {
      return res.status(400).json({ message: 'Display name is required' });
    }

    const existingParticipant = klass.participants.find((entry) => {
      if (req.user) {
        return entry.user?.toString() === req.user._id.toString();
      }
      return entry.displayName === displayName;
    });

    if (existingParticipant) {
      if (existingParticipant.expelledAt) {
        return res.status(403).json({ message: 'You have been removed from the class' });
      }
      startParticipantSession(existingParticipant);
      await klass.save();
      return res.json({
        message: 'Already admitted',
        joinToken: existingParticipant.token,
        participant: {
          id: existingParticipant._id,
          displayName: existingParticipant.displayName
        }
      });
    }

    const existingLobby = klass.lobby.find((entry) => {
      if (req.user) {
        return entry.user?.toString() === req.user._id.toString();
      }
      return entry.displayName === displayName;
    });

    if (existingLobby) {
      return res.json({
        message: 'Already requested',
        joinToken: existingLobby.token
      });
    }

    const entry = {
      user: req.user ? req.user._id : undefined,
      displayName,
      token: uuid()
    };
    klass.lobby.push(entry);
    await klass.save();

    const hostId = getHostId(klass);
    if (hostId) {
      getIO().to(hostId).emit('lobby:update', {
      classCode: klass.meetingCode,
      lobby: klass.lobby.map((item) => ({ displayName: item.displayName, token: item.token }))
    });
    }

    return res.status(201).json({
      message: 'Waiting for host approval',
      joinToken: entry.token
    });
  } catch (error) {
    console.error('Join class error', error);
    return res.status(500).json({ message: 'Unable to join class' });
  }
};

exports.admit = async (req, res) => {
  const { joinToken } = req.body;
  if (!joinToken) {
    return res.status(400).json({ message: 'joinToken is required' });
  }

  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (getHostId(klass) !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can admit students' });
    }

    const lobbyIndex = klass.lobby.findIndex((entry) => entry.token === joinToken);
    if (lobbyIndex === -1) {
      return res.status(404).json({ message: 'Student not in lobby' });
    }

    const lobbyEntry = klass.lobby.splice(lobbyIndex, 1)[0];
    const participant = {
      user: lobbyEntry.user,
      displayName: lobbyEntry.displayName,
      token: lobbyEntry.token,
      joinedAt: new Date(),
      mediaState: { audio: true, video: true },
      sessions: [{ joinedAt: new Date() }]
    };
    klass.participants.push(participant);
    await klass.save();

    const participantPayload = {
      displayName: participant.displayName,
      token: participant.token,
      mediaState: participant.mediaState,
      joinedAt: participant.joinedAt
    };

    const payload = {
      classCode: klass.meetingCode,
      participant: participantPayload
    };

    const io = getIO();
    io.to(klass.meetingCode).emit('participant:joined', payload);
    io.to(participant.token).emit('participant:approved', {
      ...payload,
      classStatus: klass.status
    });
    const hostId = getHostId(klass);
    if (hostId) {
      io.to(hostId).emit('lobby:update', {
      classCode: klass.meetingCode,
      lobby: klass.lobby.map((item) => ({ displayName: item.displayName, token: item.token }))
    });
    }

    return res.json({ message: 'Student admitted', participant: payload.participant });
  } catch (error) {
    console.error('Admit student error', error);
    return res.status(500).json({ message: 'Unable to admit student' });
  }
};

exports.remove = async (req, res) => {
  const { joinToken } = req.body;
  if (!joinToken) {
    return res.status(400).json({ message: 'joinToken is required' });
  }

  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (getHostId(klass) !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can remove students' });
    }

    const participantIndex = klass.participants.findIndex((entry) => entry.token === joinToken);
    const lobbyIndex = klass.lobby.findIndex((entry) => entry.token === joinToken);
    let removed = null;

    if (participantIndex !== -1) {
      removed = klass.participants[participantIndex];
      endParticipantSession(removed);
      removed.expelledAt = new Date();
      removed.socketId = null;
    } else if (lobbyIndex !== -1) {
      removed = klass.lobby.splice(lobbyIndex, 1)[0];
    }

    if (!removed) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    await klass.save();

    const io = getIO();
    io.to(klass.meetingCode).emit('participant:removed', { joinToken });
    io.to(joinToken).emit('participant:removed', { joinToken });
    const hostId = getHostId(klass);
    if (hostId) {
      io.to(hostId).emit('lobby:update', {
      classCode: klass.meetingCode,
      lobby: klass.lobby.map((item) => ({ displayName: item.displayName, token: item.token }))
    });
    }

    return res.json({ message: 'Participant removed' });
  } catch (error) {
    console.error('Remove participant error', error);
    return res.status(500).json({ message: 'Unable to remove participant' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const klass = await ClassModel.findOne({ meetingCode: req.params.code }).populate('host');
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }

    return res.json(publicClassShape(klass));
  } catch (error) {
    console.error('Get class error', error);
    return res.status(500).json({ message: 'Unable to fetch class' });
  }
};

exports.live = async (req, res) => {
  try {
    const classes = await ClassModel.find({ status: 'live' }).populate('host');
    return res.json(classes.map(publicClassShape));
  } catch (error) {
    console.error('Live classes error', error);
    return res.status(500).json({ message: 'Unable to fetch live classes' });
  }
};

exports.mine = async (req, res) => {
  if (!req.user || req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Teachers only' });
  }
  try {
    const classes = await ClassModel.find({ host: req.user._id }).sort({ createdAt: -1 }).populate('host');
    return res.json(classes.map(publicClassShape));
  } catch (error) {
    console.error('My classes error', error);
    return res.status(500).json({ message: 'Unable to load classes' });
  }
};
