(() => {
  const root = document.getElementById('class-app');
  if (!root) return;

  const classCode = root.dataset.classCode;
  const tokenKey = 'vs_token';
  const joinKey = `vs_join_${classCode}`;
  const displayNameKey = `vs_name_${classCode}`;

  const safeStorage = (type) => {
    try {
      return window[type];
    } catch (error) {
      return null;
    }
  };

  const storage = {
    session: safeStorage('sessionStorage'),
    local: safeStorage('localStorage')
  };

  const storageGet = (store, key) => {
    if (!store || !key) return null;
    try {
      return store.getItem(key);
    } catch (error) {
      return null;
    }
  };

  const storageSet = (store, key, value) => {
    if (!store || !key) return;
    try {
      store.setItem(key, value);
    } catch (error) {
      /* ignore storage errors */
    }
  };

  const storageRemove = (store, key) => {
    if (!store || !key) return;
    try {
      store.removeItem(key);
    } catch (error) {
      /* ignore storage errors */
    }
  };

  const getStoredJoinToken = () =>
    storageGet(storage.session, joinKey) || storageGet(storage.local, joinKey) || null;

  const persistJoinToken = (token) => {
    if (!token) return;
    storageSet(storage.session, joinKey, token);
    storageSet(storage.local, joinKey, token);
  };

  const clearJoinToken = () => {
    storageRemove(storage.session, joinKey);
    storageRemove(storage.local, joinKey);
  };

  const rejoinFlagKey = `vs_rejoin_${classCode}`;

  const markRejoinNeeded = () => {
    storageSet(storage.local, rejoinFlagKey, '1');
  };

  const clearRejoinNeeded = () => {
    storageRemove(storage.local, rejoinFlagKey);
  };

  const shouldPromptRejoin = () => storageGet(storage.local, rejoinFlagKey) === '1';

  const getStoredDisplayName = () => storageGet(storage.local, displayNameKey) || '';

  const persistDisplayName = (name) => {
    if (!name) return;
    storageSet(storage.local, displayNameKey, name);
  };

  const state = {
    socket: null,
    classInfo: null,
    user: null,
    joinToken: getStoredJoinToken(),
    savedDisplayName: getStoredDisplayName(),
    isHost: false,
    admitted: false,
    localStream: null,
    screenStream: null,
    screenSenders: [],
    screenShareContext: null,
    peers: new Map(),
    videos: new Map(),
    lobby: [],
    hostMedia: { camera: null, screen: null },
    activeDrawer: null,
    utilityTab: 'whiteboard',
    whiteboard: {
      drawing: false,
      strokes: [],
      color: '#1e3a8a',
      size: 4,
      lastPoint: null,
      visible: false
    },
    activePoll: null,
    pollHistory: [],
    questions: [],
    recording: { isRecording: false },
    raisedHands: new Map(),
    mediaStates: new Map(),
    handRaised: false,
    previewReady: false,
    stageZoom: 1,
    activeSpeaker: null,
    speakerTimeout: null,
    canUseMedia: { audio: false, video: false },
    reconnectTimer: null,
    rejoinScreenActive: false,
    rejoining: false,
    skipRejoinFlag: false,
    moreMenuOpen: false,
    toastTimer: null,
    modalResolver: null,
    toastActionButton: null,
    toastActionHandler: null,
    moreMenuFocusCleanup: null,
    modalFocusCleanup: null
  };

  const hostTrackRegistry = new WeakSet();
  const remoteTrackGuards = new WeakMap();
  const remotePresence = new Map();
  const remoteLossTimers = new Map();
  const remoteLossCounts = new Map();
  const peerRecovery = new Map();

  const remoteLossKey = (token, label) => `${token}:${label}`;

  const ensureRemotePresence = (token) => {
    if (!remotePresence.has(token)) {
      remotePresence.set(token, {});
    }
    return remotePresence.get(token);
  };

  const markRemoteTrackSeen = (token, label) => {
    if (!token || !label) return;
    const presence = ensureRemotePresence(token);
    presence[label] = true;
    clearRemoteLoss(token, label, { resetCount: true });
  };

  const clearRemoteLoss = (token, label, { resetCount = false } = {}) => {
    if (!token || !label) return;
    const key = remoteLossKey(token, label);
    const timer = remoteLossTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      remoteLossTimers.delete(key);
    }
    if (resetCount) {
      remoteLossCounts.delete(key);
    }
  };

  const triggerSilentRejoin = (copy = {}) => {
    if (state.isHost || state.rejoinScreenActive || state.rejoining) {
      return;
    }
    markRejoinNeeded();
    showRejoinScreen({
      message: 'Connection lost. Rejoining…',
      ...copy
    });
    scheduleReconnect();
  };

  const attemptPeerRecovery = (token, { iceRestart = false } = {}) => {
    if (!token) return;
    const pc = state.peers.get(token);
    if (!pc) return;
    try {
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
      }
    } catch (error) {
      console.warn('ICE restart error', error);
    }
    renegotiate(pc, token, { iceRestart });
  };

  const schedulePeerRecovery = (token, cause = 'disconnected') => {
    if (!token) return;
    const pc = state.peers.get(token);
    if (!pc) return;
    const entry = peerRecovery.get(token) || { attempts: 0, timer: null };
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    entry.attempts = Math.min(entry.attempts + 1, 6);
    const delay = Math.min(8000, 700 * 2 ** (entry.attempts - 1));
    entry.timer = window.setTimeout(() => {
      entry.timer = null;
      attemptPeerRecovery(token, { iceRestart: true });
      const currentState = pc.connectionState;
      const iceState = pc.iceConnectionState;
      if (
        (currentState === 'failed' || currentState === 'disconnected' || iceState === 'failed' || iceState === 'disconnected') &&
        entry.attempts < 6
      ) {
        schedulePeerRecovery(token, cause);
      } else if (entry.attempts >= 4) {
        triggerSilentRejoin({ message: 'Connection unstable. Rejoining…' });
      }
    }, delay);
    peerRecovery.set(token, entry);
    connectionWatchdog?.showReconnecting(
      cause === 'failed' ? 'Connection failed. Retrying…' : 'Connection unstable. Retrying…'
    );
  };

  const clearPeerRecovery = (token) => {
    const entry = peerRecovery.get(token);
    if (!entry) return;
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    peerRecovery.delete(token);
  };

  const isScreenTrackLabel = (track) => {
    const label = track?.label?.toLowerCase() || '';
    return label.includes('screen') || label.includes('display') || label.includes('window');
  };

  const scheduleRemoteLoss = (token, label, reason = 'ended') => {
    if (state.isHost || !token || !label) return;
    const presence = ensureRemotePresence(token);
    if (!presence[label]) {
      return;
    }
    const key = remoteLossKey(token, label);
    clearRemoteLoss(token, label);
    remoteLossTimers.set(
      key,
      window.setTimeout(() => {
        remoteLossTimers.delete(key);
        handleRemoteTrackLoss(token, label, reason);
      }, 3000)
    );
  };

  const handleRemoteTrackLoss = (token, label, reason = 'ended') => {
    if (state.isHost) return;
    const pc = state.peers.get(token);
    const connectionState = pc?.connectionState || pc?.iceConnectionState;
    if (connectionState === 'connected' || connectionState === 'completed') {
      clearRemoteLoss(token, label, { resetCount: true });
      return;
    }
    const key = remoteLossKey(token, label);
    const attempts = (remoteLossCounts.get(key) || 0) + 1;
    remoteLossCounts.set(key, attempts);
    attemptPeerRecovery(token, { iceRestart: true });
    schedulePeerRecovery(token, reason);
    if (label.startsWith('screen')) {
      showLiveToast('Screen share interrupted. Attempting to recover…', { duration: 2400 });
      if (attempts >= 2) {
        triggerSilentRejoin({ message: 'Screen share failed repeatedly. Rejoin required.' });
      }
    } else {
      triggerSilentRejoin({ message: 'Lost connection to host media. Rejoining…' });
    }
  };

  const bindRemoteTrackGuard = ({ token, label, track }) => {
    if (state.isHost || !track || !token || !label) return;
    if (remoteTrackGuards.has(track)) {
      return;
    }
    markRemoteTrackSeen(token, label);
    const handleMute = () => scheduleRemoteLoss(token, label, 'mute');
    const handleUnmute = () => clearRemoteLoss(token, label);
    const cleanup = () => {
      track.removeEventListener('mute', handleMute);
      track.removeEventListener('unmute', handleUnmute);
      track.removeEventListener('ended', handleEnded);
      track.removeEventListener('inactive', handleInactive);
      clearRemoteLoss(token, label);
      remoteTrackGuards.delete(track);
    };
    const handleEnded = () => {
      cleanup();
      scheduleRemoteLoss(token, label, 'ended');
    };
    const handleInactive = () => {
      cleanup();
      scheduleRemoteLoss(token, label, 'inactive');
    };
    track.addEventListener('mute', handleMute);
    track.addEventListener('unmute', handleUnmute);
    track.addEventListener('ended', handleEnded);
    track.addEventListener('inactive', handleInactive);
    remoteTrackGuards.set(track, cleanup);
  };

  const verifyRemoteTracks = (token) => {
    if (state.isHost || !token) return;
    const presence = remotePresence.get(token);
    if (!presence) return;
    const pc = state.peers.get(token);
    if (!pc || typeof pc.getReceivers !== 'function') {
      return;
    }
    const receivers = pc.getReceivers();
    const videoReceivers = receivers.filter((receiver) => receiver.track && receiver.track.kind === 'video');
    const audioReceivers = receivers.filter((receiver) => receiver.track && receiver.track.kind === 'audio');
    const hasCameraVideo = videoReceivers.some((receiver) => receiver.track.readyState === 'live' && !isScreenTrackLabel(receiver.track));
    const hasScreenVideo = videoReceivers.some((receiver) => receiver.track.readyState === 'live' && isScreenTrackLabel(receiver.track));
    const hasCameraAudio = audioReceivers.some((receiver) => receiver.track.readyState === 'live' && !isScreenTrackLabel(receiver.track));
    const hasScreenAudio = audioReceivers.some((receiver) => receiver.track.readyState === 'live' && isScreenTrackLabel(receiver.track));

    if (presence['camera-video'] && !hasCameraVideo) {
      scheduleRemoteLoss(token, 'camera-video', 'missing');
    }
    if (presence['screen-video'] && !hasScreenVideo) {
      scheduleRemoteLoss(token, 'screen-video', 'missing');
    }
    if (presence['camera-audio'] && !hasCameraAudio) {
      scheduleRemoteLoss(token, 'camera-audio', 'missing');
    }
    if (presence['screen-audio'] && !hasScreenAudio) {
      scheduleRemoteLoss(token, 'screen-audio', 'missing');
    }
  };

  const elements = {
    joinView: document.getElementById('join-view'),
    lobbyView: document.getElementById('lobby-view'),
    hostLobbyView: document.getElementById('host-lobby'),
    liveView: document.getElementById('live-view'),
    endedView: document.getElementById('ended-view'),
    previewVideo: document.getElementById('preview-video'),
    previewWrapper: document.querySelector('.preview-video-wrapper'),
    previewControls: document.querySelector('.preview-controls'),
    primaryContainer: document.getElementById('stage-main'),
    primaryVideo: document.getElementById('primary-video'),
    primaryLabel: document.getElementById('primary-label'),
    pipContainer: document.getElementById('pip-container'),
    pipVideo: document.getElementById('pip-video'),
    pipLabel: document.getElementById('pip-label'),
    participantStrip: document.getElementById('participant-strip'),
    nameInput: document.getElementById('display-name'),
    joinButton: document.getElementById('join-btn'),
    startButton: document.getElementById('start-btn'),
    endButton: document.getElementById('end-btn'),
    admitList: document.getElementById('lobby-list'),
    meetingTitle: document.getElementById('meeting-title'),
    meetingCode: document.getElementById('meeting-code'),
    liveMeetingTitle: document.getElementById('live-meeting-title'),
    liveMeetingCode: document.getElementById('live-meeting-code'),
    copyLink: document.getElementById('copy-link'),
    copyCode: document.getElementById('copy-code'),
    shareInfo: document.getElementById('share-info'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-text'),
    chatMessages: document.getElementById('chat-messages'),
    chatBadge: document.getElementById('chat-count-badge'),
    muteBtn: document.getElementById('toggle-mic'),
    cameraBtn: document.getElementById('toggle-camera'),
    liveMicToggle: document.getElementById('live-mic-toggle'),
    liveCameraToggle: document.getElementById('live-camera-toggle'),
    screenShareBtn: document.getElementById('screen-share'),
    leaveBtn: document.getElementById('leave-btn'),
    waitingMessage: document.getElementById('waiting-message'),
    participantsList: document.getElementById('participants-list'),
    hostControls: document.getElementById('host-controls'),
    liveLobbyCard: document.getElementById('live-lobby-card'),
    liveLobbyList: document.getElementById('live-lobby-list'),
    liveLobbyCount: document.getElementById('live-lobby-count'),
    chatToggle: document.getElementById('toggle-chat'),
    participantsToggle: document.getElementById('toggle-participants'),
    participantsBadge: document.getElementById('participants-count-badge'),
    lobbyBadge: document.getElementById('participants-lobby-badge'),
    chatClose: document.getElementById('chat-close'),
    participantsClose: document.getElementById('participants-close'),
    chatDrawer: document.getElementById('chat-drawer'),
    participantsDrawer: document.getElementById('participants-drawer'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    whiteboardCanvas: document.getElementById('whiteboard-canvas'),
    whiteboardClear: document.getElementById('whiteboard-clear'),
    whiteboardColor: document.getElementById('whiteboard-color'),
    whiteboardSize: document.getElementById('whiteboard-size'),
    utilityPanel: document.getElementById('utility-panel'),
    utilityClose: document.getElementById('utility-close'),
    utilityTabs: document.querySelectorAll('.utility-tab'),
    utilityPanes: document.querySelectorAll('.utility-pane'),
    pollCreateForm: document.getElementById('poll-create-form'),
    pollQuestion: document.getElementById('poll-question'),
    pollOptions: document.getElementById('poll-options'),
    pollActive: document.getElementById('poll-active'),
    pollActiveQuestion: document.getElementById('poll-active-question'),
    pollOptionsList: document.getElementById('poll-options-list'),
    pollClose: document.getElementById('poll-close'),
    pollHistory: document.getElementById('poll-history'),
    pollHistoryList: document.getElementById('poll-history-list'),
    qnaForm: document.getElementById('qna-form'),
    qnaInput: document.getElementById('qna-input'),
    qnaList: document.getElementById('qna-list'),
    recordingStatus: document.getElementById('recording-status'),
    recordingStart: document.getElementById('recording-start'),
    recordingStop: document.getElementById('recording-stop'),
    recordingLink: document.getElementById('recording-link'),
    handRaiseBtn: document.getElementById('hand-raise-btn'),
    raisedHands: document.getElementById('raised-hands'),
    raisedHandsList: document.getElementById('raised-hands-list'),
    viewerMicToggle: document.getElementById('viewer-mic-toggle'),
    viewerCameraToggle: document.getElementById('viewer-camera-toggle'),
    controlPolls: document.getElementById('control-polls'),
    controlRecording: document.getElementById('control-recording'),
    controlWhiteboard: document.getElementById('control-whiteboard'),
    stageZoomIn: document.getElementById('stage-zoom-in'),
    stageZoomOut: document.getElementById('stage-zoom-out'),
    speakerBanner: document.getElementById('speaker-banner'),
    rejoinBtn: document.getElementById('rejoin-btn'),
    rejoinView: document.getElementById('rejoin-view'),
    rejoinHeading: document.getElementById('rejoin-heading'),
    rejoinMessage: document.getElementById('rejoin-message'),
    rejoinScreenBtn: document.getElementById('rejoin-screen-btn'),
    controlMore: document.getElementById('control-more'),
    controlMoreMenu: document.getElementById('control-more-menu'),
    toneToggle: document.getElementById('tone-toggle'),
    toneSettings: document.getElementById('tone-settings'),
    liveToast: document.getElementById('live-toast'),
    modalLayer: document.getElementById('modal-layer'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalPrimary: document.getElementById('modal-primary'),
    modalSecondary: document.getElementById('modal-secondary')
  };

  const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  class ToneManager {
    constructor({ toggleEl, storage, storageKey = 'vs_tones_enabled' } = {}) {
      this.toggleEl = toggleEl;
      this.storage = storage;
      this.storageKey = storageKey;
      this.enabled = this.readPreference();
      this.audioContext = null;
      this.unlockRequested = false;
      this.pending = [];
      this.sequences = {
        join: [
          { frequency: 660, duration: 120 },
          { frequency: 880, duration: 180 }
        ],
        leave: [
          { frequency: 320, duration: 160 },
          { frequency: 240, duration: 200 }
        ],
        hand: [
          { frequency: 780, duration: 140 },
          { frequency: 920, duration: 160 }
        ],
        chat: [
          { frequency: 520, duration: 120 },
          { frequency: 640, duration: 120 }
        ],
        screenStart: [
          { frequency: 720, duration: 160 },
          { frequency: 940, duration: 160 }
        ],
        screenStop: [
          { frequency: 520, duration: 180 },
          { frequency: 360, duration: 180 }
        ],
        ack: [{ frequency: 520, duration: 120 }]
      };
      this.bindToggle();
      this.installUnlock();
      this.syncToggle();
    }

    readPreference() {
      const stored = storageGet(this.storage?.local, this.storageKey);
      if (stored === '0') return false;
      if (stored === '1') return true;
      return true;
    }

    persistPreference() {
      if (!this.storage?.local) return;
      storageSet(this.storage.local, this.storageKey, this.enabled ? '1' : '0');
    }

    bindToggle() {
      if (!this.toggleEl) return;
      this.toggleEl.checked = this.enabled;
      this.toggleEl.addEventListener('change', () => {
        this.setEnabled(this.toggleEl.checked);
      });
    }

    installUnlock() {
      const unlock = () => {
        this.unlockRequested = true;
        this.ensureAudioContext();
        this.drainPending();
      };
      document.addEventListener('pointerdown', unlock, { once: true });
      document.addEventListener('keydown', unlock, { once: true });
    }

    ensureAudioContext() {
      if (!this.enabled) return null;
      if (this.audioContext) return this.audioContext;
      if (!this.unlockRequested) return null;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.audioContext = new AudioCtx();
      } catch (error) {
        this.audioContext = null;
      }
      return this.audioContext;
    }

    drainPending() {
      if (!this.pending.length) return;
      const ctx = this.ensureAudioContext();
      if (!ctx) return;
      const queue = this.pending.splice(0);
      queue.forEach((preset, index) => {
        const sequence = this.sequences[preset];
        if (sequence) {
          this.playSequence(ctx, sequence, index * 0.12);
        }
      });
    }

    playSequence(ctx, sequence, offset = 0) {
      if (!ctx || !sequence?.length) return;
      let cursor = ctx.currentTime + 0.02 + offset;
      sequence.forEach(({ frequency, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, cursor);
        gain.gain.setValueAtTime(0, cursor);
        gain.gain.linearRampToValueAtTime(0.2, cursor + 0.02);
        const end = cursor + duration / 1000;
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(ctx.destination);
        osc.start(cursor);
        osc.stop(end + 0.05);
        cursor = end + 0.04;
      });
    }

    setEnabled(value) {
      const next = !!value;
      if (this.enabled === next) {
        this.syncToggle();
        return;
      }
      this.enabled = next;
      this.persistPreference();
      this.syncToggle();
      if (this.enabled) {
        this.unlockRequested = true;
        this.drainPending();
        this.play('ack');
      } else {
        this.pending.length = 0;
      }
    }

    syncToggle() {
      if (!this.toggleEl) return;
      this.toggleEl.checked = !!this.enabled;
      this.toggleEl.setAttribute('aria-pressed', this.enabled.toString());
    }

    play(preset) {
      const sequence = this.sequences[preset];
      if (!sequence || !this.enabled) return;
      const ctx = this.ensureAudioContext();
      if (!ctx) {
        if (this.pending.length > 6) {
          this.pending.shift();
        }
        this.pending.push(preset);
        return;
      }
      this.playSequence(ctx, sequence);
    }
  }

  class ParticipantManager {
    constructor({ participantsBadgeEl, lobbyBadgeEl, buttonEl } = {}) {
      this.participantsBadgeEl = participantsBadgeEl;
      this.lobbyBadgeEl = lobbyBadgeEl;
      this.buttonEl = buttonEl;
      this.isHost = false;
      this.participants = 0;
      this.lobby = 0;
    }

    setIsHost(flag) {
      this.isHost = !!flag;
      this.sync();
    }

    updateParticipants(list) {
      const count = Array.isArray(list) ? list.length : 0;
      this.participants = Math.max(0, count);
      this.sync();
    }

    updateLobby(list) {
      const count = Array.isArray(list) ? list.length : 0;
      this.lobby = Math.max(0, count);
      this.sync();
    }

    updateBadge(element, value, shouldShow) {
      if (!element) return;
      if (shouldShow) {
        element.textContent = String(value);
        element.classList.remove('hidden');
      } else {
        element.classList.add('hidden');
      }
    }

    sync() {
      const showHostBadges = this.isHost;
      if (!showHostBadges) {
        this.updateBadge(this.participantsBadgeEl, 0, false);
        this.updateBadge(this.lobbyBadgeEl, 0, false);
        if (this.buttonEl) {
          this.buttonEl.setAttribute('aria-label', 'Participants');
        }
        return;
      }
      const totalParticipants = Math.max(0, this.participants + 1);
      this.updateBadge(this.participantsBadgeEl, totalParticipants, totalParticipants > 0);
      this.updateBadge(this.lobbyBadgeEl, this.lobby, this.lobby > 0);
      if (this.buttonEl) {
        const parts = [`${totalParticipants} in call`];
        parts.push(this.lobby === 1 ? '1 waiting' : `${this.lobby} waiting`);
        this.buttonEl.setAttribute('aria-label', `Participants (${parts.join(', ')})`);
      }
    }
  }

  class ChatManager {
    constructor({ badgeEl } = {}) {
      this.badgeEl = badgeEl;
      this.unread = 0;
      this.drawerOpen = false;
      this.toneManager = null;
    }

    attachToneManager(manager) {
      this.toneManager = manager;
    }

    setDrawerState(open) {
      this.drawerOpen = !!open;
      if (this.drawerOpen) {
        this.reset();
      }
    }

    handleNewMessage({ fromSelf = false } = {}) {
      if (fromSelf) {
        this.reset();
        return;
      }
      if (this.drawerOpen) {
        this.reset();
        return;
      }
      this.unread += 1;
      this.sync();
      this.toneManager?.play('chat');
    }

    reset() {
      if (this.unread === 0) {
        this.sync();
        return;
      }
      this.unread = 0;
      this.sync();
    }

    sync() {
      if (!this.badgeEl) return;
      if (this.unread > 0) {
        this.badgeEl.textContent = String(this.unread);
        this.badgeEl.classList.remove('hidden');
      } else {
        this.badgeEl.classList.add('hidden');
      }
    }
  }

  class PermissionManager {
    constructor({ state: stateRef, elements: elementRef, onStreamReady } = {}) {
      this.state = stateRef;
      this.elements = elementRef;
      this.onStreamReady = onStreamReady;
      this.isHost = false;
      this.previewInitialized = false;
      this.granted = { audio: false, video: false };
    }

    configureRole(isHost) {
      this.isHost = !!isHost;
    }

    async ensurePreview() {
      if (this.isHost) {
        return this.ensureInteractivePermissions({ audio: true, video: true });
      }
      if (!this.previewInitialized && this.elements?.previewVideo) {
        this.elements.previewVideo.srcObject = null;
      }
      this.previewInitialized = true;
      return this.state?.localStream || null;
    }

    async ensureInteractivePermissions({ audio = false, video = false } = {}) {
      if (this.isHost) {
        return this.acquireStream({ audio: true, video: true, replace: true });
      }
      const needsAudio = audio && !this.granted.audio;
      const needsVideo = video && !this.granted.video;
      if (!needsAudio && !needsVideo && this.state?.localStream) {
        return this.state.localStream;
      }
      return this.acquireStream({
        audio: this.granted.audio || audio,
        video: this.granted.video || video,
        replace: true
      });
    }

    async acquireStream({ audio = false, video = false, replace = false } = {}) {
      if (!audio && !video) {
        return this.state?.localStream || null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
        if (audio) this.granted.audio = true;
        if (video) this.granted.video = true;
        this.previewInitialized = true;
        if (typeof this.onStreamReady === 'function') {
          this.onStreamReady(stream, { replace });
        }
        return stream;
      } catch (error) {
        console.warn('Permission error', error);
        return null;
      }
    }
  }

  class MediaControl {
    constructor({ kind, state: stateRef, permissionManager: manager, setState, isEnabled, canUse, afterToggle } = {}) {
      this.kind = kind;
      this.state = stateRef;
      this.permissionManager = manager;
      this.setState = typeof setState === 'function' ? setState : () => {};
      this.isEnabled = typeof isEnabled === 'function' ? isEnabled : () => false;
      this.canUse = typeof canUse === 'function' ? canUse : () => true;
      this.afterToggle = typeof afterToggle === 'function' ? afterToggle : null;
      this.handlers = new Map();
    }

    bind(button, options = {}) {
      if (!button || this.handlers.has(button)) return;
      const handler = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.toggle(options);
      };
      button.addEventListener('click', handler);
      this.handlers.set(button, handler);
    }

    async toggle(options = {}) {
      if (!this.canInteract(options)) return;
      const enabled = !!this.isEnabled();
      if (!enabled) {
        await this.permissionManager?.ensureInteractivePermissions({
          audio: this.kind === 'audio',
          video: this.kind === 'video'
        });
        if (!this.state?.localStream) {
          return;
        }
      }
      this.setState(!enabled);
      if (this.afterToggle) {
        this.afterToggle(this.kind, !enabled);
      }
    }

    canInteract(options = {}) {
      if (this.state?.isHost) return true;
      return !!this.canUse(this.kind, options);
    }
  }

  class ScreenShareControl {
    constructor({ buttonEl, onStart, onStop, toneManager: manager } = {}) {
      this.buttonEl = buttonEl;
      this.onStart = onStart;
      this.onStop = onStop;
      this.toneManager = manager;
      this.active = false;
      if (this.buttonEl) {
        this.buttonEl.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggle();
        });
      }
    }

    async toggle() {
      if (this.active) {
        this.stop();
      } else {
        await this.start();
      }
    }

    async start() {
      if (this.active) return;
      if (typeof this.onStart !== 'function') return;
      const result = await this.onStart();
      if (result) {
        this.active = true;
        this.toneManager?.play('screenStart');
      }
    }

    stop() {
      if (!this.active && typeof this.onStop !== 'function') return;
      if (typeof this.onStop === 'function') {
        this.onStop();
      }
      if (this.active) {
        this.toneManager?.play('screenStop');
      }
      this.active = false;
    }

    setActive(flag) {
      this.active = !!flag;
    }
  }

  class ConnectionWatchdog {
    constructor({ state: stateRef, showToast, hideToast } = {}) {
      this.state = stateRef;
      this.showToast = showToast;
      this.hideToast = hideToast;
      this.toastVisible = false;
      this.failureTimer = null;
      this.retryHandler = null;
    }

    watchPeer(pc) {
      if (!pc) return;
      pc.addEventListener('connectionstatechange', () => {
        this.handlePeerState(pc.connectionState);
      });
      pc.addEventListener('iceconnectionstatechange', () => {
        this.handlePeerState(pc.connectionState || pc.iceConnectionState);
      });
    }

    handlePeerState(status) {
      if (status === 'connected' || status === 'completed') {
        this.clearFailure();
        this.clearToast();
      } else if (status === 'failed') {
        this.showReconnecting('Connection unstable. Retrying…');
      } else if (status === 'disconnected') {
        this.showReconnecting('Attempting to reconnect…');
      }
    }

    showReconnecting(message = 'Reconnecting…') {
      if (typeof this.showToast === 'function') {
        this.showToast(message, { duration: 0 });
      }
      this.toastVisible = true;
    }

    notifySocketDrop() {
      this.showReconnecting('Connection lost. Reconnecting…');
    }

    notifySocketRecovered() {
      this.clearFailure();
      this.clearToast();
    }

    notifyFailure(callback) {
      this.toastVisible = true;
      this.retryHandler = callback;
      if (typeof this.showToast === 'function') {
        this.showToast('Unable to reconnect. Retry?', {
          actionLabel: 'Retry',
          onAction: () => {
            if (typeof this.retryHandler === 'function') {
              this.retryHandler();
            }
          },
          duration: 0
        });
      }
    }

    clearToast() {
      if (!this.toastVisible) return;
      this.toastVisible = false;
      if (typeof this.hideToast === 'function') {
        this.hideToast();
      }
    }

    armFailure(callback, timeout = 6500) {
      if (this.failureTimer) {
        clearTimeout(this.failureTimer);
      }
      this.retryHandler = callback;
      this.failureTimer = window.setTimeout(() => {
        this.failureTimer = null;
        this.notifyFailure(callback);
      }, timeout);
    }

    clearFailure() {
      if (this.failureTimer) {
        clearTimeout(this.failureTimer);
        this.failureTimer = null;
      }
    }
  }

  let toneManager;
  let participantManager;
  let chatManager;
  let permissionManager;
  let micControl;
  let cameraControl;
  let screenShareControl;
  let connectionWatchdog;

  const playTone = (preset) => {
    toneManager?.play(preset);
  };

  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const getFocusableElements = (root) => {
    if (!root) return [];
    const nodes = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
    return nodes.filter((node) => {
      if (node.hasAttribute('disabled') || node.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  };

  const setupFocusTrap = (container, { initialFocus = null, returnFocus = null } = {}) => {
    if (!container) {
      return () => {};
    }
    const cycle = () => getFocusableElements(container);
    const handleKeydown = (event) => {
      if (event.key !== 'Tab') return;
      const focusables = cycle();
      if (!focusables.length) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeydown);

    const target = initialFocus && container.contains(initialFocus) ? initialFocus : cycle()[0];
    if (target) {
      window.requestAnimationFrame(() => {
        try {
          target.focus();
        } catch (error) {
          /* ignore focus errors */
        }
      });
    }

    return () => {
      container.removeEventListener('keydown', handleKeydown);
      if (returnFocus && typeof returnFocus.focus === 'function') {
        window.requestAnimationFrame(() => {
          try {
            returnFocus.focus();
          } catch (error) {
            /* ignore focus errors */
          }
        });
      }
    };
  };

  const getStoredToken = () => storageGet(storage.local, tokenKey);

  const toInitials = (name = '') => {
    const letters = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
    if (letters) return letters;
    return name.slice(0, 2).toUpperCase() || '??';
  };

  const formatTime = (value) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value));
    } catch (error) {
      return '—';
    }
  };

  const updateParticipantState = (token, payload) => {
    if (!state.classInfo || !Array.isArray(state.classInfo.participants)) return;
    const index = state.classInfo.participants.findIndex((item) => item.token === token);
    if (index !== -1) {
      state.classInfo.participants[index] = {
        ...state.classInfo.participants[index],
        ...payload
      };
    }
  };

  const renderWhiteboard = () => {
    if (!elements.whiteboardCanvas) return;
    const canvas = elements.whiteboardCanvas;
    const ctx = canvas.getContext('2d');
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const strokes = [...(state.whiteboard.strokes || [])];
    if (state.whiteboard.currentStroke) {
      strokes.push(state.whiteboard.currentStroke);
    }

    strokes.forEach((stroke) => {
      const points = Array.isArray(stroke.path) ? stroke.path : [];
      if (points.length < 2) return;
      ctx.strokeStyle = stroke.color || '#1f2937';
      ctx.lineWidth = stroke.size || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((point, idx) => {
        const x = (point.x || 0) * width;
        const y = (point.y || 0) * height;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    const shouldShow = state.whiteboard.visible || state.whiteboard.strokes.length > 0;
    canvas.classList.toggle('hidden', !shouldShow);
  };

  const syncDrawerState = () => {
    const map = {
      chat: elements.chatDrawer,
      participants: elements.participantsDrawer
    };
    Object.entries(map).forEach(([name, drawer]) => {
      if (!drawer) return;
      const isOpen = state.activeDrawer === name;
      drawer.classList.toggle('open', isOpen);
      drawer.classList.toggle('hidden', !isOpen);
      drawer.setAttribute('aria-hidden', (!isOpen).toString());
    });
    const showBackdrop = !!state.activeDrawer;
    if (elements.drawerBackdrop) {
      elements.drawerBackdrop.classList.toggle('hidden', !showBackdrop);
    }
    if (elements.chatToggle) {
      elements.chatToggle.setAttribute('aria-pressed', (state.activeDrawer === 'chat').toString());
    }
    if (elements.participantsToggle) {
      elements.participantsToggle.setAttribute('aria-pressed', (state.activeDrawer === 'participants').toString());
    }
    chatManager?.setDrawerState(state.activeDrawer === 'chat');
  };

  const openDrawer = (name) => {
    state.activeDrawer = name;
    syncDrawerState();
  };

  const closeDrawer = () => {
    state.activeDrawer = null;
    syncDrawerState();
    closeMoreMenu();
  };

  const toggleDrawer = (name) => {
    if (state.activeDrawer === name) {
      closeDrawer();
    } else {
      closeMoreMenu();
      openDrawer(name);
    }
  };

  const updateRecordingStatus = () => {
    if (!elements.recordingStatus) return;
    const isRecording = !!state.recording?.isRecording;
    elements.recordingStatus.textContent = isRecording ? 'Recording in progress…' : 'Recording inactive';
    elements.recordingStatus.classList.toggle('active', isRecording);
    if (elements.recordingStart) {
      elements.recordingStart.classList.toggle('hidden', !state.isHost || isRecording);
    }
    if (elements.recordingStop) {
      elements.recordingStop.classList.toggle('hidden', !state.isHost || !isRecording);
    }
    if (elements.recordingLink) {
      const link = state.classInfo?.recordedVideoLink;
      if (link) {
        elements.recordingLink.classList.remove('hidden');
        elements.recordingLink.innerHTML = `<a href="${link}" target="_blank" rel="noopener">Download recording</a>`;
      } else {
        elements.recordingLink.classList.add('hidden');
        elements.recordingLink.textContent = '';
      }
    }
  };

  const renderPolls = () => {
    if (!elements.pollCreateForm || !elements.pollActive) return;
    const hasActive = !!state.activePoll;
    elements.pollCreateForm.classList.toggle('hidden', !state.isHost || hasActive);
    elements.pollActive.classList.toggle('hidden', !hasActive);
    if (elements.pollClose) {
      elements.pollClose.classList.toggle('hidden', !state.isHost || !hasActive);
    }

    if (hasActive) {
      elements.pollActiveQuestion.textContent = state.activePoll.question;
      const totalVotes = state.activePoll.responses?.length || 0;
      const currentVote = state.activePoll.responses?.find((resp) => resp.participantToken === state.joinToken);
      elements.pollOptionsList.innerHTML = '';
      state.activePoll.options.forEach((option) => {
        const li = document.createElement('li');
        li.className = 'poll-option';

        const header = document.createElement('div');
        header.className = 'poll-option-header';
        const label = document.createElement('span');
        label.textContent = option.label;
        const percent = totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0;
        const meta = document.createElement('span');
        meta.className = 'poll-option-meta';
        meta.textContent = `${option.votes} · ${percent}%`;
        header.appendChild(label);
        header.appendChild(meta);

        const bar = document.createElement('div');
        bar.className = 'poll-option-bar';
        const fill = document.createElement('div');
        fill.style.width = `${percent}%`;
        bar.appendChild(fill);

        li.appendChild(header);
        li.appendChild(bar);

        if (!state.isHost && state.admitted) {
          const voteButton = document.createElement('button');
          voteButton.type = 'button';
          voteButton.className = 'ghost small';
          const voted = currentVote && currentVote.optionId === option.id;
          voteButton.textContent = voted ? 'Voted' : 'Vote';
          if (voted) {
            voteButton.classList.add('primary');
          }
          voteButton.addEventListener('click', () => submitPollVote(option.id));
          li.appendChild(voteButton);
        }

        elements.pollOptionsList.appendChild(li);
      });
    }

    if (elements.pollHistory && elements.pollHistoryList) {
      const history = state.pollHistory || [];
      elements.pollHistory.classList.toggle('hidden', history.length === 0);
      elements.pollHistoryList.innerHTML = '';
      history.slice().reverse().forEach((poll) => {
        const item = document.createElement('li');
        item.className = 'poll-history-item';
        const title = document.createElement('strong');
        title.textContent = poll.question;
        item.appendChild(title);
        const detail = document.createElement('div');
        detail.className = 'poll-history-options';
        poll.options.forEach((opt) => {
          const span = document.createElement('span');
          span.textContent = `${opt.label} (${opt.votes})`;
          detail.appendChild(span);
        });
        item.appendChild(detail);
        elements.pollHistoryList.appendChild(item);
      });
    }
  };

  const renderQna = () => {
    if (!elements.qnaList) return;
    elements.qnaList.innerHTML = '';
    (state.questions || []).slice().reverse().forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'qna-item';
      const questionText = document.createElement('p');
      questionText.className = 'qna-question';
      questionText.textContent = entry.question;
      const meta = document.createElement('span');
      meta.className = 'qna-meta';
      meta.textContent = `Asked by ${entry.askedByName || 'Participant'} · ${formatTime(entry.askedAt)}`;
      li.appendChild(questionText);
      li.appendChild(meta);

      if (entry.answer) {
        const answer = document.createElement('div');
        answer.className = 'qna-answer';
        answer.innerHTML = `<strong>Host:</strong> ${entry.answer}`;
        li.appendChild(answer);
      } else if (state.isHost) {
        const answerBtn = document.createElement('button');
        answerBtn.type = 'button';
        answerBtn.className = 'ghost small';
        answerBtn.textContent = 'Answer';
        answerBtn.addEventListener('click', () => promptAnswer(entry));
        li.appendChild(answerBtn);
      }

      elements.qnaList.appendChild(li);
    });
  };

  const updateRaisedHandsDisplay = () => {
    if (!elements.raisedHands || !elements.raisedHandsList) return;
    const entries = Array.from(state.raisedHands.values()).sort((a, b) => new Date(a.handRaisedAt || 0) - new Date(b.handRaisedAt || 0));
    elements.raisedHands.classList.toggle('hidden', entries.length === 0);
    elements.raisedHandsList.innerHTML = '';
    entries.forEach((entry) => {
      const li = document.createElement('li');
      li.textContent = `${entry.displayName} · ${formatTime(entry.handRaisedAt)}`;
      if (state.isHost) {
        const controls = document.createElement('div');
        controls.className = 'hand-controls';
        const allowBtn = document.createElement('button');
        allowBtn.type = 'button';
        allowBtn.className = 'ghost small';
        allowBtn.textContent = 'Allow';
        allowBtn.addEventListener('click', () => allowParticipant(entry.token));
        const lowerBtn = document.createElement('button');
        lowerBtn.type = 'button';
        lowerBtn.className = 'ghost small';
        lowerBtn.textContent = 'Lower';
        lowerBtn.addEventListener('click', () => lowerHand(entry.token));
        controls.appendChild(allowBtn);
        controls.appendChild(lowerBtn);
        li.appendChild(controls);
      }
      elements.raisedHandsList.appendChild(li);
    });
  };

  const submitPollVote = async (optionId) => {
    try {
      const res = await fetch(`/classes/${classCode}/polls/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId, joinToken: state.joinToken })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Unable to submit vote');
      }
    } catch (error) {
      console.error('submitPollVote error', error);
    }
  };

  const promptAnswer = (question) => {
    const answer = window.prompt('Answer question', question.answer || '');
    if (!answer) return;
    fetch(`/classes/${classCode}/questions/${question.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    });
  };

  const allowParticipant = (token) => {
    if (!state.socket) return;
    state.socket.emit('hand:allow', { targetToken: token }, (response) => {
      if (response?.error) {
        console.error(response.error);
      }
    });
  };

  const lowerHand = (token) => {
    if (!state.socket) return;
    state.socket.emit('hand:lower', { targetToken: token }, (response) => {
      if (response?.error) {
        console.error(response.error);
      }
    });
  };

  const sendMediaControl = (token, updates) => {
    if (!state.socket) return;
    state.socket.emit('media:control', { targetToken: token, ...updates }, (response) => {
      if (response?.error) {
        console.error(response.error);
      }
    });
  };

  const applyMediaState = (token, mediaState = {}) => {
    state.mediaStates.set(token, {
      audio: mediaState.audio === true,
      video: mediaState.video === true
    });
  };

  const getMediaState = (token) => state.mediaStates.get(token) || { audio: false, video: false };

  const setUtilityTab = (tab) => {
    state.utilityTab = tab;
    state.whiteboard.visible = tab === 'whiteboard';
    if (elements.utilityTabs) {
      elements.utilityTabs.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
      });
    }
    if (elements.utilityPanes) {
      elements.utilityPanes.forEach((pane) => {
        pane.classList.toggle('hidden', pane.dataset.pane !== tab);
      });
    }
    if (elements.whiteboardCanvas) {
      elements.whiteboardCanvas.classList.toggle('interactive', state.isHost && tab === 'whiteboard');
    }
    if (tab === 'whiteboard') {
      renderWhiteboard();
    }
  };

  const toggleUtilityPanel = (open) => {
    if (!elements.utilityPanel) return;
    const shouldOpen = typeof open === 'boolean' ? open : !elements.utilityPanel.classList.contains('visible');
    elements.utilityPanel.classList.toggle('visible', shouldOpen);
    elements.utilityPanel.classList.toggle('hidden', !shouldOpen);
    if (shouldOpen) {
      setUtilityTab(state.utilityTab || 'whiteboard');
    } else {
      state.whiteboard.visible = false;
      renderWhiteboard();
    }
  };

  const openUtilityPanel = (tab) => {
    closeMoreMenu();
    if (typeof tab === 'string') {
      setUtilityTab(tab);
    }
    toggleUtilityPanel(true);
  };

  const updateHandRaiseButton = () => {
    if (!elements.handRaiseBtn) return;
    elements.handRaiseBtn.classList.toggle('hidden', state.isHost);
    if (state.isHost) return;
    const canRaise = state.admitted && state.classInfo?.status === 'live';
    elements.handRaiseBtn.disabled = !canRaise;
    const nextLabel = state.handRaised ? 'Lower hand' : 'Raise hand';
    const textNode =
      elements.handRaiseBtn.querySelector('.text') || elements.handRaiseBtn.querySelector('.label');
    if (textNode) {
      textNode.textContent = nextLabel;
    }
    elements.handRaiseBtn.dataset.tooltip = nextLabel;
    elements.handRaiseBtn.setAttribute('aria-label', nextLabel);
    elements.handRaiseBtn.setAttribute('aria-pressed', state.handRaised.toString());
  };

  const toggleHandRaise = () => {
    if (!elements.handRaiseBtn || state.isHost || !state.socket) return;
    if (state.handRaised) {
      state.socket.emit('hand:lower', {}, (response) => {
        if (response?.error) {
          console.error(response.error);
          return;
        }
        state.handRaised = false;
        updateHandRaiseButton();
      });
    } else {
      state.socket.emit('hand:raise', {}, (response) => {
        if (response?.error) {
          console.error(response.error);
          return;
        }
        state.handRaised = true;
        updateHandRaiseButton();
      });
    }
  };

  const getCanvasPoint = (event) => {
    if (!elements.whiteboardCanvas) return null;
    const rect = elements.whiteboardCanvas.getBoundingClientRect();
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    return { x, y };
  };

  const startStroke = (event) => {
    if (!state.isHost || !elements.whiteboardCanvas) return;
    event.preventDefault();
    const point = getCanvasPoint(event);
    if (!point) return;
    state.whiteboard.drawing = true;
    state.whiteboard.currentStroke = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      path: [point],
      color: state.whiteboard.color,
      size: state.whiteboard.size
    };
    renderWhiteboard();
  };

  const extendStroke = (event) => {
    if (!state.whiteboard.drawing || !state.whiteboard.currentStroke) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    state.whiteboard.currentStroke.path.push(point);
    renderWhiteboard();
  };

  const finishStroke = () => {
    if (!state.whiteboard.drawing || !state.whiteboard.currentStroke) return;
    state.whiteboard.drawing = false;
    const stroke = state.whiteboard.currentStroke;
    state.whiteboard.currentStroke = null;
    if (stroke.path.length < 2) {
      renderWhiteboard();
      return;
    }
    state.whiteboard.strokes.push(stroke);
    renderWhiteboard();
    if (state.socket) {
      state.socket.emit('whiteboard:stroke', stroke, (response) => {
        if (response?.error) {
          console.error(response.error);
        }
      });
    }
  };

  const setView = (name) => {
    ['joinView', 'lobbyView', 'hostLobbyView', 'liveView', 'rejoinView', 'endedView'].forEach((key) => {
      if (!elements[key]) return;
      elements[key].classList.toggle('hidden', key !== name);
    });
    document.body.classList.toggle('no-scroll', name === 'liveView');
    if (name !== 'liveView') {
      closeMoreMenu();
      hideLiveToast();
    }
  };

  const renderLobby = () => {
    const buildRow = (entry) => {
      const li = document.createElement('li');
      li.className = 'lobby-entry';

      const identity = document.createElement('div');
      identity.className = 'identity';

      const avatar = document.createElement('span');
      avatar.className = 'avatar-bubble';
      avatar.textContent = toInitials(entry.displayName || 'Guest');

      const meta = document.createElement('div');
      const nameEl = document.createElement('strong');
      nameEl.textContent = entry.displayName || 'Guest';
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Lobby';
      meta.appendChild(nameEl);
      meta.appendChild(hint);

      identity.appendChild(avatar);
      identity.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'actions';

      const approve = document.createElement('button');
      approve.type = 'button';
      approve.className = 'icon-btn approve';
      approve.textContent = '✓';
      approve.setAttribute('aria-label', `Admit ${entry.displayName || 'participant'}`);
      approve.addEventListener('click', () => admit(entry.token));

      const reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'icon-btn reject';
      reject.textContent = '✕';
      reject.setAttribute('aria-label', `Remove ${entry.displayName || 'participant'}`);
      reject.addEventListener('click', () => removeParticipant(entry.token));

      actions.appendChild(approve);
      actions.appendChild(reject);

      li.appendChild(identity);
      li.appendChild(actions);

      return li;
    };

    if (elements.admitList) {
      elements.admitList.innerHTML = '';
      if (!state.lobby.length) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No one is waiting.';
        elements.admitList.appendChild(empty);
      } else {
        state.lobby.forEach((entry) => {
          elements.admitList.appendChild(buildRow(entry));
        });
      }
    }

    if (elements.liveLobbyList && elements.liveLobbyCard && elements.liveLobbyCount) {
      elements.liveLobbyList.innerHTML = '';
      if (state.isHost && state.lobby.length) {
        state.lobby.forEach((entry) => {
          elements.liveLobbyList.appendChild(buildRow(entry));
        });
        elements.liveLobbyCard.classList.remove('hidden');
      } else {
        elements.liveLobbyCard.classList.add('hidden');
      }
      elements.liveLobbyCount.textContent = state.lobby.length;
    }
    participantManager?.updateLobby(state.lobby);
  };

  const renderParticipants = () => {
    if (!elements.participantsList || !state.classInfo) return;
    const participants = state.classInfo.participants || [];
    elements.participantsList.innerHTML = '';
    participantManager?.updateParticipants(participants);

    const buildMediaBadge = (icon, active) => {
      const span = document.createElement('span');
      span.className = `media-chip ${active ? 'on' : 'off'}`;
      span.textContent = icon;
      return span;
    };

    if (state.classInfo.host) {
      const hostItem = document.createElement('li');
      hostItem.className = 'participant host';
      const name = document.createElement('div');
      name.className = 'identity';
      name.innerHTML = `<strong>${state.classInfo.host.name}</strong><span class="role">Host</span>`;
      hostItem.appendChild(name);
      elements.participantsList.appendChild(hostItem);
    }

    const raisedMap = new Map();

    participants.forEach((participant) => {
      const li = document.createElement('li');
      li.className = 'participant';
      const identity = document.createElement('div');
      identity.className = 'identity';
      const strong = document.createElement('strong');
      strong.textContent = participant.displayName;
      identity.appendChild(strong);
      li.appendChild(identity);

      const mediaState = participant.mediaState || getMediaState(participant.token);
      applyMediaState(participant.token, mediaState);

      const status = document.createElement('div');
      status.className = 'participant-status';
      status.appendChild(buildMediaBadge('🎤', mediaState.audio !== false));
      status.appendChild(buildMediaBadge('📷', mediaState.video !== false));
      if (participant.handRaisedAt) {
        const hand = document.createElement('span');
        hand.className = 'hand-raised';
        hand.textContent = '✋';
        status.appendChild(hand);
        raisedMap.set(participant.token, {
          token: participant.token,
          displayName: participant.displayName,
          handRaisedAt: participant.handRaisedAt
        });
      }
      if (participant.allowedToSpeakAt) {
        const granted = document.createElement('span');
        granted.className = 'hand-allowed';
        granted.textContent = '🎙';
        status.appendChild(granted);
      }
      li.appendChild(status);

      if (state.isHost) {
        const actions = document.createElement('div');
        actions.className = 'participant-actions';

        const toggleAudio = document.createElement('button');
        toggleAudio.type = 'button';
        toggleAudio.className = 'ghost small';
        toggleAudio.textContent = mediaState.audio === false ? 'Unmute' : 'Mute';
        toggleAudio.addEventListener('click', () => sendMediaControl(participant.token, { audio: mediaState.audio === false }));

        const toggleVideo = document.createElement('button');
        toggleVideo.type = 'button';
        toggleVideo.className = 'ghost small';
        toggleVideo.textContent = mediaState.video === false ? 'Show video' : 'Hide video';
        toggleVideo.addEventListener('click', () => sendMediaControl(participant.token, { video: mediaState.video === false }));

        actions.appendChild(toggleAudio);
        actions.appendChild(toggleVideo);

        if (participant.handRaisedAt) {
          const allow = document.createElement('button');
          allow.type = 'button';
          allow.className = 'ghost small';
          allow.textContent = 'Allow';
          allow.addEventListener('click', () => allowParticipant(participant.token));
          actions.appendChild(allow);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'ghost small danger';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
          const confirmed = window.confirm(`Remove ${participant.displayName} from the class?`);
          if (confirmed) {
            removeParticipant(participant.token);
          }
        });
        actions.appendChild(removeBtn);

        li.appendChild(actions);
      }

      elements.participantsList.appendChild(li);
    });

    state.raisedHands = raisedMap;
    updateRaisedHandsDisplay();
  };

  const ensureParticipantTile = (id, label) => {
    if (!elements.participantStrip) return null;
    let el = state.videos.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'participant-tile';
      el.innerHTML = `
        <video playsinline autoplay></video>
        <span>${label || ''}</span>
      `;
      elements.participantStrip.appendChild(el);
      state.videos.set(id, el);
    } else if (label) {
      const labelEl = el.querySelector('span');
      if (labelEl) labelEl.textContent = label;
    }
    return el.querySelector('video');
  };

  const removeVideoEl = (id) => {
    const el = state.videos.get(id);
    if (el) {
      const video = el.querySelector('video');
      if (video) {
        video.srcObject = null;
      }
      el.remove();
      state.videos.delete(id);
    }
  };

  const setVideoSource = (video, stream, muted = false) => {
    if (!video) return;
    if (!stream) {
      if ('srcObject' in video) {
        video.srcObject = null;
      } else {
        video.src = '';
      }
      return;
    }
    if ('srcObject' in video) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
    } else {
      video.src = window.URL.createObjectURL(stream);
    }
    video.muted = muted;
    const playPromise = typeof video.play === 'function' ? video.play() : null;
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  };

  const applyLocalStream = (stream, { replace = false } = {}) => {
    if (!stream) return;
    if (replace && state.localStream && state.localStream !== stream) {
      state.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (error) {
          /* ignore stop errors */
        }
      });
    }
    state.localStream = stream;
    state.previewReady = true;
    if (!state.isHost) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !!state.canUseMedia.audio;
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !!state.canUseMedia.video;
      });
    }
    if (elements.previewVideo) {
      setVideoSource(elements.previewVideo, stream, true);
    }
    refreshStage();
    syncTrackButtons();
    state.peers.forEach((pc) => {
      const senders = pc.getSenders();
      stream.getTracks().forEach((track) => {
        const sender = senders.find((item) => item.track && item.track.kind === track.kind);
        if (sender && typeof sender.replaceTrack === 'function') {
          sender
            .replaceTrack(track)
            .catch((error) => console.warn('replaceTrack error', error));
        } else {
          try {
            pc.addTrack(track, stream);
          } catch (error) {
            console.warn('addTrack error', error);
          }
        }
      });
    });
    emitMediaUpdate();
  };

  const updatePrimaryStream = (stream, label, muted = false) => {
    if (!elements.primaryVideo) return;
    if (stream) {
      setVideoSource(elements.primaryVideo, stream, muted);
      elements.primaryContainer?.classList.remove('placeholder');
    } else {
      elements.primaryVideo.srcObject = null;
      elements.primaryContainer?.classList.add('placeholder');
    }
    if (elements.primaryLabel) {
      elements.primaryLabel.textContent = label || '';
    }
  };

  const updatePipStream = (stream, label, muted = true) => {
    if (!elements.pipContainer || !elements.pipVideo) return;
    if (stream) {
      elements.pipContainer.classList.remove('hidden');
      setVideoSource(elements.pipVideo, stream, muted);
      if (elements.pipLabel) {
        elements.pipLabel.textContent = label || '';
      }
    } else {
      elements.pipContainer.classList.add('hidden');
      elements.pipVideo.srcObject = null;
      if (elements.pipLabel) {
        elements.pipLabel.textContent = '';
      }
    }
  };

  const refreshStage = () => {
    if (state.isHost) {
      if (state.screenStream) {
        updatePrimaryStream(state.screenStream, 'You are sharing your screen', true);
        const localActive = !!state.localStream?.getVideoTracks().some((track) => track.enabled);
        if (state.localStream && localActive) {
          updatePipStream(state.localStream, 'You', true);
        } else {
          updatePipStream(null);
        }
      } else if (state.localStream && state.localStream.getVideoTracks().some((track) => track.enabled)) {
        updatePrimaryStream(state.localStream, 'You', true);
        updatePipStream(null);
      } else {
        updatePrimaryStream(null, 'Waiting for your camera…', true);
        updatePipStream(null);
      }
    } else {
      const hostName = state.classInfo?.host?.name || 'Host';
      if (state.hostMedia.screen) {
        updatePrimaryStream(state.hostMedia.screen, `${hostName} · Screen`, false);
        if (state.hostMedia.camera && isRemoteVideoActive(state.hostMedia.camera)) {
          updatePipStream(state.hostMedia.camera, hostName, false);
        } else {
          updatePipStream(null);
        }
      } else if (state.hostMedia.camera && isRemoteVideoActive(state.hostMedia.camera)) {
        updatePrimaryStream(state.hostMedia.camera, hostName, false);
        updatePipStream(null);
      } else {
        updatePrimaryStream(null, 'Waiting for the host…', false);
        updatePipStream(null);
      }
    }
  };

  const hideSpeakerBanner = () => {
    if (state.speakerTimeout) {
      clearTimeout(state.speakerTimeout);
      state.speakerTimeout = null;
    }
    state.activeSpeaker = null;
    if (elements.speakerBanner) {
      elements.speakerBanner.textContent = '';
      elements.speakerBanner.classList.add('hidden');
      delete elements.speakerBanner.dataset.kind;
    }
  };

  const showSpeakerBanner = (token, reason = 'audio') => {
    if (!elements.speakerBanner || !token) return;
    const name = getNameByToken(token);
    const label = reason === 'screen'
      ? `${name} is presenting`
      : `${name} has the mic`;
    elements.speakerBanner.textContent = label;
    elements.speakerBanner.dataset.kind = reason;
    elements.speakerBanner.classList.remove('hidden');
    state.activeSpeaker = token;
    if (state.speakerTimeout) {
      clearTimeout(state.speakerTimeout);
    }
    state.speakerTimeout = window.setTimeout(() => hideSpeakerBanner(), 8000);
  };

  const detectScreenTrack = (stream) => {
    const [track] = stream.getVideoTracks();
    if (!track) return false;
    const label = track.label?.toLowerCase() || '';
    return label.includes('screen') || label.includes('display') || label.includes('window');
  };

  const isRemoteVideoActive = (stream) => {
    const [track] = stream?.getVideoTracks() || [];
    if (!track) return false;
    if (typeof track.muted === 'boolean') {
      return !track.muted;
    }
    return track.readyState === 'live';
  };

  const handleHostMediaTrack = (type, stream) => {
    const key = type === 'screen' ? 'screen' : 'camera';
    state.hostMedia[key] = stream;
    if (type === 'screen' && !state.isHost) {
      showSpeakerBanner('host', 'screen');
    }
    stream.getVideoTracks().forEach((track) => {
      bindRemoteTrackGuard({ token: 'host', label: `${key}-video`, track });
      if (hostTrackRegistry.has(track)) {
        return;
      }
      hostTrackRegistry.add(track);
      const updateStage = () => refreshStage();
      const handleEnded = () => {
        track.removeEventListener('mute', updateStage);
        track.removeEventListener('unmute', updateStage);
        track.removeEventListener('ended', handleEnded);
        const cleanup = remoteTrackGuards.get(track);
        if (typeof cleanup === 'function') {
          cleanup();
        }
        if (state.hostMedia[key] === stream) {
          state.hostMedia[key] = null;
        }
        refreshStage();
        if (state.activeSpeaker === 'host') {
          hideSpeakerBanner();
        }
      };
      track.addEventListener('mute', updateStage);
      track.addEventListener('unmute', updateStage);
      track.addEventListener('ended', handleEnded);
    });
    stream.getAudioTracks().forEach((track) => {
      bindRemoteTrackGuard({ token: 'host', label: `${key}-audio`, track });
    });
    refreshStage();
  };

  const attachParticipantStream = (id, stream, label) => {
    const videoEl = ensureParticipantTile(id, label);
    if (!videoEl) return;
    setVideoSource(videoEl, stream, id === state.joinToken);
    const wrapper = state.videos.get(id);
    if (wrapper) {
      const hasVideoTrack = stream.getVideoTracks().some((track) => track.readyState === 'live');
      wrapper.classList.toggle('audio-only', !hasVideoTrack);
    }
  };

  const getNameByToken = (token) => {
    if (token === 'host') {
      return state.classInfo?.host?.name || 'Host';
    }
    const participant = state.classInfo?.participants?.find((p) => p.token === token);
    return participant?.displayName || 'Participant';
  };

  const attachStream = (id, stream, label) => {
    if (!stream) return;
    if (id === 'host' && !state.isHost) {
      const type = detectScreenTrack(stream) ? 'screen' : 'camera';
      handleHostMediaTrack(type, stream);
      return;
    }
    if (id === 'host' && state.isHost) {
      return;
    }
    attachParticipantStream(id, stream, label || getNameByToken(id));
  };

  const stopStream = (stream) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  };

  const setupPreview = async () => {
    if (state.previewReady && state.localStream) {
      return state.localStream;
    }
    state.previewReady = true;
    if (!permissionManager) {
      return state.localStream || null;
    }
    const stream = await permissionManager.ensurePreview();
    if (stream && !state.localStream) {
      applyLocalStream(stream, { replace: true });
    }
    return state.localStream || stream || null;
  };

  const updateMeetingMeta = () => {
    if (!state.classInfo) return;
    elements.meetingTitle.textContent = state.classInfo.title;
    elements.meetingCode.textContent = state.classInfo.meetingCode;
    if (elements.copyLink) {
      elements.copyLink.dataset.link = state.classInfo.meetingLink;
    }
    if (elements.copyCode) {
      elements.copyCode.dataset.code = state.classInfo.meetingCode;
    }
    if (elements.liveMeetingTitle) {
      elements.liveMeetingTitle.textContent = state.classInfo.title;
    }
    if (elements.liveMeetingCode) {
      elements.liveMeetingCode.textContent = state.classInfo.meetingCode;
    }
    if (elements.shareInfo) {
      elements.shareInfo.dataset.link = state.classInfo.meetingLink;
    }
    refreshStage();
  };

  const loadClass = async () => {
    const res = await fetch(`/classes/${classCode}`);
    if (!res.ok) throw new Error('Failed to load class');
    state.classInfo = await res.json();
    state.whiteboard.strokes = (state.classInfo.whiteboard?.strokes || []).map((stroke) => ({
      ...stroke,
      path: Array.isArray(stroke.path) ? stroke.path : []
    }));
    state.activePoll = state.classInfo.activePoll || null;
    state.pollHistory = state.classInfo.pollHistory || [];
    state.questions = state.classInfo.questions || [];
    state.recording = state.classInfo.recording || { isRecording: false };
    (state.classInfo.participants || []).forEach((participant) => {
      applyMediaState(participant.token, participant.mediaState);
    });
    participantManager?.updateParticipants(state.classInfo.participants || []);
    updateMeetingMeta();
    renderParticipants();
    renderWhiteboard();
    renderPolls();
    renderQna();
    updateRecordingStatus();
    refreshStage();
  };

  const loadUser = async () => {
    try {
      const res = await fetch('/auth/me');
      if (!res.ok) return;
      state.user = await res.json();
    } catch (error) {
      state.user = null;
    }
  };

  const connectSocket = () => {
    if (state.socket) return;
    state.socket = io();

    state.socket.on('connect', () => {
      connectionWatchdog?.clearFailure();
      connectionWatchdog?.notifySocketRecovered();
      state.socket.emit(
        'session:join',
        {
          classCode,
          token: getStoredToken(),
          joinToken: state.joinToken,
          displayName: elements.nameInput?.value || state.user?.name
        },
        (response) => {
          if (response?.error) {
            console.error(response.error);
            return;
          }
          const wasRejoining = state.rejoinScreenActive || state.rejoining;
          if (response.joinToken) {
            state.joinToken = response.joinToken;
            persistJoinToken(state.joinToken);
          }
          hideRejoinPrompt();
          clearReconnectTimer();
          state.isHost = response.role === 'host';
          permissionManager?.configureRole(state.isHost);
          participantManager?.setIsHost(state.isHost);
          state.skipRejoinFlag = false;
          if (elements.hostControls) {
            elements.hostControls.classList.toggle('hidden', !state.isHost);
          }
          if (elements.screenShareBtn) {
            elements.screenShareBtn.classList.toggle('hidden', !state.isHost);
          }
          if (elements.endButton) {
            elements.endButton.classList.toggle('hidden', !state.isHost);
          }
          if (!state.isHost && response.name) {
            persistDisplayName(response.name);
            state.savedDisplayName = response.name;
            if (elements.nameInput) {
              elements.nameInput.value = response.name;
            }
          }
          if (response.classStatus) {
            state.classInfo.status = response.classStatus;
          }
          state.admitted = response.role === 'participant';
          if (!state.isHost) {
            const selfMedia = getMediaState(state.joinToken);
            state.canUseMedia = {
              audio: selfMedia.audio === true,
              video: selfMedia.video === true
            };
            updateViewerMediaControls();
          }
          refreshStage();
          updateHandRaiseButton();
          if (wasRejoining) {
            handleRejoinSuccess(response);
            return;
          }
          resetRejoinButtons();
          clearRejoinNeeded();
          if (response.classStatus === 'ended') {
            setView('endedView');
            return;
          }
          if (state.isHost) {
            if (state.classInfo.status === 'live') {
              setView('liveView');
              beginCall();
            } else {
              setView('hostLobbyView');
              refreshLobby();
            }
          } else if (state.admitted && state.classInfo.status === 'live') {
            setView('liveView');
            if (!state.isHost) {
              muteLocalTracks();
            }
            beginCall();
          } else if (state.admitted) {
            setView('lobbyView');
            if (elements.waitingMessage) {
              elements.waitingMessage.textContent = 'Waiting for the host to start the class…';
            }
            if (!state.isHost) {
              muteLocalTracks();
            }
          }
          emitMediaUpdate();
        }
      );
    });

    const handleSocketDrop = (reason) => {
      const classIsLive = state.classInfo?.status === 'live';
      state.skipRejoinFlag = false;
      connectionWatchdog?.notifySocketDrop();
      if (classIsLive) {
        markRejoinNeeded();
      }
      if (!state.isHost) {
        showRejoinPrompt();
      }
      if (classIsLive && (state.isHost || state.admitted)) {
        const copy = state.isHost
          ? { message: 'Connection lost. Rejoin to keep the class running.' }
          : { message: 'Connection dropped. Tap rejoin to continue.' };
        if (!state.rejoinScreenActive) {
          showRejoinScreen(copy);
        }
        scheduleReconnect(state.isHost);
      } else if (!state.isHost) {
        scheduleReconnect();
      }
      if (reason !== 'manual') {
        leaveSession();
      }
    };

    state.socket.on('disconnect', () => {
      handleSocketDrop('disconnect');
    });

    state.socket.on('connect_error', () => {
      handleSocketDrop('error');
    });

    state.socket.on('lobby:update', ({ lobby }) => {
      if (!Array.isArray(lobby)) return;
      state.lobby = lobby;
      participantManager?.updateLobby(state.lobby);
      renderLobby();
    });

    state.socket.on('participant:approved', ({ participant, classStatus }) => {
      if (participant?.token && participant.token === state.joinToken) {
        state.joinToken = participant.token;
        persistJoinToken(participant.token);
        state.admitted = true;
        if (classStatus) {
          state.classInfo.status = classStatus;
        }
        state.classInfo.participants = state.classInfo.participants || [];
        const existing = state.classInfo.participants.find((p) => p.token === participant.token);
        if (existing) {
          Object.assign(existing, participant);
        } else {
          state.classInfo.participants.push(participant);
        }
        state.canUseMedia = {
          audio: participant.mediaState?.audio === true,
          video: participant.mediaState?.video === true
        };
        applyMediaState(participant.token, participant.mediaState);
        renderParticipants();
        updateViewerMediaControls();
        if (state.classInfo.status === 'live') {
          setView('liveView');
          if (!state.isHost) {
            muteLocalTracks();
          }
          beginCall();
          if (elements.waitingMessage) {
            elements.waitingMessage.textContent = 'Joining the class…';
          }
        } else {
          setView('lobbyView');
          if (elements.waitingMessage) {
            elements.waitingMessage.textContent = 'Waiting for the host to start the class…';
          }
          if (!state.isHost) {
            muteLocalTracks();
          }
        }
        state.handRaised = false;
        updateHandRaiseButton();
        updateViewerMediaControls();
      }
    });

    state.socket.on('participant:joined', ({ participant }) => {
      if (!participant?.token) return;
      state.classInfo.participants = state.classInfo.participants || [];
      const existing = state.classInfo.participants.find((p) => p.token === participant.token);
      if (existing) {
        Object.assign(existing, participant);
      } else {
        state.classInfo.participants.push(participant);
      }
      applyMediaState(participant.token, participant.mediaState);
      renderParticipants();
      if (state.isHost) {
        createPeerConnection(participant.token, true);
      }
      if (participant.token !== state.joinToken) {
        playTone('join');
        const name = participant.displayName || getNameByToken(participant.token) || 'Participant';
        if (state.isHost) {
          showLiveToast(`${name} joined the class`, {
            actionLabel: 'View participants',
            onAction: () => toggleDrawer('participants')
          });
        } else {
          showLiveToast(`${name} joined the class`);
        }
      }
    });

    state.socket.on('participant:removed', ({ joinToken }) => {
      if (joinToken === state.joinToken) {
        leaveSession();
        setView('joinView');
        state.admitted = false;
        elements.waitingMessage.textContent = 'Removed by host';
        clearJoinToken();
        state.joinToken = null;
        state.handRaised = false;
        updateHandRaiseButton();
        state.skipRejoinFlag = true;
        clearRejoinNeeded();
        hideRejoinScreen();
        resetRejoinButtons();
        if (!state.isHost && state.socket) {
          state.socket.disconnect();
          state.socket = null;
        }
        return;
      }
      if (state.classInfo?.participants) {
        state.classInfo.participants = state.classInfo.participants.filter((p) => p.token !== joinToken);
        renderParticipants();
      }
      state.raisedHands.delete(joinToken);
      updateRaisedHandsDisplay();
      if (state.isHost) {
        state.lobby = state.lobby.filter((entry) => entry.token !== joinToken);
        participantManager?.updateLobby(state.lobby);
        renderLobby();
      }
      removeVideoEl(joinToken);
      state.peers.delete(joinToken);
      state.screenSenders = state.screenSenders.filter(({ token }) => token !== joinToken);
      if (state.activeSpeaker === joinToken) {
        hideSpeakerBanner();
      }
      if (joinToken && joinToken !== state.joinToken) {
        playTone('leave');
        const name = getNameByToken(joinToken) || 'Participant';
        showLiveToast(`${name} was removed`);
      }
    });

    state.socket.on('participant:disconnected', ({ joinToken }) => {
      if (state.classInfo?.participants) {
        state.classInfo.participants = state.classInfo.participants.filter((p) => p.token !== joinToken);
        renderParticipants();
      }
      state.raisedHands.delete(joinToken);
      updateRaisedHandsDisplay();
      removeVideoEl(joinToken);
      state.peers.delete(joinToken);
      state.screenSenders = state.screenSenders.filter(({ token }) => token !== joinToken);
      if (state.activeSpeaker === joinToken) {
        hideSpeakerBanner();
      }
      if (joinToken && joinToken !== state.joinToken) {
        playTone('leave');
        const name = getNameByToken(joinToken) || 'Participant';
        showLiveToast(`${name} left the class`);
      }
    });

    state.socket.on('class:started', () => {
      state.classInfo.status = 'live';
      updateHandRaiseButton();
      if (!state.isHost && state.admitted && elements.waitingMessage) {
        elements.waitingMessage.textContent = 'Joining the class…';
      }
      if (state.isHost) {
        beginCall();
        setView('liveView');
      } else if (state.admitted) {
        setView('liveView');
        if (!state.isHost) {
          muteLocalTracks();
        }
        beginCall();
      }
      refreshStage();
    });

    state.socket.on('class:ended', () => {
      if (state.classInfo) {
        state.classInfo.status = 'ended';
      }
      state.skipRejoinFlag = true;
      hideSpeakerBanner();
      leaveSession();
      setView('endedView');
      clearJoinToken();
      state.joinToken = null;
      state.admitted = false;
      state.handRaised = false;
      updateHandRaiseButton();
      clearRejoinNeeded();
      hideRejoinScreen();
      if (!state.isHost && state.socket) {
        state.socket.disconnect();
        state.socket = null;
      }
    });

    state.socket.on('chat:new', (message) => {
      const fromSelf = message?.joinToken === state.joinToken;
      appendMessage(message);
      chatManager?.handleNewMessage({ fromSelf });
    });
    state.socket.on('chat:remove', ({ msgId }) => {
      const el = elements.chatMessages.querySelector(`[data-id="${msgId}"]`);
      if (el) el.remove();
    });

    state.socket.on('participant:media', ({ joinToken, mediaState }) => {
      applyMediaState(joinToken, mediaState);
      updateParticipantState(joinToken, { mediaState });
      renderParticipants();
      const media = getMediaState(joinToken);
      if (joinToken === state.joinToken && !state.isHost) {
        if (mediaState && typeof mediaState.audio === 'boolean') {
          state.canUseMedia.audio = mediaState.audio !== false;
        }
        if (mediaState && typeof mediaState.video === 'boolean') {
          state.canUseMedia.video = mediaState.video !== false;
        }
        updateViewerMediaControls();
      }
      if (media.audio && media.video === false) {
        showSpeakerBanner(joinToken);
      }
      if ((!media.audio || media.video) && state.activeSpeaker === joinToken) {
        hideSpeakerBanner();
      }
    });

    state.socket.on('hand:raised', ({ joinToken, name, handRaisedAt }) => {
      updateParticipantState(joinToken, { handRaisedAt });
      state.raisedHands.set(joinToken, { token: joinToken, displayName: name, handRaisedAt });
      renderParticipants();
      if (joinToken === state.joinToken) {
        state.handRaised = true;
        updateHandRaiseButton();
      } else if (state.isHost) {
        playTone('hand');
        const label = name || getNameByToken(joinToken) || 'Participant';
        showLiveToast(`${label} raised their hand`, {
          actionLabel: 'View participants',
          onAction: () => toggleDrawer('participants')
        });
      }
    });

    state.socket.on('hand:lowered', ({ joinToken, loweredByHost = false, mutedByHost = false } = {}) => {
      updateParticipantState(joinToken, { handRaisedAt: null });
      state.raisedHands.delete(joinToken);
      renderParticipants();
      if (joinToken === state.joinToken) {
        state.handRaised = false;
        if (mutedByHost || loweredByHost) {
          state.canUseMedia = { audio: false, video: false };
          muteLocalTracks();
        }
        updateHandRaiseButton();
        updateViewerMediaControls();
        if (mutedByHost) {
          showLiveToast('Host muted you. Raise your hand to speak again.');
        } else if (loweredByHost) {
          showLiveToast('Host declined your request. You can raise your hand again when ready.');
        }
      }
      if (state.isHost) {
        updateRaisedHandsDisplay();
      }
    });

    state.socket.on('hand:allowed', async ({ joinToken }) => {
      updateParticipantState(joinToken, { handRaisedAt: null, allowedToSpeakAt: new Date().toISOString() });
      state.raisedHands.delete(joinToken);
      renderParticipants();
      if (joinToken === state.joinToken) {
        state.handRaised = false;
        state.canUseMedia = { audio: true, video: true };
        updateHandRaiseButton();
        updateViewerMediaControls();
        try {
          await permissionManager?.ensureInteractivePermissions({ audio: true, video: true });
        } catch (error) {
          console.error('Failed to enable media permissions after approval', error);
        }
        showLiveToast('Host approved your request. You can speak now.');
      }
    });

    state.socket.on('host:allow-speak', async () => {
      state.handRaised = false;
      state.canUseMedia = { audio: true, video: true };
      updateHandRaiseButton();
      try {
        await applyHostMediaState({ audio: true });
      } catch (error) {
        console.error('Failed to apply host media state after allow-speak', error);
      }
      updateViewerMediaControls();
      alert('The host allowed you to speak. Your microphone is enabled.');
    });

    state.socket.on('host:media', async (mediaState) => {
      try {
        await applyHostMediaState(mediaState);
      } catch (error) {
        console.error('Failed to apply host media state update', error);
      }
      if (!state.isHost && mediaState) {
        if (typeof mediaState.audio === 'boolean') {
          state.canUseMedia.audio = mediaState.audio !== false;
        }
        if (typeof mediaState.video === 'boolean') {
          state.canUseMedia.video = mediaState.video !== false;
        }
        updateViewerMediaControls();
      }
    });

    state.socket.on('whiteboard:stroke', (stroke) => {
      if (!stroke?.id) return;
      if (!state.whiteboard.strokes.some((existing) => existing.id === stroke.id)) {
        state.whiteboard.strokes.push({
          ...stroke,
          path: Array.isArray(stroke.path) ? stroke.path : []
        });
      }
      if (state.whiteboard.strokes.length > 500) {
        state.whiteboard.strokes.shift();
      }
      renderWhiteboard();
    });

    state.socket.on('whiteboard:clear', () => {
      state.whiteboard.strokes = [];
      renderWhiteboard();
    });

    state.socket.on('poll:created', (poll) => {
      state.activePoll = poll;
      renderPolls();
    });

    state.socket.on('poll:voted', ({ pollId, responses, options }) => {
      if (!state.activePoll || state.activePoll.id !== pollId) return;
      state.activePoll.responses = responses;
      state.activePoll.options = options;
      renderPolls();
    });

    state.socket.on('poll:closed', (poll) => {
      state.pollHistory = state.pollHistory || [];
      if (!state.pollHistory.some((item) => item.id === poll.id)) {
        state.pollHistory.push(poll);
      }
      state.activePoll = null;
      renderPolls();
    });

    state.socket.on('qna:new', (entry) => {
      state.questions = state.questions || [];
      state.questions.push(entry);
      renderQna();
    });

    state.socket.on('qna:answered', (entry) => {
      const index = (state.questions || []).findIndex((item) => item.id === entry.id);
      if (index !== -1) {
        state.questions[index] = entry;
      } else {
        state.questions.push(entry);
      }
      renderQna();
    });

    state.socket.on('recording:status', (payload) => {
      const recording = payload?.recording || payload;
      state.recording = recording;
      state.classInfo.recording = recording;
      if (payload?.recordedVideoLink) {
        state.classInfo.recordedVideoLink = payload.recordedVideoLink;
      }
      updateRecordingStatus();
    });

    state.socket.on('webrtc:signal', handleSignal);
  };

  const beginCall = async () => {
    if (!state.localStream) {
      await setupPreview();
    }
    if (state.isHost) {
      (state.classInfo.participants || []).forEach((p) => {
        createPeerConnection(p.token, true);
      });
    } else {
      createPeerConnection('host', true);
    }
  };

  const leaveSession = () => {
    state.peers.forEach((pc) => pc.close());
    state.peers.clear();
    state.videos.forEach((node, key) => {
      if (key !== 'local') node.remove();
    });
    state.videos = new Map();
    stopScreenShare();
    state.hostMedia = { camera: null, screen: null };
    state.activeDrawer = null;
    syncDrawerState();
    refreshStage();
    hideSpeakerBanner();
    clearReconnectTimer();
    state.canUseMedia = { audio: false, video: false };
    updateViewerMediaControls();
    hideLiveToast();
    closeMoreMenu();
  };

  const createPeerConnection = (targetToken, initiator = false) => {
    if (!targetToken || state.peers.has(targetToken)) return state.peers.get(targetToken);

    const pc = new RTCPeerConnection(rtcConfig);
    state.peers.set(targetToken, pc);
    connectionWatchdog?.watchPeer(pc);

    if (state.isHost && state.localStream) {
      state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));
    }
    if (state.isHost && state.screenStream) {
      state.screenStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, state.screenStream);
        state.screenSenders.push({ pc, sender, token: targetToken, track });
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        state.socket.emit('webrtc:signal', {
          classCode,
          target: targetToken,
          data: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      attachStream(targetToken, stream, getNameByToken(targetToken));
      if (event.track && typeof event.track.addEventListener === 'function') {
        event.track.addEventListener('ended', () => {
          if (targetToken === 'host' && !state.isHost) {
            if (detectScreenTrack(stream)) {
              state.hostMedia.screen = null;
            } else {
              state.hostMedia.camera = null;
            }
            refreshStage();
          }
        });
      }
    };

    const teardownPeer = () => {
      clearPeerRecovery(targetToken);
      removeVideoEl(targetToken);
      state.peers.delete(targetToken);
      if (targetToken === 'host' && !state.isHost) {
        state.hostMedia = { camera: null, screen: null };
        refreshStage();
      }
      if (state.activeSpeaker === targetToken) {
        hideSpeakerBanner();
      }
    };

    const scheduleRecovery = () => {
      window.setTimeout(() => {
        if (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected') {
          attemptPeerRecovery(targetToken, { iceRestart: true });
        }
      }, 600);
    };

    const handlePeerState = (stateValue) => {
      if (stateValue === 'connected' || stateValue === 'completed') {
        clearPeerRecovery(targetToken);
        verifyRemoteTracks(targetToken);
        connectionWatchdog?.clearFailure();
      } else if (stateValue === 'disconnected') {
        scheduleRecovery();
        schedulePeerRecovery(targetToken, 'disconnected');
      } else if (stateValue === 'failed') {
        schedulePeerRecovery(targetToken, 'failed');
        window.setTimeout(() => {
          if (pc.connectionState === 'failed') {
            attemptPeerRecovery(targetToken, { iceRestart: true });
          }
        }, 500);
        window.setTimeout(() => {
          if (pc.connectionState === 'failed') {
            teardownPeer();
          }
        }, 5000);
      } else if (stateValue === 'closed') {
        clearPeerRecovery(targetToken);
        teardownPeer();
      }
    };

    pc.onconnectionstatechange = () => {
      handlePeerState(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      handlePeerState(pc.iceConnectionState);
    };

    if (initiator) {
      setTimeout(async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          state.socket.emit('webrtc:signal', {
            classCode,
            target: targetToken,
            data: { type: 'offer', sdp: offer }
          });
        } catch (error) {
          console.error('Offer error', error);
        }
      }, 200);
    }

    return pc;
  };

  const renegotiate = async (pc, targetToken, options = {}) => {
    try {
      const offerOptions = options.iceRestart ? { iceRestart: true } : {};
      const offer = await pc.createOffer(offerOptions);
      await pc.setLocalDescription(offer);
      state.socket.emit('webrtc:signal', {
        classCode,
        target: targetToken,
        data: { type: 'offer', sdp: offer }
      });
    } catch (error) {
      console.error('Renegotiation error', error);
    }
  };

  const handleSignal = async ({ fromToken, data }) => {
    const token = fromToken;
    if (!data || !token) return;

    let pc = state.peers.get(token);
    if (!pc) {
      pc = createPeerConnection(token, false);
    }

    try {
      if (data.type === 'offer') {
        await pc.setRemoteDescription(data.sdp);
        if (!state.localStream) {
          await setupPreview();
        }
        if (state.localStream) {
          state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        state.socket.emit('webrtc:signal', {
          classCode,
          target: token,
          data: { type: 'answer', sdp: answer }
        });
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription(data.sdp);
      } else if (data.type === 'candidate' && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (error) {
      console.error('Signal error', error);
    }
  };

  const appendMessage = (message) => {
    if (!message) return;
    if (message.system) {
      const item = document.createElement('div');
      item.className = 'chat-item system';
      const text = document.createElement('span');
      text.className = 'chat-system-text';
      text.textContent = message.message;
      item.appendChild(text);
      if (message.createdAt) {
        const time = document.createElement('span');
        time.className = 'chat-system-time';
        time.textContent = formatTime(message.createdAt);
        item.appendChild(time);
      }
      elements.chatMessages.appendChild(item);
      elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-item';
    if (message._id) {
      wrapper.dataset.id = message._id;
    }

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = toInitials(message.senderName || 'User');

    const content = document.createElement('div');
    content.className = 'chat-content';

    const metaRow = document.createElement('div');
    metaRow.className = 'chat-meta-row';

    const author = document.createElement('span');
    author.className = 'chat-author';
    author.textContent = message.senderName || 'User';

    const time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = formatTime(message.createdAt);

    metaRow.appendChild(author);
    metaRow.appendChild(time);

    const text = document.createElement('p');
    text.className = 'chat-text';
    text.textContent = message.message || '';

    content.appendChild(metaRow);
    content.appendChild(text);

    wrapper.appendChild(avatar);
    wrapper.appendChild(content);

    elements.chatMessages.appendChild(wrapper);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  };

  const loadChatHistory = async () => {
    try {
      const res = await fetch(`/chat/${classCode}`);
      if (!res.ok) return;
      const messages = await res.json();
      messages.forEach(appendMessage);
      chatManager?.reset();
    } catch (error) {
      console.error('Chat history error', error);
    }
  };

  const admit = async (token) => {
    await fetch(`/classes/${classCode}/admit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinToken: token })
    });
  };

  const removeParticipant = async (token) => {
    await fetch(`/classes/${classCode}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinToken: token })
    });
  };

  const refreshLobby = () => {
    if (!state.socket || !state.isHost) return;
    state.socket.emit('class:lobby:update', null, (response) => {
      if (response?.lobby) {
        state.lobby = response.lobby;
        participantManager?.updateLobby(state.lobby);
        renderLobby();
      }
    });
  };

  const autoJoinWithSavedName = async () => {
    if (state.isHost || state.socket || state.joinToken) {
      if (!state.joinToken && !state.savedDisplayName) {
        setView('joinView');
      }
      return;
    }
    if (!state.savedDisplayName) {
      setView('joinView');
      return;
    }
    if (elements.nameInput) {
      elements.nameInput.value = state.savedDisplayName;
    }
    try {
      const res = await fetch(`/classes/${classCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: state.savedDisplayName })
      });
      if (!res.ok) {
        throw new Error('Auto join failed');
      }
      const data = await res.json();
      if (data.joinToken) {
        state.joinToken = data.joinToken;
        persistJoinToken(state.joinToken);
      }
      if (elements.waitingMessage) {
        const waitingText = data.message?.toLowerCase().includes('waiting')
          ? 'Waiting for the host to let you in…'
          : 'Reconnecting to the class…';
        elements.waitingMessage.textContent = waitingText;
      }
      setView('lobbyView');
      connectSocket();
      updateViewerMediaControls();
    } catch (error) {
      console.error('Auto join error', error);
      setView('joinView');
    }
  };

  const attemptRejoin = async () => {
    hideRejoinPrompt();
    clearReconnectTimer();
    state.rejoining = true;
    state.skipRejoinFlag = false;
    markRejoinNeeded();
    connectionWatchdog?.showReconnecting('Rejoining…');
    connectionWatchdog?.armFailure(() => attemptRejoin());
    if (elements.rejoinBtn) {
      elements.rejoinBtn.disabled = true;
      setButtonLabel(elements.rejoinBtn, 'Rejoining…');
    }
    if (elements.rejoinScreenBtn) {
      elements.rejoinScreenBtn.disabled = true;
      setButtonLabel(elements.rejoinScreenBtn, 'Rejoining…');
    }
    try {
      leaveSession();
      if (state.socket) {
        try {
          state.socket.disconnect();
        } catch (error) {
          /* ignore */
        }
        state.socket = null;
      }
      if (state.isHost) {
        connectSocket();
        return;
      }
      if (state.joinToken) {
        connectSocket();
      } else {
        await autoJoinWithSavedName();
      }
    } catch (error) {
      console.error('Rejoin attempt error', error);
      state.rejoining = false;
      connectionWatchdog?.notifyFailure(() => attemptRejoin());
      resetRejoinButtons();
    }
  };

  const handleRejoinSuccess = (response) => {
    const statusFromResponse = response?.classStatus;
    state.rejoining = false;
    connectionWatchdog?.clearFailure();
    connectionWatchdog?.notifySocketRecovered();
    const refreshAndResume = async () => {
      try {
        await loadClass();
      } catch (error) {
        console.error('Rejoin refresh error', error);
      }
      const currentStatus = state.classInfo?.status || statusFromResponse;
      if (currentStatus === 'ended') {
        setView('endedView');
        hideRejoinScreen();
        resetRejoinButtons();
        clearRejoinNeeded();
        clearReconnectTimer();
        refreshStage();
        return;
      }
      if (state.isHost) {
        setView(currentStatus === 'live' ? 'liveView' : 'hostLobbyView');
        if (currentStatus === 'live') {
          beginCall();
        }
        renderLobby();
        refreshLobby();
      } else if (state.joinToken) {
        if (currentStatus === 'live') {
          state.admitted = true;
          setView('liveView');
          beginCall();
        } else {
          setView('lobbyView');
          if (elements.waitingMessage) {
            elements.waitingMessage.textContent = 'Waiting for the host to let you in…';
          }
        }
        const media = getMediaState(state.joinToken);
        state.canUseMedia = {
          audio: media.audio === true,
          video: media.video === true
        };
        updateViewerMediaControls();
      }
      state.skipRejoinFlag = false;
      hideRejoinScreen();
      hideRejoinPrompt();
      resetRejoinButtons();
      clearRejoinNeeded();
      clearReconnectTimer();
      refreshStage();
    };
    refreshAndResume();
  };

  elements.joinButton?.addEventListener('click', async () => {
    const displayName = elements.nameInput.value.trim();
    if (!displayName) {
      alert('Enter your name');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Join meeting?',
      message: `Join the class as ${displayName}?`,
      confirmText: 'Join now'
    });
    if (!confirmed) {
      return;
    }
    persistDisplayName(displayName);
    state.savedDisplayName = displayName;
    const res = await fetch(`/classes/${classCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      alert(error.message || 'Unable to join');
      return;
    }
    const data = await res.json();
    state.joinToken = data.joinToken;
    persistJoinToken(state.joinToken);
    setView('lobbyView');
    connectSocket();
    elements.waitingMessage.textContent = 'Waiting for the host to let you in…';
  });

  elements.startButton?.addEventListener('click', async () => {
    const res = await fetch(`/classes/${classCode}/start`, { method: 'PATCH' });
    if (!res.ok) {
      alert('Unable to start class');
      return;
    }
    state.classInfo.status = 'live';
    setView('liveView');
    beginCall();
  });

  elements.endButton?.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'End class?',
      message: 'This will end the class for everyone immediately.',
      confirmText: 'End for all'
    });
    if (!confirmed) return;
    await fetch(`/classes/${classCode}/end`, { method: 'PATCH' });
    leaveSession();
    setView('endedView');
    clearJoinToken();
    state.joinToken = null;
    state.skipRejoinFlag = true;
    closeMoreMenu();
  });

  elements.leaveBtn?.addEventListener('click', async () => {
    const confirmed = await confirmAction({
      title: 'Leave meeting?',
      message: 'You can rejoin later while the class is live.',
      confirmText: 'Leave class'
    });
    if (!confirmed) return;
    leaveSession();
    if (!state.isHost && state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
    clearJoinToken();
    state.joinToken = null;
    state.admitted = false;
    state.skipRejoinFlag = true;
    clearRejoinNeeded();
    hideRejoinScreen();
    resetRejoinButtons();
    setView('joinView');
    closeMoreMenu();
  });

  elements.copyLink?.addEventListener('click', async (e) => {
    const link = e.currentTarget.dataset.link || window.location.href;
    await navigator.clipboard.writeText(link);
    const originalLabel = e.currentTarget.getAttribute('aria-label') || 'Copy invite link';
    const originalTooltip = e.currentTarget.dataset.tooltip || 'Copy invite link';
    e.currentTarget.dataset.tooltip = 'Copied!';
    e.currentTarget.setAttribute('aria-label', 'Invite link copied');
    e.currentTarget.classList.add('copied');
    setTimeout(() => {
      e.currentTarget.dataset.tooltip = originalTooltip;
      e.currentTarget.setAttribute('aria-label', originalLabel);
      e.currentTarget.classList.remove('copied');
    }, 1600);
    showLiveToast('Invite link copied');
  });

  elements.copyCode?.addEventListener('click', async (e) => {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    e.currentTarget.textContent = 'Copied!';
    setTimeout(() => (e.currentTarget.textContent = 'Copy code'), 1500);
    showLiveToast('Class code copied');
  });

  elements.shareInfo?.addEventListener('click', async (e) => {
    const link = elements.copyLink?.dataset.link || e.currentTarget.dataset.link || window.location.href;
    await navigator.clipboard.writeText(link);
    const originalLabel = e.currentTarget.getAttribute('aria-label') || 'Copy invite link';
    const originalTooltip = e.currentTarget.dataset.tooltip || 'Copy invite link';
    e.currentTarget.dataset.tooltip = 'Copied!';
    e.currentTarget.setAttribute('aria-label', 'Invite link copied');
    e.currentTarget.classList.add('copied');
    setTimeout(() => {
      e.currentTarget.dataset.tooltip = originalTooltip;
      e.currentTarget.setAttribute('aria-label', originalLabel);
      e.currentTarget.classList.remove('copied');
    }, 1600);
    showLiveToast('Invite link copied');
  });

  elements.controlPolls?.addEventListener('click', () => {
    openUtilityPanel('polls');
  });

  elements.controlRecording?.addEventListener('click', () => {
    if (!state.isHost) return;
    openUtilityPanel('recording');
  });

  elements.controlWhiteboard?.addEventListener('click', () => {
    openUtilityPanel('whiteboard');
  });

  elements.utilityClose?.addEventListener('click', () => toggleUtilityPanel(false));
  elements.utilityTabs?.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab || 'whiteboard';
      setUtilityTab(target);
    });
  });

  elements.whiteboardColor?.addEventListener('input', (event) => {
    state.whiteboard.color = event.target.value;
    if (state.whiteboard.currentStroke) {
      state.whiteboard.currentStroke.color = state.whiteboard.color;
    }
  });
  elements.whiteboardSize?.addEventListener('input', (event) => {
    const value = Number(event.target.value) || 4;
    state.whiteboard.size = value;
    if (state.whiteboard.currentStroke) {
      state.whiteboard.currentStroke.size = value;
    }
  });

  elements.whiteboardClear?.addEventListener('click', () => {
    if (!state.isHost) return;
    state.whiteboard.strokes = [];
    renderWhiteboard();
    if (state.socket) {
      state.socket.emit('whiteboard:clear');
    }
  });

  if (elements.whiteboardCanvas) {
    elements.whiteboardCanvas.addEventListener('pointerdown', startStroke);
    elements.whiteboardCanvas.addEventListener('pointermove', extendStroke);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((eventName) => {
      elements.whiteboardCanvas.addEventListener(eventName, finishStroke);
    });
    document.addEventListener('pointerup', finishStroke);
  }

  elements.pollCreateForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.isHost) return;
    const question = elements.pollQuestion.value.trim();
    const options = elements.pollOptions.value
      .split('\n')
      .map((opt) => opt.trim())
      .filter(Boolean);
    if (!question || options.length < 2) {
      alert('Provide a question and at least two options');
      return;
    }
    const res = await fetch(`/classes/${classCode}/polls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, options })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      alert(error.message || 'Unable to create poll');
      return;
    }
    elements.pollQuestion.value = '';
    elements.pollOptions.value = '';
  });

  elements.pollClose?.addEventListener('click', async () => {
    if (!state.isHost) return;
    await fetch(`/classes/${classCode}/polls/close`, { method: 'POST' });
  });

  elements.qnaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = elements.qnaInput.value.trim();
    if (!question) return;
    const res = await fetch(`/classes/${classCode}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, joinToken: state.joinToken })
    });
    if (res.ok) {
      elements.qnaInput.value = '';
    }
  });

  elements.recordingStart?.addEventListener('click', async () => {
    if (!state.isHost) return;
    const res = await fetch(`/classes/${classCode}/recording/start`, { method: 'POST' });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      alert(error.message || 'Unable to start recording');
      return;
    }
    const data = await res.json();
    state.recording = data;
    state.classInfo.recording = data;
    state.classInfo.recordedVideoLink = null;
    updateRecordingStatus();
  });

  elements.recordingStop?.addEventListener('click', async () => {
    if (!state.isHost) return;
    const res = await fetch(`/classes/${classCode}/recording/stop`, { method: 'POST' });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      alert(error.message || 'Unable to stop recording');
      return;
    }
    const data = await res.json();
    state.recording = data.recording;
    state.classInfo.recording = data.recording;
    if (data.recordedVideoLink) {
      state.classInfo.recordedVideoLink = data.recordedVideoLink;
    }
    updateRecordingStatus();
  });

  elements.handRaiseBtn?.addEventListener('click', toggleHandRaise);
  elements.rejoinBtn?.addEventListener('click', attemptRejoin);
  elements.rejoinScreenBtn?.addEventListener('click', attemptRejoin);

  elements.controlMore?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMoreMenu();
  });

  elements.controlMoreMenu?.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    window.setTimeout(() => closeMoreMenu(), 80);
  });

  document.addEventListener('click', hideMoreMenuOnEvent);

  elements.modalLayer?.addEventListener('click', (event) => {
    if (event.target === elements.modalLayer && typeof state.modalResolver === 'function') {
      state.modalResolver(false);
    }
  });

  window.addEventListener('resize', () => {
    if (state.moreMenuOpen) {
      closeMoreMenu();
    }
  });

  elements.chatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = elements.chatInput.value.trim();
    if (!text) return;
    const body = { message: text, joinToken: state.joinToken };
    const res = await fetch(`/chat/${classCode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      elements.chatInput.value = '';
      chatManager?.reset();
    }
  });

  const setToggleState = (button, activeLabel, inactiveLabel, isActive) => {
    if (!button) return;
    button.classList.toggle('is-off', !isActive);
    const labelNode = button.querySelector('.label, .text');
    if (labelNode) {
      labelNode.textContent = isActive ? activeLabel : inactiveLabel;
    }
    if (typeof isActive === 'boolean') {
      button.setAttribute('aria-pressed', isActive.toString());
    }
    if (button.dataset) {
      button.dataset.tooltip = isActive ? activeLabel : inactiveLabel;
    }
    button.setAttribute('aria-label', isActive ? activeLabel : inactiveLabel);
  };

  const setButtonLabel = (button, text) => {
    if (!button) return;
    const labelNode = button.querySelector('.label, .text');
    if (labelNode) {
      labelNode.textContent = text;
    }
    if (button.dataset) {
      button.dataset.tooltip = text;
    }
    button.setAttribute('aria-label', text);
  };

  const handleMoreMenuKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMoreMenu();
    }
  };

  const closeMoreMenu = () => {
    if (!elements.controlMoreMenu || !state.moreMenuOpen) return;
    const menu = elements.controlMoreMenu;
    state.moreMenuOpen = false;
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    elements.controlMore?.setAttribute('aria-expanded', 'false');
    menu.removeEventListener('keydown', handleMoreMenuKeydown);
    if (typeof state.moreMenuFocusCleanup === 'function') {
      state.moreMenuFocusCleanup();
      state.moreMenuFocusCleanup = null;
    }
    const finalize = () => menu.classList.add('hidden');
    menu.addEventListener('transitionend', finalize, { once: true });
    window.setTimeout(finalize, 220);
  };

  const openMoreMenu = () => {
    if (!elements.controlMoreMenu || state.moreMenuOpen) return;
    const menu = elements.controlMoreMenu;
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    state.moreMenuOpen = true;
    elements.controlMore?.setAttribute('aria-expanded', 'true');
    menu.addEventListener('keydown', handleMoreMenuKeydown);
    requestAnimationFrame(() => {
      if (!state.moreMenuOpen) return;
      menu.classList.add('open');
      if (typeof state.moreMenuFocusCleanup === 'function') {
        state.moreMenuFocusCleanup();
      }
      state.moreMenuFocusCleanup = setupFocusTrap(menu, {
        returnFocus: elements.controlMore
      });
    });
  };

  const toggleMoreMenu = (force) => {
    const shouldOpen = typeof force === 'boolean' ? force : !state.moreMenuOpen;
    if (shouldOpen) {
      openMoreMenu();
    } else {
      closeMoreMenu();
    }
  };

  function hideMoreMenuOnEvent(event) {
    if (!state.moreMenuOpen) return;
    if (elements.controlMoreMenu.contains(event.target) || elements.controlMore?.contains(event.target)) {
      return;
    }
    closeMoreMenu();
  }

  const showLiveToast = (message, options = {}) => {
    if (!elements.liveToast || !message) return;
    const { actionLabel, onAction, duration = 2600 } = options;
    if (state.toastActionButton) {
      state.toastActionButton.removeEventListener('click', state.toastActionHandler);
      state.toastActionButton = null;
      state.toastActionHandler = null;
    }
    if (actionLabel && typeof onAction === 'function') {
      elements.liveToast.innerHTML = `<span class="toast-text">${message}</span><button type="button" class="toast-action">${actionLabel}</button>`;
      const actionBtn = elements.liveToast.querySelector('.toast-action');
      if (actionBtn) {
        const handler = (event) => {
          event.stopPropagation();
          onAction();
        };
        actionBtn.addEventListener('click', handler, { once: true });
        state.toastActionButton = actionBtn;
        state.toastActionHandler = handler;
      }
    } else {
      elements.liveToast.textContent = message;
    }
    elements.liveToast.classList.add('show');
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
    }
    if (duration > 0) {
      state.toastTimer = window.setTimeout(() => {
        elements.liveToast.classList.remove('show');
        state.toastTimer = null;
      }, duration);
    } else {
      state.toastTimer = null;
    }
  };

  const hideLiveToast = () => {
    if (!elements.liveToast) return;
    elements.liveToast.classList.remove('show');
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    if (state.toastActionButton && state.toastActionHandler) {
      state.toastActionButton.removeEventListener('click', state.toastActionHandler);
    }
    state.toastActionButton = null;
    state.toastActionHandler = null;
  };

  const showModal = async ({
    title = 'Confirm',
    message = '',
    confirmText = 'Continue',
    cancelText = 'Cancel'
  } = {}) => {
    if (!elements.modalLayer || !elements.modalPrimary || !elements.modalSecondary) {
      return true;
    }
    closeMoreMenu();
    hideLiveToast();
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise((resolve) => {
      const cleanup = (result) => {
        if (typeof state.modalFocusCleanup === 'function') {
          state.modalFocusCleanup();
          state.modalFocusCleanup = null;
        } else if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          window.requestAnimationFrame(() => {
            try {
              previouslyFocused.focus();
            } catch (error) {
              /* ignore focus errors */
            }
          });
        }
        state.modalResolver = null;
        elements.modalPrimary.removeEventListener('click', confirmHandler);
        elements.modalSecondary.removeEventListener('click', cancelHandler);
        document.removeEventListener('keydown', keyHandler);
        elements.modalLayer.classList.remove('open');
        const hide = () => {
          elements.modalLayer.setAttribute('aria-hidden', 'true');
          elements.modalLayer.classList.add('hidden');
        };
        elements.modalLayer.addEventListener('transitionend', hide, { once: true });
        window.setTimeout(hide, 220);
        resolve(result);
      };

      const confirmHandler = () => {
        cleanup(true);
      };

      const cancelHandler = () => {
        cleanup(false);
      };

      const keyHandler = (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          cancelHandler();
        }
      };

      state.modalResolver = cleanup;
      elements.modalTitle.textContent = title;
      elements.modalMessage.textContent = message;
      elements.modalPrimary.textContent = confirmText;
      if (cancelText) {
        elements.modalSecondary.textContent = cancelText;
        elements.modalSecondary.classList.remove('hidden');
      } else {
        elements.modalSecondary.classList.add('hidden');
      }

      elements.modalPrimary.addEventListener('click', confirmHandler);
      if (cancelText) {
        elements.modalSecondary.addEventListener('click', cancelHandler);
      }
      document.addEventListener('keydown', keyHandler);

      elements.modalLayer.classList.remove('hidden');
      elements.modalLayer.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        elements.modalLayer.classList.add('open');
        if (typeof state.modalFocusCleanup === 'function') {
          state.modalFocusCleanup();
        }
        state.modalFocusCleanup = setupFocusTrap(elements.modalLayer, {
          initialFocus: elements.modalPrimary,
          returnFocus: previouslyFocused
        });
      });
    });
  };

  const confirmAction = async (options) => {
    const result = await showModal(options);
    return !!result;
  };

  const buildRejoinCopy = (copy = {}) => ({
    heading: state.isHost ? 'Resume teaching' : 'Reconnect to your class',
    message: state.isHost
      ? 'You left the class. Rejoin to keep the session live.'
      : 'You left the class. Rejoin to continue learning.',
    ...copy
  });

  const showRejoinScreen = (copy = {}) => {
    const { heading, message } = buildRejoinCopy(copy);
    if (elements.rejoinHeading) {
      elements.rejoinHeading.textContent = heading;
    }
    if (elements.rejoinMessage) {
      elements.rejoinMessage.textContent = message;
    }
    if (elements.rejoinScreenBtn) {
      elements.rejoinScreenBtn.disabled = !!state.rejoining;
      setButtonLabel(elements.rejoinScreenBtn, state.rejoining ? 'Rejoining…' : 'Rejoin');
    }
    state.rejoinScreenActive = true;
    hideRejoinPrompt();
    setView('rejoinView');
  };

  const resetRejoinButtons = () => {
    if (elements.rejoinBtn) {
      elements.rejoinBtn.disabled = false;
      setButtonLabel(elements.rejoinBtn, 'Rejoin');
    }
    if (elements.rejoinScreenBtn) {
      elements.rejoinScreenBtn.disabled = false;
      setButtonLabel(elements.rejoinScreenBtn, 'Rejoin');
    }
  };

  const hideRejoinScreen = () => {
    state.rejoinScreenActive = false;
    resetRejoinButtons();
  };

  const showRejoinPrompt = () => {
    if (!elements.rejoinBtn || state.isHost) return;
    elements.rejoinBtn.classList.remove('hidden');
    elements.rejoinBtn.disabled = false;
    setButtonLabel(elements.rejoinBtn, 'Rejoin');
  };

  const hideRejoinPrompt = () => {
    if (!elements.rejoinBtn) return;
    elements.rejoinBtn.classList.add('hidden');
  };

  const clearReconnectTimer = () => {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  };

  const scheduleReconnect = (force = false) => {
    if (state.reconnectTimer) return;
    if (!force && state.isHost) return;
    connectionWatchdog?.showReconnecting('Reconnecting…');
    connectionWatchdog?.armFailure(() => attemptRejoin());
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null;
      attemptRejoin();
    }, force ? 1200 : 1800);
  };

  const updateViewerMediaControls = () => {
    if (state.isHost) return;
    const audioAllowed = !!state.canUseMedia?.audio;
    const videoAllowed = !!state.canUseMedia?.video;
    const audioEnabled = isTrackEnabled('audio');
    const videoEnabled = isTrackEnabled('video');

    if (elements.viewerMicToggle) {
      elements.viewerMicToggle.disabled = !audioAllowed;
      setToggleState(elements.viewerMicToggle, 'Mic on', 'Mic off', audioEnabled);
      elements.viewerMicToggle.setAttribute(
        'aria-label',
        audioAllowed
          ? audioEnabled
            ? 'Turn microphone off'
            : 'Turn microphone on'
          : 'Microphone disabled by host'
      );
    }

    if (elements.viewerCameraToggle) {
      elements.viewerCameraToggle.disabled = !videoAllowed;
      setToggleState(elements.viewerCameraToggle, 'Camera on', 'Camera off', videoEnabled);
      elements.viewerCameraToggle.setAttribute(
        'aria-label',
        videoAllowed
          ? videoEnabled
            ? 'Turn camera off'
            : 'Turn camera on'
          : 'Camera disabled by host'
      );
    }
  };

  const isTrackEnabled = (kind) =>
    !!state.localStream?.getTracks().some((track) => track.kind === kind && track.enabled);

  const syncTrackButtons = () => {
    const audioEnabled = isTrackEnabled('audio');
    const videoEnabled = isTrackEnabled('video');
    setToggleState(elements.muteBtn, 'Mic on', 'Mic off', audioEnabled);
    setToggleState(elements.liveMicToggle, 'Mic on', 'Mic off', audioEnabled);
    setToggleState(elements.cameraBtn, 'Camera on', 'Camera off', videoEnabled);
    setToggleState(elements.liveCameraToggle, 'Camera on', 'Camera off', videoEnabled);
    updateViewerMediaControls();
  };

  const emitMediaUpdate = () => {
    if (!state.socket || !state.localStream) return;
    const audioEnabled = isTrackEnabled('audio');
    const videoEnabled = isTrackEnabled('video');
    state.socket.emit('media:update', { audio: audioEnabled, video: videoEnabled });
  };

  const setMediaTrackState = (kind, enabled, options = {}) => {
    if (!state.localStream || typeof enabled !== 'boolean') return false;
    let changed = false;
    state.localStream.getTracks().forEach((track) => {
      if (track.kind === kind && track.enabled !== enabled) {
        track.enabled = enabled;
        changed = true;
      }
    });
    state.peers.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === kind && sender.track.enabled !== enabled) {
          sender.track.enabled = enabled;
          changed = true;
        }
      });
    });
    if (kind === 'video' && !options.skipStage) {
      refreshStage();
    }
    if (!options.skipButtons) {
      syncTrackButtons();
    }
    if (!options.skipEmit && changed) {
      emitMediaUpdate();
    }
    if (kind === 'audio' && !options.suppressBanner) {
      const videoActive = isTrackEnabled('video');
      if (enabled && !videoActive) {
        showSpeakerBanner(state.joinToken);
      } else if ((!enabled || videoActive) && state.activeSpeaker === state.joinToken) {
        hideSpeakerBanner();
      }
    }
    if (kind === 'video' && !options.suppressBanner) {
      const audioActive = isTrackEnabled('audio');
      if (!enabled && audioActive) {
        showSpeakerBanner(state.joinToken);
      }
      if (enabled && state.activeSpeaker === state.joinToken) {
        hideSpeakerBanner();
      }
    }
    if (!state.isHost && !options.skipButtons) {
      updateViewerMediaControls();
    }
    return changed;
  };

  const initializeComponents = () => {
    if (!toneManager) {
      toneManager = new ToneManager({ toggleEl: elements.toneToggle, storage });
    }
    if (!participantManager) {
      participantManager = new ParticipantManager({
        participantsBadgeEl: elements.participantsBadge,
        lobbyBadgeEl: elements.lobbyBadge,
        buttonEl: elements.participantsToggle
      });
    }
    if (!chatManager) {
      chatManager = new ChatManager({ badgeEl: elements.chatBadge });
    }
    chatManager?.attachToneManager(toneManager);
    if (!permissionManager) {
      permissionManager = new PermissionManager({
        state,
        elements,
        onStreamReady: (stream, options = {}) => applyLocalStream(stream, options)
      });
    }
    const canUseMedia = (kind) => {
      if (state.isHost) return true;
      const key = kind === 'video' ? 'video' : 'audio';
      return !!state.canUseMedia?.[key];
    };
    if (!micControl) {
      micControl = new MediaControl({
        kind: 'audio',
        state,
        permissionManager,
        setState: (value) => setMediaTrackState('audio', value),
        isEnabled: () => isTrackEnabled('audio'),
        canUse: () => canUseMedia('audio'),
        afterToggle: () => {
          if (!state.isHost) {
            updateViewerMediaControls();
          }
        }
      });
    }
    if (!cameraControl) {
      cameraControl = new MediaControl({
        kind: 'video',
        state,
        permissionManager,
        setState: (value) => setMediaTrackState('video', value),
        isEnabled: () => isTrackEnabled('video'),
        canUse: () => canUseMedia('video'),
        afterToggle: () => {
          if (!state.isHost) {
            updateViewerMediaControls();
          }
        }
      });
    }
    if (!screenShareControl) {
      screenShareControl = new ScreenShareControl({
        buttonEl: elements.screenShareBtn,
        onStart: startScreenShare,
        onStop: stopScreenShare,
        toneManager
      });
    }
    if (!connectionWatchdog) {
      connectionWatchdog = new ConnectionWatchdog({
        state,
        showToast: (message, opts = {}) => showLiveToast(message, opts),
        hideToast: () => hideLiveToast()
      });
    }
  };

  const muteLocalTracks = () => {
    if (!state.localStream) return;
    const audioChanged = setMediaTrackState('audio', false, {
      skipEmit: true,
      suppressBanner: true,
      skipButtons: true
    });
    const videoChanged = setMediaTrackState('video', false, {
      skipEmit: true,
      skipButtons: true
    });
    if (state.activeSpeaker === state.joinToken) {
      hideSpeakerBanner();
    }
    if (audioChanged || videoChanged) {
      syncTrackButtons();
      emitMediaUpdate();
    }
  };

  const applyHostMediaState = async (media) => {
    if (!media) return;
    if (!state.localStream) {
      if (permissionManager) {
        await permissionManager.ensureInteractivePermissions({
          audio: media.audio === true,
          video: media.video === true
        });
      }
      return;
    }
    let shouldEmit = false;
    if (typeof media.audio === 'boolean') {
      shouldEmit = setMediaTrackState('audio', media.audio, {
        suppressBanner: true,
        skipEmit: true
      }) || shouldEmit;
    }
    if (typeof media.video === 'boolean') {
      shouldEmit = setMediaTrackState('video', media.video, {
        skipEmit: true
      }) || shouldEmit;
    }
    const audioEnabled = isTrackEnabled('audio');
    const videoEnabled = isTrackEnabled('video');
    if (audioEnabled && !videoEnabled) {
      showSpeakerBanner(state.joinToken);
    }
    if ((!audioEnabled || videoEnabled) && state.activeSpeaker === state.joinToken) {
      hideSpeakerBanner();
    }
    if (shouldEmit) {
      emitMediaUpdate();
    }
  };

  const toggleTrack = (kind) => {
    if (!state.localStream) return;
    const nextState = !isTrackEnabled(kind);
    setMediaTrackState(kind, nextState);
  };

  const startScreenShare = async () => {
    if (!state.isHost) return false;
    if (state.screenStream) return true;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: { echoCancellation: false, noiseSuppression: false }
      });
      state.screenShareContext = {
        micEnabled: isTrackEnabled('audio')
      };
      state.screenStream = displayStream;
      refreshStage();
      state.screenSenders = [];
      const tracks = displayStream.getTracks();
      state.peers.forEach((pc, token) => {
        tracks.forEach((track) => {
          const sender = pc.addTrack(track, displayStream);
          state.screenSenders.push({ pc, sender, token, track });
        });
        renegotiate(pc, token);
      });
      if (elements.screenShareBtn) {
        setButtonLabel(elements.screenShareBtn, 'Stop sharing');
        elements.screenShareBtn.setAttribute('aria-label', 'Stop screen share');
      }
      tracks.forEach((track) => {
        track.addEventListener('ended', () => {
          screenShareControl?.stop();
        });
      });
      return true;
    } catch (error) {
      console.error('Screen share error', error);
      showLiveToast('Unable to start screen share');
      return false;
    }
  };

  const stopScreenShare = () => {
    if (!state.screenStream) return;
    state.screenSenders.forEach(({ pc, sender, token }) => {
      try {
        pc.removeTrack(sender);
        renegotiate(pc, token);
      } catch (error) {
        console.error('Screen share cleanup error', error);
      }
    });
    state.screenSenders = [];
    stopStream(state.screenStream);
    state.screenStream = null;
    refreshStage();
    const context = state.screenShareContext;
    state.screenShareContext = null;
    if (context && typeof context.micEnabled === 'boolean') {
      setMediaTrackState('audio', context.micEnabled, { suppressBanner: true });
    }
    if (elements.screenShareBtn) {
      setButtonLabel(elements.screenShareBtn, 'Share screen');
      elements.screenShareBtn.setAttribute('aria-label', 'Start screen share');
    }
    screenShareControl?.setActive(false);
    if (state.activeSpeaker === 'host') {
      hideSpeakerBanner();
    }
  };

  const setStageZoom = (value) => {
    const min = 0.8;
    const max = 1.8;
    state.stageZoom = Math.min(Math.max(value, min), max);
    document.documentElement.style.setProperty('--stage-zoom', state.stageZoom.toFixed(2));
    if (elements.stageZoomOut) {
      elements.stageZoomOut.disabled = state.stageZoom <= min;
    }
    if (elements.stageZoomIn) {
      elements.stageZoomIn.disabled = state.stageZoom >= max;
    }
  };

  const bindTrackToggles = () => {
    micControl?.bind(elements.muteBtn);
    micControl?.bind(elements.liveMicToggle);
    cameraControl?.bind(elements.cameraBtn);
    cameraControl?.bind(elements.liveCameraToggle);
  };

  const bindViewerControls = () => {
    micControl?.bind(elements.viewerMicToggle, { viewer: true });
    cameraControl?.bind(elements.viewerCameraToggle, { viewer: true });
  };

  elements.stageZoomIn?.addEventListener('click', () => {
    setStageZoom(state.stageZoom + 0.1);
  });

  elements.stageZoomOut?.addEventListener('click', () => {
    setStageZoom(state.stageZoom - 0.1);
  });

  elements.chatToggle?.addEventListener('click', () => toggleDrawer('chat'));
  elements.participantsToggle?.addEventListener('click', () => toggleDrawer('participants'));
  elements.chatClose?.addEventListener('click', () => closeDrawer());
  elements.participantsClose?.addEventListener('click', () => closeDrawer());
  elements.drawerBackdrop?.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.moreMenuOpen) {
        closeMoreMenu();
      } else if (typeof state.modalResolver === 'function') {
        state.modalResolver(false);
      } else {
        closeDrawer();
      }
      hideLiveToast();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (!state.skipRejoinFlag && state.classInfo?.status === 'live' && (state.isHost || state.admitted)) {
      markRejoinNeeded();
    } else {
      clearRejoinNeeded();
    }
  });

  const init = async () => {
    hideRejoinPrompt();
    initializeComponents();
    await loadClass();
    await loadUser();
    state.isHost = state.user && state.classInfo.host && state.user.id === state.classInfo.host.id;
    permissionManager?.configureRole(state.isHost);
    participantManager?.setIsHost(state.isHost);
    chatManager?.attachToneManager(toneManager);
    syncDrawerState();
    setStageZoom(1);
    document.body.classList.toggle('is-host', !!state.isHost);
    document.body.classList.toggle('is-student', !state.isHost);
    if (!state.isHost && elements.participantStrip) {
      elements.participantStrip.classList.add('hidden');
    } else if (state.isHost && elements.participantStrip) {
      elements.participantStrip.classList.remove('hidden');
    }
    if (!state.isHost) {
      elements.muteBtn?.classList.add('hidden');
      elements.cameraBtn?.classList.add('hidden');
      elements.previewControls?.classList.add('viewer-only');
      elements.previewWrapper?.classList.add('viewer-mode');
      if (elements.joinButton) {
        elements.joinButton.textContent = 'Ask to join';
      }
      if (elements.nameInput && state.savedDisplayName) {
        elements.nameInput.value = state.savedDisplayName;
      }
    }
    await setupPreview();
    bindTrackToggles();
    bindViewerControls();
    state.lobby = state.classInfo.lobby || [];
    participantManager?.updateLobby(state.lobby);
    updateHandRaiseButton();
    if (elements.endButton) {
      elements.endButton.classList.toggle('hidden', !state.isHost);
    }
    if (elements.screenShareBtn) {
      elements.screenShareBtn.classList.toggle('hidden', !state.isHost);
    }
    if (elements.hostControls) {
      elements.hostControls.classList.toggle('hidden', !state.isHost);
    }
    const needsRejoin = shouldPromptRejoin() && state.classInfo.status === 'live';
    if (needsRejoin) {
      const copy = state.isHost
        ? {
            heading: 'Resume teaching',
            message: 'You were disconnected. Rejoin to keep the class running.'
          }
        : {
            heading: 'Reconnect to your class',
            message: 'You were disconnected. Rejoin to continue learning.'
          };
      showRejoinScreen(copy);
      if (state.isHost) {
        scheduleReconnect(true);
      } else if (state.joinToken) {
        scheduleReconnect();
      }
    } else if (state.isHost) {
      elements.nameInput.value = state.user.name;
      setView(state.classInfo.status === 'live' ? 'liveView' : 'hostLobbyView');
      connectSocket();
      renderLobby();
      refreshLobby();
      if (state.classInfo.status === 'live') {
        beginCall();
      }
    } else {
      if (state.joinToken) {
        setView('lobbyView');
        connectSocket();
      } else {
        await autoJoinWithSavedName();
      }
    }

    loadChatHistory();
    updateViewerMediaControls();
  };

  init();
})();
