const User = require('../models/User');
const { signAgent } = require('../utils/jwt');

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const user = await User.create({ name, email, password, role });
    const token = signAgent(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to register agent', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = signAgent(user);
    return res.json({ token, user });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to login', error: error.message });
  }
};

exports.me = (req, res) => res.json({ user: req.user });
