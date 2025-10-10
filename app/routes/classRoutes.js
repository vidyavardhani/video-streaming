const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const classController = require('../controllers/classController');
const engagementController = require('../controllers/engagementController');
const auth = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024 * 1024 // 5GB max file size
  }
});

const router = express.Router();

router.post('/', auth.authenticate, [body('title').trim().notEmpty()], classController.create);
router.patch('/:code/start', auth.optional, classController.start);
router.patch('/:code/end', auth.optional, classController.end);
router.post('/:code/join', auth.optional, classController.join);
router.post('/:code/admit', auth.optional, classController.admit);
router.post('/:code/remove', auth.optional, classController.remove);
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
router.post('/:code/whiteboard/clear', auth.optional, engagementController.clearWhiteboard);
router.post('/:code/recording/start', auth.optional, engagementController.startRecording);
router.post('/:code/recording/pause', auth.optional, engagementController.pauseRecording);
router.post('/:code/recording/resume', auth.optional, engagementController.resumeRecording);
router.post(
  '/:code/recording/stop',
  auth.optional,
  upload.single('recording'),
  engagementController.stopRecording
);
router.get('/mine', auth.authenticate, classController.mine);
router.get('/live/all', classController.live);
router.get('/live', classController.live);
router.get('/:code', classController.getOne);

module.exports = router;
