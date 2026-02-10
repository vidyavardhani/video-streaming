const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./logger');

const connectDB = () => {
  return mongoose
    .connect(config.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    .then(() => {
      logger.info('Connected to MongoDB');
    })
    .catch((err) => {
      logger.error('MongoDB connection error:', err.message);
      throw err;
    });
};

module.exports = { connectDB };
