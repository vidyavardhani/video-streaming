const express = require('express');
const healthController = require('../controllers/healthController');

const router = express.Router();

/**
 * GET /health
 * Basic health check (for load balancers, Kubernetes readiness/liveness).
 * Returns 200 when app and DB are up, 503 when DB is disconnected.
 */
router.get('/', healthController.getBasic);

/**
 * GET /health/detailed
 * Advanced health with DB ping latency, memory, process info, and safe config flags.
 */
router.get('/detailed', (req, res, next) => {
  healthController.getDetailed(req, res).catch(next);
});

module.exports = router;
