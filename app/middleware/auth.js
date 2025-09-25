const jwt = require('jsonwebtoken');
const User = require('../models/User');

const parseToken = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  if (req.cookies && req.cookies.vs_token) {
    return req.cookies.vs_token;
  }
  return null;
};

const authenticate = async (req, res, next) => {
  const token = parseToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key');
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

const optional = async (req, res, next) => {
  const token = parseToken(req);
  if (!token) {
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key');
    const user = await User.findById(payload.id);
    if (user) {
      req.user = user;
    }
  } catch (error) {
    console.error('Optional auth error', error.message);
  }
  next();
};

module.exports = {
  authenticate,
  optional
};
