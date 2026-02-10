const express = require('express');
const webrtcController = require('../controllers/webrtcController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/ice-servers', authMiddleware, webrtcController.getIceServers);

module.exports = router;
