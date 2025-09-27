const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatSession', required: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerSessionId: { type: String, required: true },
    status: {
      type: String,
      enum: ['initiated', 'ringing', 'active', 'ended', 'missed'],
      default: 'initiated'
    },
    offer: { type: Object },
    answer: { type: Object },
    iceCandidates: { type: [Object], default: [] },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Call', CallSchema);
