const express = require('express');
const { body } = require('express-validator');
const classController = require('../controllers/classController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth.authenticate, [body('title').trim().notEmpty()], classController.create);
router.patch('/:code/start', auth.authenticate, classController.start);
router.patch('/:code/end', auth.authenticate, classController.end);
router.post('/:code/join', auth.optional, classController.join);
router.post('/:code/admit', auth.authenticate, classController.admit);
router.post('/:code/remove', auth.authenticate, classController.remove);
router.get('/mine', auth.authenticate, classController.mine);
router.get('/live/all', classController.live);
router.get('/live', classController.live);
router.get('/:code', classController.getOne);

module.exports = router;
