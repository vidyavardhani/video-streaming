const express = require('express');
const { body } = require('express-validator');
const classController = require('../controllers/classController');
const engagementController = require('../controllers/engagementController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth.authenticate, [body('title').trim().notEmpty()], classController.create);
router.patch('/:code/start', auth.authenticate, classController.start);
router.patch('/:code/end', auth.authenticate, classController.end);
router.post('/:code/join', auth.optional, classController.join);
router.post('/:code/admit', auth.authenticate, classController.admit);
router.post('/:code/remove', auth.authenticate, classController.remove);
router.post(
  '/:code/polls',
  auth.authenticate,
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
router.post('/:code/polls/close', auth.authenticate, engagementController.closePoll);
router.post(
  '/:code/questions',
  auth.optional,
  [body('question').trim().notEmpty()],
  engagementController.askQuestion
);
router.patch(
  '/:code/questions/:questionId',
  auth.authenticate,
  [body('answer').trim().notEmpty()],
  engagementController.answerQuestion
);
router.post('/:code/whiteboard/clear', auth.authenticate, engagementController.clearWhiteboard);
router.post('/:code/recording/start', auth.authenticate, engagementController.startRecording);
router.post('/:code/recording/pause', auth.authenticate, engagementController.pauseRecording);
router.post('/:code/recording/resume', auth.authenticate, engagementController.resumeRecording);
router.post('/:code/recording/stop', auth.authenticate, engagementController.stopRecording);
router.get('/mine', auth.authenticate, classController.mine);
router.get('/live/all', classController.live);
router.get('/live', classController.live);
router.get('/:code', classController.getOne);

module.exports = router;
