const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');

const participantSessionSchema = new mongoose.Schema({
  joinedAt: {
    type: Date,
    default: Date.now
  },
  leftAt: Date
}, { _id: false });

const mediaStateSchema = new mongoose.Schema({
  audio: {
    type: Boolean,
    default: true
  },
  video: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const participantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  displayName: {
    type: String,
    required: true
  },
  token: {
    type: String,
    default: uuid
  },
  socketId: String,
  joinedAt: Date,
  mediaState: {
    type: mediaStateSchema,
    default: () => ({})
  },
  handRaisedAt: Date,
  allowedToSpeakAt: Date,
  expelledAt: Date,
  sessions: {
    type: [participantSessionSchema],
    default: () => []
  }
}, { timestamps: true });

const lobbySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  displayName: {
    type: String,
    required: true
  },
  token: {
    type: String,
    default: uuid
  },
  requestedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: false });

const whiteboardStrokeSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuid
  },
  path: {
    type: [{
      x: Number,
      y: Number
    }],
    default: () => []
  },
  color: {
    type: String,
    default: '#111827'
  },
  size: {
    type: Number,
    default: 3
  },
  author: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const whiteboardSchema = new mongoose.Schema({
  strokes: {
    type: [whiteboardStrokeSchema],
    default: () => []
  },
  updatedAt: Date
}, { _id: false });

const pollOptionSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuid
  },
  label: String,
  votes: {
    type: Number,
    default: 0
  }
}, { _id: false });

const pollResponseSchema = new mongoose.Schema(
  {
    participantToken: String,
    optionIds: {
      type: [String],
      default: () => []
    },
    respondedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const pollSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuid
  },
  question: String,
  options: {
    type: [pollOptionSchema],
    default: () => []
  },
  allowMultiple: {
    type: Boolean,
    default: false
  },
  responses: {
    type: [pollResponseSchema],
    default: () => []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  closedAt: Date
}, { _id: false });

const questionSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuid
  },
  askedBy: String,
  askedByName: String,
  question: String,
  answer: String,
  askedAt: {
    type: Date,
    default: Date.now
  },
  answeredAt: Date
}, { _id: false });

const classSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended'],
    default: 'scheduled'
  },
  meetingLink: String,
  meetingCode: {
    type: String,
    unique: true,
    index: true
  },
  chatRoomId: {
    type: String,
    default: uuid
  },
  lobby: {
    type: [lobbySchema],
    default: []
  },
  participants: {
    type: [participantSchema],
    default: []
  },
  startTime: Date,
  endTime: Date,
  whiteboard: {
    type: whiteboardSchema,
    default: () => ({ strokes: [] })
  },
  activePoll: pollSchema,
  pollHistory: {
    type: [pollSchema],
    default: () => []
  },
  questions: {
    type: [questionSchema],
    default: () => []
  },
  recording: {
    isRecording: {
      type: Boolean,
      default: false
    },
    startedAt: Date,
    fileKey: String
  },
  recordedVideoLink: String,
  recordings: {
    type: [
      {
        url: String,
        fileKey: String,
        startedAt: Date,
        endedAt: Date
      }
    ],
    default: () => []
  }
}, { timestamps: true });

classSchema.pre('save', function generateTokens(next) {
  this.lobby = this.lobby.map((entry) => {
    if (!entry.token) entry.token = uuid();
    return entry;
  });
  this.participants = this.participants.map((entry) => {
    if (!entry.token) entry.token = uuid();
    return entry;
  });
  next();
});

module.exports = mongoose.model('Class', classSchema);
