const express = require('express');
const { body } = require('express-validator');
const classController = require('../controllers/classController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth.authenticate, [body('title').trim().notEmpty()], classController.create);
router.patch('/:id/start', auth.authenticate, classController.start);
router.patch('/:id/end', auth.authenticate, classController.end);
router.post('/:id/join', auth.optional, classController.join);
router.post('/:id/admit', auth.authenticate, classController.admit);
router.post('/:id/remove', auth.authenticate, classController.remove);
router.get('/mine', auth.authenticate, classController.mine);
router.get('/live/all', classController.live);
router.get('/live', classController.live);
router.get('/:id', classController.getOne);

module.exports = router;
