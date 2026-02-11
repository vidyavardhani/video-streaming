const mongoose = require('mongoose');
const { PARTICIPANT_STATUS_LIST, CLASS_STATUS_LIST } = require('../../config/constants');

const participantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  displayName: String,
  socketId: String,
  status: {
    type: String,
    enum: PARTICIPANT_STATUS_LIST,
    default: PARTICIPANT_STATUS_LIST[0]
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
    enum: CLASS_STATUS_LIST,
    default: CLASS_STATUS_LIST[0]
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
