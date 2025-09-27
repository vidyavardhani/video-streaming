const DeveloperKey = require('../models/DeveloperKey');
const HostKey = require('../models/HostKey');

const normalize = (value) => (typeof value === 'string' ? value.trim() : '');

const attachDeveloperKey = async (req, _res, next) => {
  const rawKey = normalize(req.headers['x-developer-key'] || req.query.developerKey);
  if (!rawKey) {
    req.developerKey = null;
    return next();
  }
  try {
    const developerKey = await DeveloperKey.findOne({ key: rawKey });
    req.developerKey = developerKey || null;
  } catch (error) {
    req.developerKey = null;
  }
  return next();
};

const attachHostKey = async (req, _res, next) => {
  const rawKey = normalize(req.headers['x-host-key'] || req.query.hostKey);
  if (!rawKey) {
    req.hostKey = null;
    return next();
  }
  try {
    const hostKey = await HostKey.findOne({ key: rawKey, active: true }).populate('developerKey');
    req.hostKey = hostKey || null;
  } catch (error) {
    req.hostKey = null;
  }
  return next();
};

const requireDeveloperKey = async (req, res, next) => {
  await attachDeveloperKey(req, res, async () => {});
  if (!req.developerKey) {
    return res.status(401).json({ message: 'Valid developer key required' });
  }
  return next();
};

const requireHostKey = async (req, res, next) => {
  await attachHostKey(req, res, async () => {});
  if (!req.hostKey) {
    return res.status(401).json({ message: 'Valid host key required' });
  }
  return next();
};

module.exports = {
  attachDeveloperKey,
  attachHostKey,
  requireDeveloperKey,
  requireHostKey
};
