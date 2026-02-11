const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../../config/config');
const logger = require('../../config/logger');
const { AUTH } = require('../../config/constants');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers[AUTH.HEADER_AUTHORIZATION];
  if (!authHeader || !authHeader.startsWith(AUTH.BEARER_PREFIX)) {
    return res.status(401).json({ message: 'Authorization token missing', error: 'Authorization token missing' });
  }
  const token = authHeader.slice(AUTH.BEARER_PREFIX.length).trim();
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found', error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    logger.error('[auth] Invalid or expired token', error.message);
    return res.status(401).json({ message: 'Invalid token', error: error.message });
  }
};

const requireRole = (roles = []) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (allowed.length && !allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
};

module.exports = {
  authMiddleware,
  requireRole
};
