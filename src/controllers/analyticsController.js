const ChatSession = require('../models/ChatSession');
const Ticket = require('../models/Ticket');
const Call = require('../models/Call');

exports.summary = async (req, res) => {
  try {
    const [totalChats, openTickets, pendingTickets, holdTickets, closedTickets, totalCalls] =
      await Promise.all([
        ChatSession.countDocuments(),
        Ticket.countDocuments({ status: 'Open' }),
        Ticket.countDocuments({ status: 'Pending' }),
        Ticket.countDocuments({ status: 'Hold' }),
        Ticket.countDocuments({ status: 'Closed' }),
        Call.countDocuments()
      ]);

    const activeCalls = await Call.countDocuments({ status: 'active' });
    const avgResponseTime = await ChatSession.aggregate([
      { $unwind: '$messages' },
      { $sort: { 'messages.createdAt': 1 } },
      {
        $group: {
          _id: '$sessionId',
          firstCustomerMessage: {
            $first: {
              $cond: [
                { $eq: ['$messages.senderType', 'customer'] },
                '$messages.createdAt',
                null
              ]
            }
          },
          firstAgentMessage: {
            $first: {
              $cond: [
                { $eq: ['$messages.senderType', 'agent'] },
                '$messages.createdAt',
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          delta: {
            $cond: [
              { $and: ['$firstCustomerMessage', '$firstAgentMessage'] },
              {
                $subtract: ['$firstAgentMessage', '$firstCustomerMessage']
              },
              null
            ]
          }
        }
      }
    ]);

    const deltas = avgResponseTime
      .map((doc) => doc.delta)
      .filter(Boolean)
      .map((ms) => ms / 1000 / 60);

    const avgMinutes =
      deltas.length > 0 ? Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2)) : 0;

    return res.json({
      metrics: {
        chats: totalChats,
        tickets: {
          open: openTickets,
          pending: pendingTickets,
          hold: holdTickets,
          closed: closedTickets
        },
        calls: {
          total: totalCalls,
          active: activeCalls
        },
        avgResponseMinutes: avgMinutes
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load analytics', error: error.message });
  }
};
