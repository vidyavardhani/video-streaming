const { v4: uuid } = require('uuid');

const normalizeToken = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const ensureHostToken = (klass) => {
  if (!klass) {
    return { token: null, generated: false };
  }
  if (!klass.hostAccessToken) {
    klass.hostAccessToken = uuid();
    return { token: klass.hostAccessToken, generated: true };
  }
  return { token: klass.hostAccessToken, generated: false };
};

const extractHostTokenFromRequest = (req = {}) => {
  const query = req.query || {};
  const body = req.body || {};
  const headers = req.headers || {};

  const roleFromQuery = normalizeToken(query.role || query.type);
  const roleFromBody = normalizeToken(body.role || body.type);

  const candidates = [
    query.hostToken,
    query.host_token,
    body.hostToken,
    body.host_token,
    headers['x-class-host-token'],
    headers['x-class-token'],
    roleFromQuery === 'host' ? query.token : null,
    roleFromBody === 'host' ? body.token : null
  ];

  for (const candidate of candidates) {
    const normalized = normalizeToken(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const resolveHostAccess = (klass, { user = null, request = null, token = null } = {}) => {
  const { token: hostToken, generated } = ensureHostToken(klass);
  const hostRef = klass?.host;
  const hostId = hostRef && typeof hostRef === 'object' && hostRef._id
    ? hostRef._id.toString()
    : (typeof hostRef === 'string' ? hostRef : null);
  const userId = user && user._id && user._id.toString ? user._id.toString() : null;

  if (hostId && userId && hostId === userId) {
    return {
      isHost: true,
      via: 'user',
      providedToken: null,
      hostToken,
      tokenGenerated: generated
    };
  }

  const providedToken = normalizeToken(token)
    || (request ? extractHostTokenFromRequest(request) : null);

  if (!providedToken) {
    return {
      isHost: false,
      via: null,
      providedToken: null,
      hostToken,
      tokenGenerated: generated
    };
  }

  const matches = Boolean(hostToken) && hostToken === providedToken;

  return {
    isHost: matches,
    via: matches ? 'token' : null,
    providedToken,
    hostToken,
    tokenGenerated: generated
  };
};

module.exports = {
  ensureHostToken,
  extractHostTokenFromRequest,
  resolveHostAccess
};
