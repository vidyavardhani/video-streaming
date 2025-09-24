const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/users',
  authMiddleware,
  requireRole(['teacher', 'admin']),
  dashboardController.listUsers
);

router.get(
  '/users/live',
  authMiddleware,
  requireRole(['teacher', 'admin']),
  dashboardController.listLiveUsers
);

router.get(
  '/analytics/overview',
  authMiddleware,
  requireRole(['teacher', 'admin']),
  dashboardController.analyticsOverview
);

router.get(
  '/dashboard/chat/:classId',
  authMiddleware,
  requireRole(['teacher', 'admin']),
  dashboardController.classChatLogs
);

module.exports = router;
