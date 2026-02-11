/**
 * Application constants — use these everywhere for consistency and long-term maintainability.
 * Import from: require('../config/constants') or require('../../config/constants') depending on path.
 */

// -----------------------------------------------------------------------------
// User roles
// -----------------------------------------------------------------------------
const ROLE = {
  TEACHER: 'teacher',
  STUDENT: 'student',
  ADMIN: 'admin'
};

const ROLES = [ROLE.TEACHER, ROLE.STUDENT, ROLE.ADMIN];

/** Roles allowed to create/manage classes (teachers and admins) */
const HOST_ROLES = [ROLE.TEACHER, ROLE.ADMIN];

/** Roles allowed to access dashboard (teachers and admins) */
const DASHBOARD_ROLES = [ROLE.TEACHER, ROLE.ADMIN];

// -----------------------------------------------------------------------------
// User status (presence)
// -----------------------------------------------------------------------------
const USER_STATUS = {
  OFFLINE: 'offline',
  ONLINE: 'online'
};

const USER_STATUS_LIST = [USER_STATUS.OFFLINE, USER_STATUS.ONLINE];

// -----------------------------------------------------------------------------
// Participant status (in class lobby/room)
// -----------------------------------------------------------------------------
const PARTICIPANT_STATUS = {
  PENDING: 'pending',
  ADMITTED: 'admitted',
  REMOVED: 'removed'
};

const PARTICIPANT_STATUS_LIST = [PARTICIPANT_STATUS.PENDING, PARTICIPANT_STATUS.ADMITTED, PARTICIPANT_STATUS.REMOVED];

// -----------------------------------------------------------------------------
// Class status
// -----------------------------------------------------------------------------
const CLASS_STATUS = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  ENDED: 'ended'
};

const CLASS_STATUS_LIST = [CLASS_STATUS.SCHEDULED, CLASS_STATUS.LIVE, CLASS_STATUS.ENDED];

// -----------------------------------------------------------------------------
// Auth (headers, scheme)
// -----------------------------------------------------------------------------
const AUTH = {
  BEARER_PREFIX: 'Bearer ',
  HEADER_AUTHORIZATION: 'authorization'
};

// -----------------------------------------------------------------------------
// Health check
// -----------------------------------------------------------------------------
const HEALTH_STATUS = {
  OK: 'ok',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy'
};

const DB_STATUS = {
  UP: 'up',
  DOWN: 'down',
  DEGRADED: 'degraded'
};

const CHECK_RESULT = {
  PASS: 'pass',
  FAIL: 'fail'
};

// -----------------------------------------------------------------------------
// MongoDB connection readyState (for health)
// -----------------------------------------------------------------------------
const MONGO_READY_STATE = {
  DISCONNECTED: 0,
  CONNECTED: 1,
  CONNECTING: 2,
  DISCONNECTING: 3
};

const MONGO_READY_STATE_LABELS = {
  [MONGO_READY_STATE.DISCONNECTED]: 'disconnected',
  [MONGO_READY_STATE.CONNECTED]: 'connected',
  [MONGO_READY_STATE.CONNECTING]: 'connecting',
  [MONGO_READY_STATE.DISCONNECTING]: 'disconnecting'
};

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------
module.exports = {
  ROLE,
  ROLES,
  HOST_ROLES,
  DASHBOARD_ROLES,
  USER_STATUS,
  USER_STATUS_LIST,
  PARTICIPANT_STATUS,
  PARTICIPANT_STATUS_LIST,
  CLASS_STATUS,
  CLASS_STATUS_LIST,
  AUTH,
  HEALTH_STATUS,
  DB_STATUS,
  CHECK_RESULT,
  MONGO_READY_STATE,
  MONGO_READY_STATE_LABELS
};
