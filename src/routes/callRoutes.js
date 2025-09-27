const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');
const { authenticateAgent } = require('../middleware/auth');

router.post('/initiate', authenticateAgent, callController.initiateCall);
router.post('/answer', callController.answerCall);
router.post('/end', authenticateAgent, callController.endCall);

module.exports = router;
