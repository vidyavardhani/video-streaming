const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema(
  {
    body: { type: String, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: { type: String, enum: ['internal', 'public'], default: 'internal' }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

const TicketSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Open', 'Pending', 'Hold', 'Closed'],
      default: 'Open'
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium'
    },
    customer: {
      name: { type: String },
      email: { type: String },
      externalId: { type: String }
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: [NoteSchema], default: [] },
    linkedChat: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatSession' },
    tags: [{ type: String }],
    csat: { type: Number, min: 1, max: 5 },
    slaDueAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ticket', TicketSchema);
