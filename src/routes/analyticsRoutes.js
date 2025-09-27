const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateAgent } = require('../middleware/auth');

router.get('/summary', authenticateAgent, analyticsController.summary);

module.exports = router;
