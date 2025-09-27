const express = require('express');
const auth = require('../middleware/auth');
const integrationController = require('../controllers/integrationController');
const { requireDeveloperKey, requireHostKey } = require('../middleware/apiKeyAuth');

const router = express.Router();

router.post('/developer/keys', auth.authenticate, integrationController.createDeveloperKey);
router.post('/developer/projects/:code?/keys', requireDeveloperKey, integrationController.createHostKey);
router.post('/host/meetings', requireHostKey, integrationController.createMeeting);
router.post('/host/meetings/:code/invite', requireHostKey, integrationController.inviteParticipants);
router.post('/host/meetings/:code/chat', requireHostKey, integrationController.sendChatMessage);
router.post('/host/meetings/:code/recording', requireHostKey, integrationController.setRecordingState);
router.post('/host/meetings/:code/screen', requireHostKey, integrationController.toggleScreenShare);
router.post('/meetings/:code/join', integrationController.joinViaApi);
router.get('/meetings/:code/chat', integrationController.fetchChatHistory);

module.exports = router;
