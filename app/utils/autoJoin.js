const { v4: uuid } = require('uuid');
const { startParticipantSession } = require('./classState');

const ensureAutoJoinIds = (klass) => {
  if (!klass) return;
  const roster = Array.isArray(klass.autoJoinRoster) ? klass.autoJoinRoster : [];
  const existing = Array.isArray(klass.autoJoineeIds) ? klass.autoJoineeIds : [];
  const merged = new Set(existing);
  roster.forEach((entry) => {
    if (entry && entry.studentId) {
      merged.add(entry.studentId);
    }
  });
  klass.autoJoineeIds = Array.from(merged);
};

const upsertAutoJoinEntry = (klass, { studentId, displayName }) => {
  if (!klass || !studentId) return null;
  const normalized = String(studentId);
  const roster = Array.isArray(klass.autoJoinRoster) ? klass.autoJoinRoster : [];
  let entry = roster.find((item) => item.studentId === normalized);
  if (!entry) {
    entry = {
      studentId: normalized,
      displayName: displayName || `Student ${normalized}`,
      joinToken: uuid()
    };
    roster.push(entry);
  } else if (displayName && displayName.trim() && displayName !== entry.displayName) {
    entry.displayName = displayName;
  }
  klass.autoJoinRoster = roster;
  ensureAutoJoinIds(klass);
  return entry;
};

const syncAutoJoinees = (klass, { live = false } = {}) => {
  if (!klass) return [];
  const roster = Array.isArray(klass.autoJoinRoster) ? klass.autoJoinRoster : [];
  if (!Array.isArray(klass.participants)) {
    klass.participants = [];
  }
  const created = [];
  roster.forEach((entry) => {
    if (!entry || !entry.studentId) {
      return;
    }
    if (!entry.joinToken) {
      entry.joinToken = uuid();
    }
    let participant = klass.participants.find(
      (existing) => existing.autoJoinId === entry.studentId || existing.token === entry.joinToken
    );
    if (!participant) {
      participant = {
        displayName: entry.displayName || `Student ${entry.studentId}`,
        token: entry.joinToken,
        autoAdmit: true,
        autoJoinId: entry.studentId,
        mediaState: { audio: false, video: false },
        sessions: []
      };
      klass.participants.push(participant);
      created.push(participant);
    } else {
      participant.autoAdmit = true;
      participant.autoJoinId = entry.studentId;
      participant.mediaState = participant.mediaState || { audio: false, video: false };
    }
    if (live) {
      startParticipantSession(participant);
      entry.lastJoinedAt = new Date();
    }
    if (!entry.joinToken) {
      entry.joinToken = participant.token;
    }
  });
  ensureAutoJoinIds(klass);
  return created;
};

module.exports = {
  upsertAutoJoinEntry,
  syncAutoJoinees
};
