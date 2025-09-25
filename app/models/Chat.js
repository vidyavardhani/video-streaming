const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  room: {
    type: String,
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  senderName: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  system: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Chat', chatSchema);
