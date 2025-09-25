const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const requireTeacher = (req, res, next) => {
  if (!req.user || req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Teachers only' });
  }
  next();
};

router.get('/users', authenticate, requireTeacher, dashboardController.listUsers);
router.get('/users/live', authenticate, requireTeacher, dashboardController.listLiveUsers);
router.get('/analytics/overview', authenticate, requireTeacher, dashboardController.analyticsOverview);
router.get('/chat/:code', authenticate, requireTeacher, dashboardController.classChatLogs);

module.exports = router;
