const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { DASHBOARD_ROLES } = require('../../config/constants');

const router = express.Router();

router.get(
  '/users',
  authMiddleware,
  requireRole(DASHBOARD_ROLES),
  dashboardController.listUsers
);

router.get(
  '/users/live',
  authMiddleware,
  requireRole(DASHBOARD_ROLES),
  dashboardController.listLiveUsers
);

router.get(
  '/analytics/overview',
  authMiddleware,
  requireRole(DASHBOARD_ROLES),
  dashboardController.analyticsOverview
);

router.get(
  '/dashboard/chat/:classId',
  authMiddleware,
  requireRole(DASHBOARD_ROLES),
  dashboardController.classChatLogs
);

module.exports = router;
