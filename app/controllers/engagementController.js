const { validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const ClassModel = require('../models/Class');
const { getIO } = require('../sockets/manager');
const { ensureWhiteboard } = require('../utils/classState');
const recordingService = require('../services/recordingService');
const { resolveHostAccess } = require('../utils/hostAccess');

const findClassByCode = async (code) => {
  if (!code) return null;
  return ClassModel.findOne({ meetingCode: code });
};

const ensureHost = (klass, req) => resolveHostAccess(klass, { user: req.user, request: req });

const locateParticipant = (klass, user, joinToken) => {
  if (!klass) return null;
  if (user) {
    if (klass.host.toString() === user._id.toString()) {
      return { type: 'host', name: user.name };
    }
    const participant = klass.participants.find((entry) => entry.user?.toString() === user._id.toString());
    if (participant && !participant.expelledAt) {
      return { type: 'participant', participant, name: participant.displayName };
    }
  }
  if (joinToken) {
    const participant = klass.participants.find((entry) => entry.token === joinToken && !entry.expelledAt);
    if (participant) {
      return { type: 'participant', participant, name: participant.displayName };
    }
  }
  return null;
};

exports.createPoll = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const hostContext = ensureHost(klass, req);
    if (!hostContext.isHost) {
      return res.status(403).json({ message: 'Only host can create polls' });
    }
    if (klass.activePoll && !klass.activePoll.closedAt) {
      return res.status(400).json({ message: 'A poll is already active' });
    }

    const options = (req.body.options || [])
      .map((text) => (typeof text === 'string' ? text.trim() : ''))
      .filter((text) => text.length > 0);
    if (options.length < 2) {
      return res.status(400).json({ message: 'Provide at least two options' });
    }

    klass.activePoll = {
      id: uuid(),
      question: req.body.question,
      options: options.map((label) => ({ id: uuid(), label, votes: 0 })),
      responses: [],
      createdAt: new Date()
    };
    await klass.save();

    getIO().to(klass.meetingCode).emit('poll:created', klass.activePoll);
    return res.status(201).json(klass.activePoll);
  } catch (error) {
    console.error('createPoll error', error);
    return res.status(500).json({ message: 'Unable to create poll' });
  }
};

exports.votePoll = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    if (!klass.activePoll || klass.activePoll.closedAt) {
      return res.status(400).json({ message: 'No active poll' });
    }

    const identity = locateParticipant(klass, req.user, req.body.joinToken);
    if (!identity || identity.type !== 'participant') {
      return res.status(403).json({ message: 'Only admitted participants can vote' });
    }

    const optionId = req.body.optionId;
    const option = klass.activePoll.options.find((opt) => opt.id === optionId);
    if (!option) {
      return res.status(400).json({ message: 'Option not found' });
    }

    const existing = klass.activePoll.responses.find((resp) => resp.participantToken === identity.participant.token);
    if (existing) {
      existing.optionId = optionId;
      existing.respondedAt = new Date();
    } else {
      klass.activePoll.responses.push({
        participantToken: identity.participant.token,
        optionId,
        respondedAt: new Date()
      });
    }

    klass.activePoll.options = klass.activePoll.options.map((opt) => ({
      ...opt,
      votes: klass.activePoll.responses.filter((resp) => resp.optionId === opt.id).length
    }));

    await klass.save();

    getIO().to(klass.meetingCode).emit('poll:voted', {
      pollId: klass.activePoll.id,
      responses: klass.activePoll.responses,
      options: klass.activePoll.options
    });

    return res.json({
      pollId: klass.activePoll.id,
      options: klass.activePoll.options
    });
  } catch (error) {
    console.error('votePoll error', error);
    return res.status(500).json({ message: 'Unable to submit vote' });
  }
};

exports.closePoll = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const hostContext = ensureHost(klass, req);
    if (!hostContext.isHost) {
      return res.status(403).json({ message: 'Only host can close poll' });
    }
    if (!klass.activePoll || klass.activePoll.closedAt) {
      return res.status(400).json({ message: 'No active poll to close' });
    }

    klass.activePoll.closedAt = new Date();
    klass.pollHistory = klass.pollHistory || [];
    klass.pollHistory.push(klass.activePoll);
    const closedPayload = klass.activePoll;
    klass.activePoll = null;
    await klass.save();

    getIO().to(klass.meetingCode).emit('poll:closed', closedPayload);
    return res.json(closedPayload);
  } catch (error) {
    console.error('closePoll error', error);
    return res.status(500).json({ message: 'Unable to close poll' });
  }
};

exports.askQuestion = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const identity = locateParticipant(klass, req.user, req.body.joinToken);
    if (!identity) {
      return res.status(403).json({ message: 'Not part of the class' });
    }

    const entry = {
      id: uuid(),
      askedBy: identity.participant ? identity.participant.token : req.user._id.toString(),
      askedByName: identity.name,
      question: req.body.question,
      askedAt: new Date()
    };

    klass.questions = klass.questions || [];
    klass.questions.push(entry);
    await klass.save();

    getIO().to(klass.meetingCode).emit('qna:new', entry);

    return res.status(201).json(entry);
  } catch (error) {
    console.error('askQuestion error', error);
    return res.status(500).json({ message: 'Unable to submit question' });
  }
};

exports.answerQuestion = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const hostContext = ensureHost(klass, req);
    if (!hostContext.isHost) {
      return res.status(403).json({ message: 'Only host can answer questions' });
    }

    const question = (klass.questions || []).find((q) => q.id === req.params.questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    question.answer = req.body.answer;
    question.answeredAt = new Date();
    await klass.save();

    getIO().to(klass.meetingCode).emit('qna:answered', question);

    return res.json(question);
  } catch (error) {
    console.error('answerQuestion error', error);
    return res.status(500).json({ message: 'Unable to answer question' });
  }
};

