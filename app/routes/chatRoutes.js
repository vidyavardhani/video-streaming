const express = require('express');
const { body } = require('express-validator');
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.post(
  '/:code',
  auth.optional,
  [body('message').trim().isLength({ min: 1 })],
  chatController.sendMessage
);

router.get('/:code', chatController.history);
router.delete('/:code/:msgId', auth.authenticate, chatController.remove);

module.exports = router;
