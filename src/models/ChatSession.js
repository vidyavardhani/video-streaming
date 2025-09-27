const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    senderType: { type: String, enum: ['agent', 'customer', 'system'], required: true },
    senderId: { type: String },
    body: { type: String, required: true },
    attachments: { type: [String], default: [] },
    metadata: { type: Object, default: {} },
    deliveredAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

const ChatSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    customer: {
      name: { type: String },
      email: { type: String },
      avatar: { type: String },
      externalId: { type: String }
    },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['open', 'assigned', 'closed'],
      default: 'open'
    },
    lastMessageAt: { type: Date, default: Date.now },
    messages: { type: [MessageSchema], default: [] },
    channel: { type: String, default: 'web' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatSession', ChatSessionSchema);