exports.clearWhiteboard = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const hostContext = ensureHost(klass, req);
    if (!hostContext.isHost) {
      return res.status(403).json({ message: 'Only host can clear whiteboard' });
    }

    ensureWhiteboard(klass);
    klass.whiteboard.strokes = [];
    klass.whiteboard.updatedAt = new Date();
    await klass.save();

    getIO().to(klass.meetingCode).emit('whiteboard:clear');
    return res.json({ message: 'Whiteboard cleared' });
  } catch (error) {
    console.error('clearWhiteboard error', error);
    return res.status(500).json({ message: 'Unable to clear whiteboard' });
  }
};

exports.startRecording = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const hostContext = ensureHost(klass, req);
    if (!hostContext.isHost) {
      return res.status(403).json({ message: 'Only host can start recording' });
    }
    if (klass.recording?.isRecording) {
      return res.status(400).json({ message: 'Recording already in progress' });
    }

    await recordingService.startRecording(klass);
    await klass.save();

    getIO().to(klass.meetingCode).emit('recording:status', {
      recording: klass.recording,
      recordedVideoLink: klass.recordedVideoLink,
      recordingClassLink: klass.recordingClassLink
    });
    return res.json(klass.recording);
  } catch (error) {
    console.error('startRecording error', error);
    return res.status(500).json({ message: 'Unable to start recording' });
  }
};

exports.pauseRecording = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const hostContext = ensureHost(klass, req);
    if (!hostContext.isHost) {
      return res.status(403).json({ message: 'Only host can pause recording' });
    }
    if (!klass.recording?.isRecording) {
      return res.status(400).json({ message: 'Recording not active' });
    }
    if (klass.recording?.isPaused) {
      return res.status(400).json({ message: 'Recording already paused' });
    }

    await recordingService.pauseRecording(klass);
    await klass.save();

    getIO().to(klass.meetingCode).emit('recording:status', {
      recording: klass.recording,
      recordedVideoLink: klass.recordedVideoLink,
      recordingClassLink: klass.recordingClassLink
    });
    return res.json({ recording: klass.recording });
  } catch (error) {
    console.error('pauseRecording error', error);
    return res.status(500).json({ message: 'Unable to pause recording' });
  }
};

exports.resumeRecording = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const hostContext = ensureHost(klass, req);
    if (!hostContext.isHost) {
      return res.status(403).json({ message: 'Only host can resume recording' });
    }
    if (!klass.recording?.isRecording) {
      return res.status(400).json({ message: 'Recording not active' });
    }
    if (!klass.recording?.isPaused) {
      return res.status(400).json({ message: 'Recording is not paused' });
    }

    await recordingService.resumeRecording(klass);
    await klass.save();

    getIO().to(klass.meetingCode).emit('recording:status', {
      recording: klass.recording,
      recordedVideoLink: klass.recordedVideoLink,
      recordingClassLink: klass.recordingClassLink
    });
    return res.json({ recording: klass.recording });
  } catch (error) {
    console.error('resumeRecording error', error);
    return res.status(500).json({ message: 'Unable to resume recording' });
  }
};

exports.stopRecording = async (req, res) => {
  try {
    const klass = await findClassByCode(req.params.code);
    if (!klass) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const hostContext = ensureHost(klass, req);
    if (!hostContext.isHost) {
      return res.status(403).json({ message: 'Only host can stop recording' });
    }

    const uploadedFile = req.file || null;
    const mimeType = uploadedFile?.mimetype || req.body?.mimeType || null;
    const durationMs = req.body?.durationMs;

    // Allow upload even if recording is already stopped (for retry attempts from IndexedDB)
    const isActiveRecording = klass.recording?.isRecording;
    
    if (!isActiveRecording && !uploadedFile) {
      // Only reject if no recording is active AND no video data is provided
      return res.status(400).json({ message: 'Recording not active and no video data provided' });
    }

    if (!isActiveRecording && uploadedFile) {
      // This is a retry/background upload attempt - log it
      console.log('Background upload retry for already stopped recording', {
        meetingCode: klass.meetingCode,
        fileSize: uploadedFile?.size,
        attempts: req.body?.attempts || 'unknown'
      });
    }

    if (!uploadedFile) {
      console.warn('Recording stop received without file payload', {
        meetingCode: klass.meetingCode,
        classId: klass._id.toString()
      });
    }

    const result = await recordingService.stopRecording(klass, {
      buffer: uploadedFile?.buffer || null,
      mimeType,
      durationMs,
      allowPlaceholder: !uploadedFile,
      isRetry: !isActiveRecording && uploadedFile // Flag retry attempts
    });
    await klass.save();

    // Emit initial recording status (with queued upload)
    getIO().to(klass.meetingCode).emit('recording:status', {
      recording: klass.recording,
      recordedVideoLink: klass.recordedVideoLink,
      recordingClassLink: klass.recordingClassLink,
      uploadStatus: klass.recording?.uploadStatus || null
    });

    // Return response indicating upload is queued
    return res.json({
      recording: klass.recording,
      recordedVideoLink: klass.recordedVideoLink,
      recordingClassLink: klass.recordingClassLink,
      uploadStatus: klass.recording?.uploadStatus || null,
      message: result?.message || 'Recording stopped'
    });
  } catch (error) {
    console.error('stopRecording error', error);
    return res.status(500).json({ message: error.message || 'Unable to stop recording' });
  }
};
