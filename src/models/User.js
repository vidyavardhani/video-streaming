const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AvailabilitySchema = new mongoose.Schema(
  {
    online: { type: Boolean, default: false },
    lastOnlineAt: { type: Date },
    statusMessage: { type: String, default: 'Available' }
  },
  { _id: false }
);

const BusinessHoursSchema = new mongoose.Schema(
  {
    timezone: { type: String, default: 'UTC' },
    weekdays: {
      monday: { type: String, default: '09:00-17:00' },
      tuesday: { type: String, default: '09:00-17:00' },
      wednesday: { type: String, default: '09:00-17:00' },
      thursday: { type: String, default: '09:00-17:00' },
      friday: { type: String, default: '09:00-17:00' },
      saturday: { type: String, default: '00:00-00:00' },
      sunday: { type: String, default: '00:00-00:00' }
    }
  },
  { _id: false }
);

const WebhookSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    events: [{ type: String }]
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['agent', 'admin'], default: 'agent' },
    availability: { type: AvailabilitySchema, default: () => ({}) },
    businessHours: { type: BusinessHoursSchema, default: () => ({}) },
    webhooks: { type: [WebhookSchema], default: [] },
    permissions: {
      canInitiateCall: { type: Boolean, default: true },
      canManageTickets: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

UserSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

UserSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', UserSchema);
