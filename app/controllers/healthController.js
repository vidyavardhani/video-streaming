const mongoose = require('mongoose');
const config = require('../../config/config');
const logger = require('../../config/logger');
const {
  HEALTH_STATUS,
  DB_STATUS,
  CHECK_RESULT,
  MONGO_READY_STATE,
  MONGO_READY_STATE_LABELS
} = require('../../config/constants');

const START_TIME = Date.now();

/**
 * Get database health: connection state and optional ping latency.
 */
async function getDatabaseHealth() {
  const conn = mongoose.connection;
  const readyState = conn.readyState;
  const status = readyState === MONGO_READY_STATE.CONNECTED ? DB_STATUS.UP : DB_STATUS.DOWN;
  const out = {
    status,
    readyState: MONGO_READY_STATE_LABELS[readyState] || `unknown(${readyState})`,
    name: conn.name || null
  };

  if (readyState === MONGO_READY_STATE.CONNECTED && conn.db) {
    try {
      const start = Date.now();
      await conn.db.admin().command({ ping: 1 });
      out.latencyMs = Date.now() - start;
    } catch (err) {
      out.status = DB_STATUS.DEGRADED;
      out.pingError = err.message;
    }
  }

  return out;
}

/**
 * Get process resource usage (safe for health endpoint).
 */
function getProcessHealth() {
  const mem = process.memoryUsage();
  return {
    pid: process.pid,
    nodeVersion: process.version,
    memory: {
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
      rssMb: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      externalMb: Math.round((mem.external || 0) / 1024 / 1024 * 100) / 100
    },
    uptimeSeconds: Math.floor(process.uptime()),
    uptimeHuman: formatUptime(process.uptime())
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Basic health: status, uptime, timestamp. Use for load balancers / readiness probes.
 */
function getBasic(req, res) {
  try {
    const dbState = mongoose.connection.readyState;
    const healthy = dbState === MONGO_READY_STATE.CONNECTED;
    if (!healthy) {
      logger.warn('[health] Basic check: database not connected', { readyState: dbState });
    }
    res.status(healthy ? 200 : 503).json({
      status: healthy ? HEALTH_STATUS.OK : HEALTH_STATUS.UNHEALTHY,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      version: require('../../package.json').version,
      ...(healthy ? {} : { reason: 'database_not_connected' })
    });
  } catch (error) {
    logger.error('[health] getBasic failed', error);
    res.status(503).json({ status: HEALTH_STATUS.UNHEALTHY, message: 'Health check failed', error: error.message });
  }
}

/**
 * Advanced health: database ping, memory, process info, safe config. Use for debugging / dashboards.
 */
async function getDetailed(req, res) {
  try {
    const dbState = mongoose.connection.readyState;
    const dbHealthy = dbState === MONGO_READY_STATE.CONNECTED;

    const database = await getDatabaseHealth();
    const processInfo = getProcessHealth();

    const overallStatus = database.status === DB_STATUS.UP ? HEALTH_STATUS.OK : database.status === DB_STATUS.DEGRADED ? HEALTH_STATUS.DEGRADED : HEALTH_STATUS.UNHEALTHY;
    const httpStatus = overallStatus === HEALTH_STATUS.OK ? 200 : overallStatus === HEALTH_STATUS.DEGRADED ? 200 : 503;

    res.status(httpStatus).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: require('../../package.json').version,
      startedAt: new Date(START_TIME).toISOString(),
      uptime: {
        seconds: processInfo.uptimeSeconds,
        human: processInfo.uptimeHuman
      },
      database,
      process: {
        pid: processInfo.pid,
        nodeVersion: processInfo.nodeVersion,
        memory: processInfo.memory
      },
      config: {
        port: config.PORT,
        nodeEnv: config.NODE_ENV,
        baseUrlSet: Boolean(config.BASE_URL),
        mongoConfigured: Boolean(config.MONGO_URI),
        turnConfigured: Boolean(config.TURN_URL && config.TURN_SECRET)
      },
      checks: {
        database: dbHealthy ? CHECK_RESULT.PASS : CHECK_RESULT.FAIL,
        memory: CHECK_RESULT.PASS
      }
    });
  } catch (error) {
    logger.error('[health] getDetailed failed', error);
    if (!res.headersSent) {
      res.status(503).json({ status: HEALTH_STATUS.UNHEALTHY, message: 'Health check failed', error: error.message });
    }
  }
}

module.exports = {
  getBasic,
  getDetailed
};
