const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['teacher', 'student', 'admin'],
    default: 'student'
  },
  status: {
    type: String,
    enum: ['offline', 'online'],
    default: 'offline'
  },
  currentClass: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  }
}, { timestamps: true });

userSchema.index({ email: 1 });
userSchema.index({ status: 1, currentClass: 1 });

module.exports = mongoose.model('User', userSchema);
