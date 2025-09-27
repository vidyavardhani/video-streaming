const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateAgent } = require('../middleware/auth');

router.post('/initiate', chatController.initiateChat);
router.post('/message', chatController.postMessage);
router.post('/assign/:sessionId', authenticateAgent, chatController.assignAgent);
router.get('/history', authenticateAgent, chatController.history);
router.post('/ticket', authenticateAgent, chatController.createTicketFromChat);

module.exports = router;
