const mongoose = require('mongoose');

const WebhookIntegrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    secret: { type: String },
    events: [{ type: String }]
  },
  { _id: false }
);

const SettingsSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true, unique: true },
    businessHours: {
      timezone: { type: String, default: 'UTC' },
      weeklySchedule: {
        monday: { type: String, default: '09:00-17:00' },
        tuesday: { type: String, default: '09:00-17:00' },
        wednesday: { type: String, default: '09:00-17:00' },
        thursday: { type: String, default: '09:00-17:00' },
        friday: { type: String, default: '09:00-17:00' },
        saturday: { type: String, default: '00:00-00:00' },
        sunday: { type: String, default: '00:00-00:00' }
      }
    },
    webhookIntegrations: { type: [WebhookIntegrationSchema], default: [] },
    defaultAgentAvailability: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', SettingsSchema);
