const mongoose = require('mongoose');

const hostKeySchema = new mongoose.Schema(
  {
    developerKey: { type: mongoose.Schema.Types.ObjectId, ref: 'DeveloperKey', required: true },
    key: { type: String, required: true, unique: true },
    label: { type: String, default: 'Host' },
    active: { type: Boolean, default: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    projectSlug: { type: String },
    lastUsedAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = mongoose.model('HostKey', hostKeySchema);
