const User = require('../models/User');
const { verify } = require('../utils/jwt');

exports.authenticateAgent = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Missing token' });
    }
    const payload = verify(token);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Agent not found' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token', details: error.message });
  }
};

exports.requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin privileges required' });
  }
  return next();
};
