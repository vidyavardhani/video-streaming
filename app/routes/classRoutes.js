const express = require('express');
const { body } = require('express-validator');
const classController = require('../controllers/classController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/',
  authMiddleware,
  [body('title').notEmpty()],
  classController.createClass
);

router.get('/live', authMiddleware, classController.getLiveClasses);
router.get('/live/all', authMiddleware, classController.getLiveClasses);
router.patch('/:id/start', authMiddleware, classController.startClass);
router.patch('/:id/end', authMiddleware, classController.endClass);
router.post('/:id/join', authMiddleware, classController.joinClass);
router.post('/:id/admit', authMiddleware, classController.admitStudent);
router.post(
  '/:id/admit-batch',
  authMiddleware,
  [
    body('studentIds').isArray(),
    body('studentIds').custom((val) => Array.isArray(val) && val.length > 0).withMessage('studentIds must not be empty')
  ],
  classController.admitStudentsBatch
);
router.post('/:id/remove', authMiddleware, classController.removeStudent);
router.patch('/:id/recording', authMiddleware, classController.updateRecordingUrl);
router.get('/:id', authMiddleware, classController.getClassDetails);

module.exports = router;
