const express = require('express');
const chatController = require('../controllers/chatController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.post('/:classId', authMiddleware, chatController.sendMessage);
router.get('/:classId', authMiddleware, chatController.getMessages);
router.delete('/:classId/:msgId', authMiddleware, chatController.deleteMessage);

module.exports = router;
