const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderName: String,
  message: {
    type: String,
    required: true
  }
}, { timestamps: true });

chatSchema.index({ class: 1, createdAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
