const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  displayName: String,
  socketId: String,
  status: {
    type: String,
    enum: ['pending', 'admitted', 'removed'],
    default: 'pending'
  }
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
  meetingLink: {
    type: String
  },
  meetingCode: {
    type: String
  },
  participants: {
    type: [participantSchema],
    default: []
  },
  lobby: {
    type: [participantSchema],
    default: []
  },
  startTime: Date,
  endTime: Date,
  recordingUrl: {
    type: String,
    default: null
  }
}, { timestamps: true });

classSchema.index({ host: 1 });
classSchema.index({ status: 1 });

module.exports = mongoose.model('Class', classSchema);
