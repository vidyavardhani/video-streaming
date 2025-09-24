const { validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const ClassModel = require('../models/Class');
const { getIO } = require('../sockets/manager');

const baseUrl = () => process.env.BASE_URL || 'http://localhost:4000';

const generateMeetingCode = () => {
  const digits = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const publicClassShape = (klass) => ({
  id: klass._id,
  title: klass.title,
  status: klass.status,
  meetingLink: klass.meetingLink,
  meetingCode: klass.meetingCode,
  host: klass.host ? {
    id: klass.host._id,
    name: klass.host.name,
    email: klass.host.email
  } : null,
  lobby: klass.lobby.map((entry) => ({
    displayName: entry.displayName,
    token: entry.token,
    requestedAt: entry.requestedAt
  })),
  participants: klass.participants.map((entry) => ({
    id: entry._id,
    displayName: entry.displayName,
    token: entry.token,
    joinedAt: entry.joinedAt
  }))
});

exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  if (!req.user || req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Only teachers can create classes' });
  }

  try {
    const klass = await ClassModel.create({
      title: req.body.title,
      host: req.user._id,
      meetingCode: generateMeetingCode()
    });
    klass.meetingLink = `${baseUrl()}/class/${klass._id}`;
    await klass.save();
    return res.status(201).json({
      classId: klass._id,
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
    const klass = await ClassModel.findById(req.params.id);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (klass.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can start class' });
    }
    if (klass.status === 'ended') {
      return res.status(400).json({ message: 'Class already ended' });
    }

    klass.status = 'live';
    klass.startTime = new Date();
    await klass.save();

    getIO().to(klass._id.toString()).emit('class:started', { classId: klass._id });

    return res.json({ message: 'Class started', class: publicClassShape(await klass.populate('host')) });
  } catch (error) {
    console.error('Start class error', error);
    return res.status(500).json({ message: 'Unable to start class' });
  }
};

exports.end = async (req, res) => {
  try {
    const klass = await ClassModel.findById(req.params.id);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (klass.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can end class' });
    }
    if (klass.status === 'ended') {
      return res.status(400).json({ message: 'Class already ended' });
    }

    klass.status = 'ended';
    klass.endTime = new Date();
    klass.participants = [];
    klass.lobby = [];
    await klass.save();

    getIO().to(klass._id.toString()).emit('class:ended', { classId: klass._id });

    return res.json({ message: 'Class ended' });
  } catch (error) {
    console.error('End class error', error);
    return res.status(500).json({ message: 'Unable to end class' });
  }
};

exports.join = async (req, res) => {
  try {
    const klass = await ClassModel.findById(req.params.id);
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

    getIO().to(klass.host.toString()).emit('lobby:update', {
      classId: klass._id,
      lobby: klass.lobby.map((item) => ({ displayName: item.displayName, token: item.token }))
    });

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
    const klass = await ClassModel.findById(req.params.id);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (klass.host.toString() !== req.user._id.toString()) {
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
      joinedAt: new Date()
    };
    klass.participants.push(participant);
    await klass.save();

    const payload = {
      classId: klass._id,
      participant: {
        displayName: participant.displayName,
        token: participant.token
      }
    };

    const io = getIO();
    io.to(klass._id.toString()).emit('participant:joined', payload);
    io.to(participant.token).emit('participant:approved', payload);
    io.to(klass.host.toString()).emit('lobby:update', {
      classId: klass._id,
      lobby: klass.lobby.map((item) => ({ displayName: item.displayName, token: item.token }))
    });

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
    const klass = await ClassModel.findById(req.params.id);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (klass.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can remove students' });
    }

    const participantIndex = klass.participants.findIndex((entry) => entry.token === joinToken);
    const lobbyIndex = klass.lobby.findIndex((entry) => entry.token === joinToken);
    let removed = null;

    if (participantIndex !== -1) {
      removed = klass.participants.splice(participantIndex, 1)[0];
    } else if (lobbyIndex !== -1) {
      removed = klass.lobby.splice(lobbyIndex, 1)[0];
    }

    if (!removed) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    await klass.save();

    const io = getIO();
    io.to(klass._id.toString()).emit('participant:removed', { joinToken });
    io.to(joinToken).emit('participant:removed', { joinToken });
    io.to(klass.host.toString()).emit('lobby:update', {
      classId: klass._id,
      lobby: klass.lobby.map((item) => ({ displayName: item.displayName, token: item.token }))
    });

    return res.json({ message: 'Participant removed' });
  } catch (error) {
    console.error('Remove participant error', error);
    return res.status(500).json({ message: 'Unable to remove participant' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const klass = await ClassModel.findById(req.params.id).populate('host');
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
