const crypto = require('crypto');
const config = require('../../config/config');

/**
 * Returns ICE servers for WebRTC (STUN first, then TURN with short-lived credentials).
 * TURN credentials follow coturn lt-cred-mech / use-auth-secret format so coturn
 * can validate them. If TURN is not configured, returns STUN-only.
 */
exports.getIceServers = (req, res) => {
  const stunUrl = config.STUN_URL;
  const turnUrl = config.TURN_URL; // e.g. turn:turn.example.com:3478
  const turnSecret = config.TURN_SECRET;

  const iceServers = [{ urls: stunUrl }];

  if (turnUrl && turnSecret) {
    const ttl = 24 * 60 * 60; // 24 hours in seconds
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

  res.json({ iceServers });
};
