const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateAgent, requireAdmin } = require('../middleware/auth');

router.get('/:accountId', authenticateAgent, settingsController.getSettings);
router.put('/:accountId', authenticateAgent, requireAdmin, settingsController.updateSettings);

module.exports = router;
