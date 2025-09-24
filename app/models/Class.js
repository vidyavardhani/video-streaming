const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');

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
  joinedAt: Date
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
  meetingCode: String,
  lobby: {
    type: [lobbySchema],
    default: []
  },
  participants: {
    type: [participantSchema],
    default: []
  },
  startTime: Date,
  endTime: Date
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
