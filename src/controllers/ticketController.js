const Ticket = require('../models/Ticket');
const Settings = require('../models/Settings');
const webhookService = require('../services/webhookService');

exports.createTicket = async (req, res) => {
  try {
    const ticket = await Ticket.create({
      ...req.body,
      assignedTo: req.body.assignedTo || req.user?._id
    });
    const settings = await Settings.findOne({ accountId: 'default' });
    if (settings) {
      webhookService.dispatch({
        integrations: settings.webhookIntegrations,
        event: 'ticket.created',
        payload: { ticketId: ticket._id, subject: ticket.subject }
      });
    }
    return res.status(201).json({ ticket });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create ticket', error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const ticket = await Ticket.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('assignedTo', 'name email');
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    return res.json({ ticket });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update ticket', error: error.message });
  }
};

exports.listTickets = async (req, res) => {
  try {
    const { status, priority, assignedTo } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    const tickets = await Ticket.find(filter)
      .populate('assignedTo', 'name email')
      .sort({ updatedAt: -1 });
    return res.json({ tickets });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to list tickets', error: error.message });
  }
};

exports.addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, visibility = 'internal' } = req.body;
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    ticket.notes.push({ body, visibility, addedBy: req.user._id });
    await ticket.save();
    await ticket.populate('assignedTo', 'name email');
    return res.json({ ticket });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to add note', error: error.message });
  }
};
