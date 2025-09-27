const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticateAgent } = require('../middleware/auth');

router.post('/create', authenticateAgent, ticketController.createTicket);
router.put('/:id/status', authenticateAgent, ticketController.updateStatus);
router.get('/list', authenticateAgent, ticketController.listTickets);
router.post('/:id/notes', authenticateAgent, ticketController.addNote);

module.exports = router;
