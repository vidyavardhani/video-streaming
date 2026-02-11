const crypto = require('crypto');
const config = require('../../config/config');
const logger = require('../../config/logger');

/**
 * Returns ICE servers for WebRTC (STUN first, then TURN with short-lived credentials).
 * TURN credentials follow coturn lt-cred-mech / use-auth-secret format so coturn
 * can validate them. If TURN is not configured, returns STUN-only.
 */
exports.getIceServers = (req, res) => {
  try {
    const stunUrl = config.STUN_URL;
    const turnUrl = config.TURN_URL;
    const turnSecret = config.TURN_SECRET;

    const iceServers = [{ urls: stunUrl }];

    if (turnUrl && turnSecret) {
      const ttl = 24 * 60 * 60;
      const timestamp = Math.floor(Date.now() / 1000);
      const username = `${timestamp}:${ttl}`;
      const credential = crypto
        .createHmac('sha1', turnSecret)
        .update(username)
        .digest('base64');

      iceServers.push({
        urls: turnUrl,
        username,
        credential
      });
    }

    logger.debug('[webrtc] getIceServers', { count: iceServers.length });
    res.json({ iceServers });
  } catch (error) {
    logger.error('[webrtc] getIceServers failed', error);
    res.status(500).json({ message: 'Failed to get ICE servers' });
  }
};
