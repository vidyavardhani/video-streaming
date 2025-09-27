const mongoose = require('mongoose');

const directChatSchema = new mongoose.Schema(
  {
    classCode: {
      type: String,
      required: true,
      index: true
    },
    conversation: {
      type: String,
      required: true,
      index: true
    },
    fromToken: {
      type: String,
      required: true,
      index: true
    },
    toToken: {
      type: String,
      required: true
    },
    senderName: {
      type: String,
      required: true
    },
    message: {
      type: String,
      trim: true
    },
    media: {
      type: Object,
      default: null
    },
    seenAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

directChatSchema.index({ classCode: 1, conversation: 1, createdAt: -1 });

directChatSchema.set('toJSON', {
  transform: (_, doc) => ({
    id: doc._id.toString(),
    classCode: doc.classCode,
    conversation: doc.conversation,
    from: doc.fromToken,
    to: doc.toToken,
    senderName: doc.senderName,
    message: doc.message,
    media: doc.media,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    seen: Boolean(doc.seenAt),
    seenAt: doc.seenAt
  })
});

module.exports = mongoose.model('DirectChatMessage', directChatSchema);
