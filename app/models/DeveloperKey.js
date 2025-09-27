const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    slug: { type: String },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const developerKeySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, default: 'Default' },
    key: { type: String, required: true, unique: true },
    projects: { type: [projectSchema], default: () => [] },
    hostCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

developerKeySchema.methods.touchHostCount = function touchHostCount(amount = 1) {
  this.hostCount = Math.max(0, (this.hostCount || 0) + amount);
  return this.hostCount;
};

module.exports = mongoose.model('DeveloperKey', developerKeySchema);
