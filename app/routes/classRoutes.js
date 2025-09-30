const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const classController = require('../controllers/classController');
const engagementController = require('../controllers/engagementController');
const auth = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB max
});

const router = express.Router();

/**
 * CLASS ROUTES
 */
router.post(
  '/',
  auth.authenticate,
  [body('title').trim().notEmpty()],
  classController.create
);

// Host start (with auth middleware)
router.patch('/:code/start', auth.optional, classController.start);

// Host start (via hostToken in query string) for mobile/web links
router.get('/:code/start', auth.optional, classController.startMobile);

// End class
router.patch('/:code/end', auth.optional, classController.end);

// Join / Admit / Remove
router.post('/:code/join', auth.optional, classController.join);
router.post('/:code/admit', auth.optional, classController.admit);
router.post('/:code/remove', auth.optional, classController.remove);

/**
 * ENGAGEMENT ROUTES
 */
// Polls
router.post(
  '/:code/polls',
  auth.optional,
  [
    body('question').trim().notEmpty(),
    body('options').isArray({ min: 2 })
  ],
  engagementController.createPoll
);
router.post(
  '/:code/polls/vote',
  auth.optional,
  [body('optionId').notEmpty()],
  engagementController.votePoll
);
router.post('/:code/polls/close', auth.optional, engagementController.closePoll);

// Questions
router.post(
  '/:code/questions',
  auth.optional,
  [body('question').trim().notEmpty()],
  engagementController.askQuestion
);
router.patch(
  '/:code/questions/:questionId',
  auth.optional,
  [body('answer').trim().notEmpty()],
  engagementController.answerQuestion
);

// Whiteboard
router.post('/:code/whiteboard/clear', auth.optional, engagementController.clearWhiteboard);

// Recording
router.post('/:code/recording/start', auth.optional, engagementController.startRecording);
router.post('/:code/recording/pause', auth.optional, engagementController.pauseRecording);
router.post('/:code/recording/resume', auth.optional, engagementController.resumeRecording);
router.post(
  '/:code/recording/stop',
  auth.optional,
  upload.single('recording'),
  engagementController.stopRecording
);

/**
 * FETCH ROUTES
 */
// Get teacher’s own classes
router.get('/mine', auth.authenticate, classController.mine);

// Get live classes
router.get('/live/all', classController.live);
router.get('/live', classController.live);

// Get single class (auto-start if hostToken present)
router.get('/:code', classController.getOne);

module.exports = router;
