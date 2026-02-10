const path = require('path');
const dotenv = require('dotenv');

const NODE_ENV = process.env.NODE_ENV || 'development';

// Load base .env first
dotenv.config();

// Override with environment-specific file if it exists
const envPath = path.resolve(__dirname, '..', `.env.${NODE_ENV}`);
dotenv.config({ path: envPath, override: true });  // override: true replaces values from .env

module.exports = {
  PORT: process.env.PORT || 4000,
  BASE_URL: process.env.BASE_URL || 'http://localhost:4000',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/video-streaming',
  JWT_SECRET: process.env.JWT_SECRET || 'secret',
  STUN_URL: process.env.STUN_URL || 'stun:stun.l.google.com:19302',
  TURN_URL: process.env.TURN_URL || '',
  TURN_SECRET: process.env.TURN_SECRET || '',
  JMETER_NUM_CLASSES: process.env.JMETER_NUM_CLASSES || 100,
  JMETER_STUDENTS_PER_CLASS: process.env.JMETER_STUDENTS_PER_CLASS || 50,
  NODE_ENV,
  isDevelopment: NODE_ENV === 'development',
  isStaging: NODE_ENV === 'staging',
  isProduction: NODE_ENV === 'production',
};