const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

const TOKEN_COOKIE = 'vs_token';

const signToken = (user) => {
  const payload = { id: user._id, role: user.role };
  const secret = process.env.JWT_SECRET || 'super-secret-key';
  return jwt.sign(payload, secret, { expiresIn: '1992h' });
};

const sendAuthResponse = (res, user, status = 200) => {
  const token = signToken(user);
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000
  };
  res.cookie(TOKEN_COOKIE, token, cookieOptions);
  return res.status(status).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
};

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, role, institute, location } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const userData = { 
      name, 
      email, 
      password: hashed, 
      role
    };
    
    // Add optional fields if provided
    if (institute) userData.institute = institute.trim();
    if (location) userData.location = location.trim();
    
    const user = await User.create(userData);
    return sendAuthResponse(res, user, 201);
  } catch (error) {
    console.error('Register error', error);
    return res.status(500).json({ message: 'Unable to register user' });
  }
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    return sendAuthResponse(res, user);
  } catch (error) {
    console.error('Login error', error);
    return res.status(500).json({ message: 'Unable to login' });
  }
};

exports.me = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const user = await User.findById(req.user._id).select('+apiKey');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    institute: user.institute || null,
    location: user.location || null,
    apiKey: user.apiKey || null
  });
};

exports.logout = (req, res) => {
  res.clearCookie(TOKEN_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  res.json({ message: 'Logged out' });
};

exports.updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const { name, email, password, institute, location } = req.body;
  if (!name && !email && !password && !institute && !location) {
    return res.status(400).json({ message: 'Provide at least one field to update' });
  }

  try {
    const user = await User.findById(req.user._id).select('+apiKey');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (email && email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists && exists._id.toString() !== user._id.toString()) {
        return res.status(409).json({ message: 'Email already in use' });
      }
      user.email = email;
    }

    if (name) {
      user.name = name;
    }

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (institute !== undefined) {
      user.institute = institute ? institute.trim() : null;
    }

    if (location !== undefined) {
      user.location = location ? location.trim() : null;
    }

    await user.save();

    return res.json({
      message: 'Profile updated',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        institute: user.institute || null,
        location: user.location || null,
        apiKey: user.apiKey || null
      }
    });
  } catch (error) {
    console.error('Update profile error', error);
    return res.status(500).json({ message: 'Unable to update profile' });
  }
};
