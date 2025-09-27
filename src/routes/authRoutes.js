const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateAgent } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateAgent, authController.me);

module.exports = router;
