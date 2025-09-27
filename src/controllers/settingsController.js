const Settings = require('../models/Settings');

exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne({ accountId: req.params.accountId });
    if (!settings) {
      return res.status(404).json({ message: 'Settings not found' });
    }
    return res.json({ settings });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch settings', error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { accountId } = req.params;
    const settings = await Settings.findOneAndUpdate(
      { accountId },
      req.body,
      { new: true, upsert: true }
    );
    return res.json({ settings });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update settings', error: error.message });
  }
};
