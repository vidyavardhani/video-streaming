(() => {
  const root = document.getElementById('class-app');
  if (!root) return;

  const classCode = root.dataset.classCode;
  const roleHintFromDataset = (root.dataset.role || '').trim().toLowerCase();
  const hostTokenFromDataset = (root.dataset.hostToken || '').trim();
  const prefillNameFromDataset = root.dataset.prefillName || '';
  const tokenKey = 'vs_token';
  const joinKey = `vs_join_${classCode}`;
  const displayNameKey = `vs_name_${classCode}`;
  const hostTokenKey = `vs_host_${classCode}`;

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

  const getStoredHostToken = () => storageGet(storage.local, hostTokenKey) || '';
  const persistHostToken = (token) => {
    if (!token) return;
    storageSet(storage.local, hostTokenKey, token);
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

  const isMobileDevice = () =>
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || ''
    );

  const state = {
    socket: null,
    classInfo: null,
    user: null,
    joinToken: getStoredJoinToken(),
    savedDisplayName: getStoredDisplayName(),
    hostToken: '',
    prefillName: prefillNameFromDataset,
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
    recording: { isRecording: false, isPaused: false },
    recordingUploadPending: false,
    vvdOverlay: { text: '', visible: false, position: 'bottom-right' },
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
    modalFocusCleanup: null,
    preferredCamera: { deviceId: null, facingMode: null },
    availableCameras: [],
    cameraMenuContext: null,
    cameraMenuDismiss: null,
    cameraMenuKeyHandler: null,
    cameraMenuResizeAttached: false,
    controlCenterOpen: false,
    directChats: new Map(),
    activeDirectChat: null,
    layout: 'landscape',
    controlsVisible: true,
    controlsTimer: null,
    controlsHideDelay: 1200,
    roleHint: roleHintFromDataset
  };

  state.mediaStates.set('host', { audio: false, video: false });

  const initialHostToken = hostTokenFromDataset || getStoredHostToken();
  if (hostTokenFromDataset) {
    persistHostToken(hostTokenFromDataset);
  }
  if (initialHostToken) {
    state.hostToken = initialHostToken;
  }

  const teacherRoleHints = new Set(['teacher', 'faculty', 'host', 'admin', 'instructor']);

  const resolveRoleHint = () => {
    const explicitRole = (state.roleHint || '').trim().toLowerCase();
    if (explicitRole) return explicitRole;
    const userRole = (state.user?.role || '').trim().toLowerCase();
    if (userRole) return userRole;
    return '';
  };

  const determineDashboardTarget = (normalizedRole) => {
    if (!normalizedRole) return 'HomeScreen';
    if (normalizedRole === 'student' || normalizedRole === 'learner') {
      return 'StudentDashboard';
    }
    if (teacherRoleHints.has(normalizedRole)) {
      return 'HomeScreen';
    }
    if (normalizedRole.includes('student')) {
      return 'StudentDashboard';
    }
    return 'HomeScreen';
  };

  const applyHostAuth = (options = {}) => {
    if (!state.hostToken) {
      return { ...(options || {}) };
    }
    const baseOptions = options || {};
    const merged = { ...baseOptions };
    merged.headers = {
      ...(baseOptions.headers || {}),
      'X-Class-Host-Token': state.hostToken
    };
    return merged;
  };

  const tonePlayer = (() => {
    let context = null;
    const ensureContext = async () => {
      if (typeof window === 'undefined') return null;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      if (!context) {
        context = new AudioContext();
      }
      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch (error) {
          /* ignore */
        }
      }
      return context;
    };

    const play = async (frequency = 880, duration = 0.3) => {
      try {
        const ctx = await ensureContext();
        if (!ctx) return;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.05);
      } catch (error) {
        /* ignore tone playback issues */
      }
    };

    const warmup = () => {
      ensureContext();
    };

    return {
      play,
      warmup
    };
  })();

  window.addEventListener('pointerdown', () => tonePlayer.warmup(), { once: true, passive: true });

  const createRecordingManager = () => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      return {
        isSupported: () => false,
        isRecording: () => false,
        isPaused: () => false,
        start: async () => {
          throw new Error('MediaRecorder is not supported in this browser');
        },
        stop: async () => null,
        pause: async () => {},
        resume: async () => {},
        ensurePaused: async () => {},
        ensureResumed: async () => {},
        ensureStopped: async () => {}
      };
    }

    let recorder = null;
    let combinedStream = null;
    let audioContext = null;
    let audioDestination = null;
    let audioSources = [];
    let cleanupFns = [];
    let chunks = [];
    let stopPromise = null;
    let stopResolver = null;
    let stopRejecter = null;
    let discardResult = false;
    let startedAt = null;

    const resetState = () => {
      recorder = null;
      combinedStream = null;
      stopPromise = null;
      stopResolver = null;
      stopRejecter = null;
      chunks = [];
      discardResult = false;
      startedAt = null;
    };

    const cleanup = () => {
      cleanupFns.forEach((fn) => {
        try {
          fn?.();
        } catch (error) {
          /* ignore cleanup errors */
        }
      });
      cleanupFns = [];
      if (combinedStream) {
        combinedStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (error) {
            /* ignore */
          }
        });
      }
      combinedStream = null;
      audioSources.forEach(({ source, stream, stopOnCleanup }) => {
        try {
          source.disconnect();
        } catch (error) {
          /* ignore */
        }
        if (stopOnCleanup) {
          stream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch (error) {
              /* ignore */
            }
          });
        }
      });
      audioSources = [];
      if (audioDestination) {
        try {
          audioDestination.disconnect();
        } catch (error) {
          /* ignore */
        }
      }
      audioDestination = null;
      if (audioContext) {
        try {
          audioContext.close();
        } catch (error) {
          /* ignore */
        }
      }
      audioContext = null;
    };

    const pickMimeType = () => {
      const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      for (const type of candidates) {
        try {
          if (!type || MediaRecorder.isTypeSupported(type)) {
            return type;
          }
        } catch (error) {
          /* ignore */
        }
      }
      return '';
    };

    const cloneTrack = (track) => {
      if (!track) {
        return { track: null, stopOnCleanup: false };
      }
      if (typeof track.clone === 'function') {
        try {
          const cloned = track.clone();
          return { track: cloned, stopOnCleanup: true };
        } catch (error) {
          /* ignore clone failure */
        }
      }
      return { track, stopOnCleanup: false };
    };

    const drawVideoIntoRect = (video, ctx, x, y, width, height) => {
      const videoWidth = video?.videoWidth || 0;
      const videoHeight = video?.videoHeight || 0;
      if (!videoWidth || !videoHeight) return;
      const videoRatio = videoWidth / videoHeight;
      const rectRatio = width / height;
      let drawWidth = width;
      let drawHeight = height;
      if (videoRatio > rectRatio) {
        drawHeight = height;
        drawWidth = height * videoRatio;
      } else {
        drawWidth = width;
        drawHeight = width / videoRatio;
      }
      const offsetX = x + (width - drawWidth) / 2;
      const offsetY = y + (height - drawHeight) / 2;
      try {
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
      } catch (error) {
        /* ignore draw errors */
      }
    };

    const drawVideoToCanvas = (video, ctx, width, height) => {
      drawVideoIntoRect(video, ctx, 0, 0, width, height);
    };

    const createStageCanvasCapture = () => {
      if (!elements.primaryVideo || typeof document === 'undefined') {
        return null;
      }
      const canvas = document.createElement('canvas');
      if (!canvas || typeof canvas.getContext !== 'function') {
        return null;
      }
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof canvas.captureStream !== 'function') {
        return null;
      }

      let rafId = null;
      const drawFrame = () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (elements.primaryVideo?.readyState >= 2) {
          drawVideoToCanvas(elements.primaryVideo, ctx, canvas.width, canvas.height);
        }
        const pipVisible = elements.pipContainer && !elements.pipContainer.classList.contains('hidden');
        if (pipVisible && elements.pipVideo?.readyState >= 2) {
          const pipWidth = Math.floor(canvas.width * 0.25);
          const pipHeight = Math.floor(pipWidth * (9 / 16));
          const padding = 24;
          const pipX = canvas.width - pipWidth - padding;
          const pipY = canvas.height - pipHeight - padding;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(pipX - 6, pipY - 6, pipWidth + 12, pipHeight + 12);
          drawVideoIntoRect(elements.pipVideo, ctx, pipX, pipY, pipWidth, pipHeight);
        }
        rafId = window.requestAnimationFrame(drawFrame);
      };

      drawFrame();

      const stream = canvas.captureStream(30);
      const [track] = stream.getVideoTracks();
      if (!track) {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
        }
        stream.getTracks().forEach((mediaTrack) => {
          try {
            mediaTrack.stop();
          } catch (error) {
            /* ignore */
          }
        });
        return null;
      }

      const cleanupCapture = () => {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
        }
        stream.getTracks().forEach((mediaTrack) => {
          try {
            mediaTrack.stop();
          } catch (error) {
            /* ignore */
          }
        });
      };

      return { track, cleanup: cleanupCapture };
    };

    const captureElementTrack = (video) => {
      if (!video) return null;
      const capture = video.captureStream || video.mozCaptureStream;
      if (typeof capture !== 'function') return null;
      try {
        const stream = capture.call(video, 30);
        const [track] = stream.getVideoTracks();
        if (!track) return null;
        return {
          track,
          cleanup: () => {
            stream.getTracks().forEach((mediaTrack) => {
              try {
                mediaTrack.stop();
              } catch (error) {
                /* ignore */
              }
            });
          }
        };
      } catch (error) {
        return null;
      }
    };

    const createPlaceholderTrack = () => {
      if (typeof document === 'undefined') {
        return null;
      }
      const canvas = document.createElement('canvas');
      if (!canvas || typeof canvas.getContext !== 'function' || typeof canvas.captureStream !== 'function') {
        return null;
      }
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Recording unavailable', canvas.width / 2, canvas.height / 2);
      const stream = canvas.captureStream(5);
      const [track] = stream.getVideoTracks();
      if (!track) {
        stream.getTracks().forEach((mediaTrack) => {
          try {
            mediaTrack.stop();
          } catch (error) {
            /* ignore */
          }
        });
        return null;
      }
      return {
        track,
        cleanup: () => {
          stream.getTracks().forEach((mediaTrack) => {
            try {
              mediaTrack.stop();
            } catch (error) {
              /* ignore */
            }
          });
        }
      };
    };

    const pickFallbackVideoTrack = () => {
      const candidates = [];
      if (state.screenStream) candidates.push(state.screenStream);
      if (state.localStream) candidates.push(state.localStream);
      if (state.hostMedia?.camera) candidates.push(state.hostMedia.camera);
      if (state.hostMedia?.screen) candidates.push(state.hostMedia.screen);
      remoteStreamCache.forEach((stream) => {
        if (stream) candidates.push(stream);
      });
      for (const stream of candidates) {
        if (!stream || typeof stream.getVideoTracks !== 'function') continue;
        const [track] = stream.getVideoTracks();
        if (!track) continue;
        const { track: cloned, stopOnCleanup } = cloneTrack(track);
        if (!cloned) continue;
        return {
          track: cloned,
          cleanup: () => {
            if (stopOnCleanup) {
              try {
                cloned.stop();
              } catch (error) {
                /* ignore */
              }
            }
          }
        };
      }
      return null;
    };

    const buildVideoTrack = () => {
      const stageCapture = createStageCanvasCapture();
      if (stageCapture && stageCapture.track) {
        return stageCapture;
      }
      const elementCapture = captureElementTrack(elements.primaryVideo);
      if (elementCapture && elementCapture.track) {
        return elementCapture;
      }
      const fallback = pickFallbackVideoTrack();
      if (fallback && fallback.track) {
        return fallback;
      }
      return createPlaceholderTrack();
    };

    const gatherAudioStreams = () => {
      const streams = [];
      if (state.localStream) streams.push(state.localStream);
      if (state.screenStream) streams.push(state.screenStream);
      if (state.hostMedia?.camera) streams.push(state.hostMedia.camera);
      if (state.hostMedia?.screen) streams.push(state.hostMedia.screen);
      remoteStreamCache.forEach((stream) => {
        if (stream) streams.push(stream);
      });
      return streams;
    };

    const createAudioMix = async () => {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (typeof AudioContextCtor !== 'function') {
        return null;
      }
      const trackIds = new Set();
      const sources = [];
      const streams = gatherAudioStreams();
      let context = null;
      let destination = null;

      streams.forEach((stream) => {
        if (!stream || typeof stream.getAudioTracks !== 'function') return;
        const tracks = stream.getAudioTracks();
        tracks.forEach((track) => {
          if (!track || track.readyState === 'ended') return;
          if (trackIds.has(track.id)) return;
          trackIds.add(track.id);
          const { track: cloned, stopOnCleanup } = cloneTrack(track);
          if (!cloned) return;
          const sourceStream = new MediaStream([cloned]);
          if (!context) {
            context = new AudioContextCtor();
            destination = context.createMediaStreamDestination();
          }
          if (!destination) return;
          const sourceNode = context.createMediaStreamSource(sourceStream);
          sourceNode.connect(destination);
          sources.push({ source: sourceNode, stream: sourceStream, stopOnCleanup });
        });
      });

      if (!context || !destination || sources.length === 0) {
        sources.forEach(({ stream, stopOnCleanup }) => {
          stream.getTracks().forEach((track) => {
            if (stopOnCleanup && typeof track.stop === 'function') {
              track.stop();
            }
          });
        });
        if (context) {
          try {
            context.close();
          } catch (error) {
            /* ignore */
          }
        }
        return null;
      }

      try {
        if (context.state === 'suspended') {
          await context.resume().catch(() => {});
        }
      } catch (error) {
        /* ignore resume issues */
      }

      return { context, destination, sources };
    };

    const buildCombinedStream = async () => {
      const stream = new MediaStream();
      const video = buildVideoTrack();
      if (video?.track) {
        stream.addTrack(video.track);
        if (typeof video.cleanup === 'function') {
          cleanupFns.push(video.cleanup);
        }
      }

      const audio = await createAudioMix();
      if (audio?.destination) {
        audioDestination = audio.destination;
        audioContext = audio.context;
        audioSources = audio.sources;
        audio.destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }

      if (!stream.getVideoTracks().length) {
        const placeholder = createPlaceholderTrack();
        if (placeholder?.track) {
          stream.addTrack(placeholder.track);
          if (typeof placeholder.cleanup === 'function') {
            cleanupFns.push(placeholder.cleanup);
          }
        }
      }

      return stream;
    };

    const start = async () => {
      if (recorder && recorder.state !== 'inactive') {
        return;
      }
      const stream = await buildCombinedStream();
      if (!stream) {
        throw new Error('Unable to access media streams for recording');
      }
      combinedStream = stream;
      const mimeType = pickMimeType();
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (error) {
        cleanup();
        resetState();
        throw error;
      }
      chunks = [];
      discardResult = false;
      startedAt = Date.now();

      recorder.ondataavailable = (event) => {
        if (event?.data && event.data.size) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        const error = event?.error || new Error('Recording failed');
        cleanup();
        if (stopRejecter) {
          stopRejecter(error);
        }
        resetState();
      };

      recorder.onstop = () => {
        const recordedChunks = chunks.slice();
        const fallbackType = recorder?.mimeType || recordedChunks[0]?.type || mimeType || 'video/webm';
        const duration = startedAt ? Date.now() - startedAt : null;
        cleanup();
        let payload = null;
        if (!discardResult && recordedChunks.length) {
          try {
            const blob = new Blob(recordedChunks, { type: fallbackType });
            if (blob.size > 0) {
              payload = {
                blob,
                mimeType: blob.type || fallbackType,
                size: blob.size,
                durationMs: duration
              };
            }
          } catch (error) {
            /* ignore blob construction errors */
          }
        }
        if (discardResult) {
          payload = null;
        }
        if (stopResolver) {
          stopResolver(payload);
        }
        resetState();
      };

      try {
        recorder.start(1000);
      } catch (error) {
        cleanup();
        resetState();
        throw error;
      }
    };

    const stop = ({ discard = false } = {}) => {
      if (!recorder || recorder.state === 'inactive') {
        return Promise.resolve(null);
      }
      discardResult = discard;
      if (stopPromise) {
        return stopPromise;
      }
      stopPromise = new Promise((resolve, reject) => {
        stopResolver = resolve;
        stopRejecter = reject;
      });
      try {
        recorder.stop();
      } catch (error) {
        cleanup();
        if (stopRejecter) {
          stopRejecter(error);
        }
        resetState();
        return Promise.reject(error);
      }
      return stopPromise;
    };

    const pause = async () => {
      if (!recorder || recorder.state !== 'recording') return;
      try {
        recorder.pause();
      } catch (error) {
        /* ignore pause failure */
      }
    };

    const resume = async () => {
      if (!recorder || recorder.state !== 'paused') return;
      try {
        recorder.resume();
      } catch (error) {
        /* ignore resume failure */
      }
    };

    const isRecording = () => !!recorder && recorder.state !== 'inactive';
    const isPaused = () => !!recorder && recorder.state === 'paused';

    const ensurePaused = async () => {
      if (isRecording() && !isPaused()) {
        await pause();
      }
    };

    const ensureResumed = async () => {
      if (isPaused()) {
        await resume();
      }
    };

    const ensureStopped = async () => {
      if (isRecording()) {
        await stop({ discard: true }).catch(() => {});
      }
    };

    return {
      isSupported: () => true,
      start,
      stop,
      pause,
      resume,
      isRecording,
      isPaused,
      ensurePaused,
      ensureResumed,
      ensureStopped
    };
  };

  const recordingManager = createRecordingManager();

  const hostTrackRegistry = new WeakSet();
  const remoteTrackGuards = new WeakMap();
  const remotePresence = new Map();
  const remoteLossTimers = new Map();
  const remoteLossCounts = new Map();
  const peerRecovery = new Map();
  const participantQuality = new Map();
  const peerStatsIntervals = new Map();
  const peerStatsSamples = new Map();
  const remoteStreamCache = new Map();

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

  const mergeQuality = (previous, next) => {
    const base = typeof previous === 'object' && previous !== null ? previous : {};
    if (typeof next === 'string') {
      return { ...base, status: next };
    }
    if (typeof next === 'object' && next !== null) {
      return { ...base, ...next };
    }
    return next;
  };

  const updateParticipantQuality = (token, status) => {
    if (!token) return;
    const current = participantQuality.get(token);
    participantQuality.set(token, mergeQuality(current, status));
    if (Array.isArray(state.classInfo?.participants)) {
      controlCenter?.setParticipants(state.classInfo.participants, {
        lobby: state.lobby,
        mediaStates: state.mediaStates,
        raised: state.raisedHands,
        quality: participantQuality
      });
    }
  };

  const stopPeerStatsMonitor = (token) => {
    const timer = peerStatsIntervals.get(token);
    if (timer) {
      clearInterval(timer);
      peerStatsIntervals.delete(token);
    }
    peerStatsSamples.delete(token);
  };

  const collectPeerStats = async (token, pc) => {
    if (!pc || typeof pc.getStats !== 'function') return;
    try {
      const stats = await pc.getStats();
      let inboundAudio = 0;
      let inboundVideo = 0;
      let outboundAudio = 0;
      let outboundVideo = 0;
      let jitterTotal = 0;
      let jitterSamples = 0;

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && !report.isRemote) {
          if (report.kind === 'video') {
            inboundVideo += report.bytesReceived || 0;
          } else if (report.kind === 'audio') {
            inboundAudio += report.bytesReceived || 0;
            if (typeof report.jitter === 'number') {
              jitterTotal += report.jitter;
              jitterSamples += 1;
            }
          }
        } else if (report.type === 'outbound-rtp' && !report.isRemote) {
          if (report.kind === 'video') {
            outboundVideo += report.bytesSent || 0;
          } else if (report.kind === 'audio') {
            outboundAudio += report.bytesSent || 0;
          }
        }
      });

      const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      const previous = peerStatsSamples.get(token);
      const totals = {
        inbound: inboundAudio + inboundVideo,
        outbound: outboundAudio + outboundVideo
      };
      let bitrateDown = null;
      let bitrateUp = null;
      if (previous && now > previous.timestamp) {
        const deltaMs = now - previous.timestamp;
        const inboundDelta = Math.max(0, totals.inbound - previous.inbound);
        const outboundDelta = Math.max(0, totals.outbound - previous.outbound);
        bitrateDown = Math.max(0, Math.round((inboundDelta * 8) / deltaMs));
        bitrateUp = Math.max(0, Math.round((outboundDelta * 8) / deltaMs));
      }
      peerStatsSamples.set(token, { timestamp: now, inbound: totals.inbound, outbound: totals.outbound });

      const jitter = jitterSamples ? Math.round((jitterTotal / jitterSamples) * 1000) : null;
      updateParticipantQuality(token, {
        metrics: {
          bitrate: {
            down: bitrateDown,
            up: bitrateUp
          },
          jitter
        }
      });
    } catch (error) {
      console.warn('Failed to collect peer stats', error);
      stopPeerStatsMonitor(token);
    }
  };

  const startPeerStatsMonitor = (token, pc) => {
    if (!token || !pc) return;
    stopPeerStatsMonitor(token);
    const poll = () => collectPeerStats(token, pc);
    peerStatsIntervals.set(token, window.setInterval(poll, 4000));
    poll();
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

  const disconnectForUnrecoverableMedia = () => {
    if (state.isHost) {
      return;
    }
    clearPeerRecovery('host');
    hostMediaSync?.refreshExpectation?.();
    clearReconnectTimer();
    state.rejoining = false;
    state.skipRejoinFlag = false;
    markRejoinNeeded();
    connectionWatchdog?.clearFailure?.();
    connectionWatchdog?.clearToast?.();
    leaveSession();
    if (state.socket) {
      try {
        state.socket.disconnect();
      } catch (error) {
        console.warn('Socket disconnect error', error);
      }
      state.socket = null;
    }
    showRejoinScreen({
      heading: 'Connection not established',
      message: 'Connection not established. Please rejoin.'
    });
    resetRejoinButtons();
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
      }, 500)
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
    returnDashboard: document.getElementById('return-dashboard'),
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
    emailInvite: document.getElementById('email-invite'),

    meetingShell: document.querySelector('.meeting-shell'),
    meetingControls: document.querySelector('.meeting-controls'),
    meetingParticipantCount: document.getElementById('meeting-participant-count'),
    meetingMicStatus: document.getElementById('meeting-mic-status'),
    meetingParticipantStat: document.getElementById('meeting-participant-stat'),
    meetingMicStat: document.getElementById('meeting-mic-stat'),
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
    layoutLandscape: document.getElementById('layout-landscape'),
    layoutPortrait: document.getElementById('layout-portrait'),
    chatClose: document.getElementById('chat-close'),
    participantsClose: document.getElementById('participants-close'),
    chatOverlay: document.getElementById('chat-overlay'),
    chatDrawer: document.getElementById('chat-drawer'),
    participantsDrawer: document.getElementById('participants-drawer'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    floatingControls: document.getElementById('floating-controls'),
    quickRecord: document.getElementById('quick-record'),
    quickCamera: document.getElementById('quick-camera'),
    quickOrientation: document.getElementById('quick-orientation'),
    quickChat: document.getElementById('quick-chat'),
    quickChatBadge: document.getElementById('quick-chat-badge'),
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
    meetingStartTime: document.getElementById('meeting-start-time'),
    recordingTimer: document.getElementById('recording-timer'),
    recordingStart: document.getElementById('recording-start'),
    recordingStop: document.getElementById('recording-stop'),
    recordingPause: document.getElementById('recording-pause'),
    recordingLink: document.getElementById('recording-link'),
    // Header meters
    meterMeeting: document.getElementById('meter-meeting'),
    meterMeetingTime: document.getElementById('meter-meeting-time'),
    meterRecording: document.getElementById('meter-recording'),
    meterRecordingTime: document.getElementById('meter-recording-time'),
    handRaiseBtn: document.getElementById('hand-raise-btn'),
    raisedHands: document.getElementById('raised-hands'),
    raisedHandsList: document.getElementById('raised-hands-list'),
    controlCenterPanel: document.getElementById('control-center-panel'),
    controlCenterOpen: document.getElementById('open-control-center'),
    controlCenterClose: document.getElementById('control-center-close'),
    controlParticipantList: document.getElementById('control-participant-list'),
    controlParticipantMeta: document.getElementById('control-participant-meta'),
    controlParticipantCount: document.getElementById('control-participant-count'),
    controlLobbyCount: document.getElementById('control-lobby-count'),
    controlHandQueue: document.getElementById('control-hand-queue'),
    controlHandCount: document.getElementById('control-hand-count'),
    controlChatSidebar: document.getElementById('control-chat-sidebar'),
    controlChatHeader: document.getElementById('control-chat-header'),
    controlChatMessages: document.getElementById('control-chat-messages'),
    controlChatCount: document.getElementById('control-chat-count'),
    controlChatForm: document.getElementById('control-chat-form'),
    controlChatInput: document.getElementById('control-chat-input'),
    controlCallAudio: document.getElementById('control-call-audio'),
    controlCallVideo: document.getElementById('control-call-video'),
    controlCenterAlert: document.getElementById('control-center-alert'),
    viewerMicToggle: document.getElementById('viewer-mic-toggle'),
    viewerCameraToggle: document.getElementById('viewer-camera-toggle'),
    cameraMenu: document.getElementById('camera-menu'),
    cameraMenuToggle: document.getElementById('camera-menu-toggle'),
    cameraMenuSwitch: document.getElementById('camera-menu-switch'),
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
    modalSecondary: document.getElementById('modal-secondary'),
    stage: document.querySelector('.stage'),
    vvdTextOverlay: document.getElementById('vvd-text-overlay'),
    vvdOverlayContent: document.getElementById('vvd-overlay-content'),
    vvdOverlayText: document.getElementById('vvd-overlay-text'),
    vvdOverlayShow: document.getElementById('vvd-overlay-show'),
    vvdOverlayHide: document.getElementById('vvd-overlay-hide'),
    vvdOverlayClear: document.getElementById('vvd-overlay-clear'),
    vvdOverlayPosition: document.getElementById('vvd-overlay-position'),
    recordingIndicator: document.getElementById('recording-indicator')
  };

  if (elements.nameInput && prefillNameFromDataset && !elements.nameInput.value) {
    elements.nameInput.value = prefillNameFromDataset;
  }

  if (elements.layoutLandscape) {
    elements.layoutLandscape.classList.add('hidden');
    elements.layoutLandscape.setAttribute('aria-hidden', 'true');
    elements.layoutLandscape.setAttribute('aria-pressed', 'true');
  }
  if (elements.layoutPortrait) {
    elements.layoutPortrait.classList.add('hidden');
    elements.layoutPortrait.setAttribute('aria-hidden', 'true');
    elements.layoutPortrait.setAttribute('aria-pressed', 'false');
  }
  if (elements.quickOrientation) {
    elements.quickOrientation.classList.add('hidden');
    elements.quickOrientation.setAttribute('aria-hidden', 'true');
    elements.quickOrientation.setAttribute('aria-pressed', 'false');
    elements.quickOrientation.setAttribute('tabindex', '-1');
  }

  const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const preferredAudioCodecs = ['audio/opus'];
  const preferredVideoCodecs = ['video/av1', 'video/vp9', 'video/vp8', 'video/h264'];

  const extractCodecOrdering = (kind, preferences = []) => {
    const capability = (window.RTCRtpSender || {}).getCapabilities?.(kind);
    if (!capability?.codecs?.length) return null;
    let remaining = [...capability.codecs];
    const ordered = [];

    const pullCodec = (mimeType) => {
      const lower = mimeType.toLowerCase();
      const matches = remaining.filter((codec) => codec.mimeType?.toLowerCase() === lower);
      if (!matches.length) return;
      matches.forEach((codec) => {
        ordered.push(codec);
        remaining = remaining.filter((item) => item !== codec);
        if (kind === 'video') {
          const rtxIndex = remaining.findIndex(
            (item) =>
              item.mimeType?.toLowerCase() === 'video/rtx' &&
              item.sdpFmtpLine?.includes(`apt=${codec.preferredPayloadType}`)
          );
          if (rtxIndex !== -1) {
            ordered.push(remaining.splice(rtxIndex, 1)[0]);
          }
        }
      });
    };

    preferences.forEach((mime) => pullCodec(mime));
    return ordered.concat(remaining);
  };

  const applyPreferredCodecs = (pc) => {
    if (!pc?.getTransceivers) return;
    const transceivers = pc.getTransceivers();
    transceivers.forEach((transceiver) => {
      const track = transceiver.sender?.track || transceiver.receiver?.track;
      if (!track || typeof transceiver.setCodecPreferences !== 'function') return;
      const preferences = track.kind === 'audio' ? preferredAudioCodecs : preferredVideoCodecs;
      const ordered = extractCodecOrdering(track.kind, preferences);
      if (!ordered) return;
      try {
        transceiver.setCodecPreferences(ordered);
      } catch (error) {
        console.warn('Unable to apply codec preferences', error);
      }
    });
  };

  const configureSenderParameters = (sender, { track, isScreen = false } = {}) => {
    if (!sender || !track || typeof sender.getParameters !== 'function') return;
    try {
      const params = sender.getParameters();
      if (!params) return;
      if (track.kind === 'audio') {
        params.encodings = params.encodings && params.encodings.length ? params.encodings : [{}];
        params.encodings[0] = {
          ...params.encodings[0],
          maxBitrate: Math.min(96000, params.encodings[0]?.maxBitrate || 96000),
          priority: 'high'
        };
      } else if (track.kind === 'video') {
        const hasSimulcast = Array.isArray(params.encodings) && params.encodings.length > 1;
        if (!hasSimulcast) {
          params.encodings = isScreen
            ? [
                { rid: 'screen-low', scaleResolutionDownBy: 2, maxBitrate: 800000 },
                { rid: 'screen-high', scaleResolutionDownBy: 1, maxBitrate: 2400000, scalabilityMode: 'L3T3' }
              ]
            : [
                { rid: 'cam-low', scaleResolutionDownBy: 4, maxBitrate: 200000 },
                { rid: 'cam-mid', scaleResolutionDownBy: 2, maxBitrate: 600000 },
                { rid: 'cam-high', scaleResolutionDownBy: 1, maxBitrate: 1500000, scalabilityMode: 'L3T3' }
              ];
        }
        params.degradationPreference = isScreen ? 'maintain-resolution' : 'balanced';
      }
      sender.setParameters(params).catch((error) => {
        if (track.kind === 'video' && params.encodings?.length) {
          const fallback = {
            ...params,
            encodings: params.encodings.map(({ scalabilityMode, ...encoding }) => ({ ...encoding }))
          };
          sender
            .setParameters(fallback)
            .catch((fallbackError) => console.warn('Failed to set RTCRtpSender parameters', fallbackError));
        } else {
          console.warn('Failed to set RTCRtpSender parameters', error);
        }
      });
    } catch (error) {
      console.warn('Unable to configure sender parameters', error);
    }
  };

  const addConfiguredTrack = (pc, track, stream, options = {}) => {
    if (!pc || !track) return null;
    const sender = pc.addTrack(track, stream);
    configureSenderParameters(sender, { track, ...options });
    const schedule = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback) => Promise.resolve().then(callback);
    schedule(() => applyPreferredCodecs(pc));
    return sender;
  };

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
    constructor({ badgeEl, floatingBadgeEl } = {}) {
      this.badgeEl = badgeEl;
      this.floatingBadgeEl = floatingBadgeEl || null;
      this.unread = 0;
      this.drawerOpen = false;
      this.toneManager = null;
    }

    isMobileDevice() {
      return window.innerWidth <= 768 || (window.innerHeight <= 500 && window.matchMedia('(orientation: landscape)').matches);
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
      
      // Auto-open chat on mobile devices when message is received
      if (this.isMobileDevice()) {
        // Use a small delay to ensure the UI is ready
        setTimeout(() => {
          if (typeof window.toggleDrawer === 'function') {
            window.toggleDrawer('chat');
          }
        }, 100);
      }
    }

    reset() {
      if (this.unread === 0) {
        this.sync();
        return;
      }
      this.unread = 0;
      this.sync();
    }

    updateBadgeElement(element) {
      if (!element) return;
      if (this.unread > 0) {
        element.textContent = String(this.unread);
        element.classList.remove('hidden');
        element.setAttribute('aria-hidden', 'false');
      } else {
        element.classList.add('hidden');
        element.setAttribute('aria-hidden', 'true');
      }
    }

    sync() {
      this.updateBadgeElement(this.badgeEl);
      this.updateBadgeElement(this.floatingBadgeEl);
    }
  }

  class ControlCenter {
    constructor({
      panelEl,
      openButton,
      closeButton,
      participantList,
      participantMeta,
      participantCount,
      lobbyCount,
      handQueue,
      handCount,
      chatSidebar,
      chatHeader,
      chatMessages,
      chatCount,
      chatForm,
      chatInput,
      callAudioBtn,
      callVideoBtn,
      alertBadge
    } = {}) {
      this.panelEl = panelEl;
      this.openButton = openButton;
      this.closeButton = closeButton;
      this.participantList = participantList;
      this.participantMeta = participantMeta;
      this.participantCount = participantCount;
      this.lobbyCount = lobbyCount;
      this.handQueue = handQueue;
      this.handCount = handCount;
      this.chatSidebar = chatSidebar;
      this.chatHeader = chatHeader;
      this.chatMessages = chatMessages;
      this.chatCount = chatCount;
      this.chatForm = chatForm;
      this.chatInput = chatInput;
      this.callAudioBtn = callAudioBtn;
      this.callVideoBtn = callVideoBtn;
      this.alertBadge = alertBadge;
      this.visible = false;
      this.onMute = null;
      this.onVideo = null;
      this.onRemove = null;
      this.onAllow = null;
      this.onMessage = null;
      this.onCall = null;
      this.onLower = null;
      this.activeConversation = null;
      this.sidebarItems = new Map();
      this.onVisibilityChange = null;
      this.isHostFlag = false;
      this.bind();
    }

    bind() {
      if (this.openButton) {
        this.openButton.addEventListener('click', () => this.open());
      }
      if (this.closeButton) {
        this.closeButton.addEventListener('click', () => this.close());
      }
      if (this.chatForm) {
        this.chatForm.addEventListener('submit', (event) => {
          event.preventDefault();
          const value = this.chatInput?.value?.trim();
          if (!value) return;
          if (typeof this.onMessage === 'function') {
            this.onMessage(this.activeConversation, value);
          }
          this.chatInput.value = '';
        });
      }
      if (this.callAudioBtn) {
        this.callAudioBtn.addEventListener('click', () => {
          if (typeof this.onCall === 'function') {
            this.onCall(this.activeConversation, { video: false });
          }
        });
      }
      if (this.callVideoBtn) {
        this.callVideoBtn.addEventListener('click', () => {
          if (typeof this.onCall === 'function') {
            this.onCall(this.activeConversation, { video: true });
          }
        });
      }
    }

    setCallbacks(callbacks = {}) {
      this.onMute = callbacks.onMute || null;
      this.onVideo = callbacks.onVideo || null;
      this.onRemove = callbacks.onRemove || null;
      this.onAllow = callbacks.onAllow || null;
      this.onMessage = callbacks.onMessage || null;
      this.onCall = callbacks.onCall || null;
      this.onLower = callbacks.onLower || null;
    }

    setHost(flag) {
      if (!this.openButton) return;
      this.isHostFlag = !!flag;
      if (flag) {
        this.openButton.classList.remove('hidden');
      } else {
        this.openButton.classList.add('hidden');
        this.close();
      }
    }

    open() {
      if (!this.panelEl) return;
      this.panelEl.classList.remove('hidden');
      this.panelEl.classList.add('visible');
      this.visible = true;
      this.clearAlert();
      if (typeof this.onVisibilityChange === 'function') {
        this.onVisibilityChange(true);
      }
    }

    close() {
      if (!this.panelEl) return;
      this.panelEl.classList.add('hidden');
      this.panelEl.classList.remove('visible');
      this.visible = false;
      if (typeof this.onVisibilityChange === 'function') {
        this.onVisibilityChange(false);
      }
    }

    setParticipants(
      participants = [],
      { lobby = [], mediaStates = new Map(), raised = new Map(), quality = new Map() } = {}
    ) {
      if (!this.participantList) return;
      this.participantList.innerHTML = '';
      const total = Array.isArray(participants) ? participants.length : 0;
      const lobbyCount = Array.isArray(lobby) ? lobby.length : 0;
      if (this.participantMeta) {
        const liveTotal = this.isHostFlag ? total + 1 : total;
        this.participantMeta.textContent = `${liveTotal} in class • ${lobbyCount} waiting`;
      }
      if (this.participantCount) {
        this.participantCount.textContent = this.isHostFlag ? total + 1 : total;
      }
      if (this.lobbyCount) {
        this.lobbyCount.textContent = lobbyCount;
      }

      const buildActions = (participant) => {
        const container = document.createElement('div');
        container.className = 'control-actions';
        const media = mediaStates.get(participant.token) || participant.mediaState || {};
        const addBtn = (label, handler, opts = {}) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `ghost small${opts.danger ? ' danger' : ''}`;
          btn.textContent = label;
          btn.addEventListener('click', () => handler(participant));
          container.appendChild(btn);
        };
        if (this.onMute) {
          addBtn(media.audio === false ? 'Unmute' : 'Mute', (entry) => this.onMute(entry, media.audio === false));
        }
        if (this.onVideo) {
          addBtn(media.video === false ? 'Show video' : 'Hide video', (entry) => this.onVideo(entry, media.video === false));
        }
        if (raised.has(participant.token) && this.onAllow) {
          addBtn('Approve', (entry) => this.onAllow(entry));
        }
        if (this.onMessage) {
          addBtn('Message', () => this.selectConversation(participant.token));
        }
        if (this.onCall) {
          addBtn('Audio call', () => this.onCall(participant.token, { video: false }));
          addBtn('Video call', () => this.onCall(participant.token, { video: true }));
        }
        if (this.onRemove) {
          addBtn('Remove', (entry) => this.onRemove(entry), { danger: true });
        }
        return container;
      };

      participants.forEach((participant) => {
        const item = document.createElement('li');
        const identity = document.createElement('div');
        identity.className = 'identity';
        const name = document.createElement('strong');
        name.textContent = participant.displayName;
        const meta = document.createElement('span');
        const media = mediaStates.get(participant.token) || participant.mediaState || {};
        const qualityInfo = quality.get(participant.token);
        const qualityState =
          typeof qualityInfo === 'object' && qualityInfo !== null
            ? qualityInfo.status || 'connecting'
            : qualityInfo || 'connecting';
        const metrics =
          typeof qualityInfo === 'object' && qualityInfo !== null ? qualityInfo.metrics || {} : {};
        const labelParts = [media.audio === false ? 'Muted' : 'Mic on', media.video === false ? 'Video off' : 'Video on'];
        const qualityLabel = (() => {
          switch (qualityState) {
            case 'connected':
            case 'completed':
              return 'Stable';
            case 'disconnected':
              return 'Reconnecting';
            case 'failed':
              return 'Failed';
            case 'connecting':
              return 'Connecting';
            default:
              return qualityState;
          }
        })();
        labelParts.push(qualityLabel);
        if (metrics?.bitrate) {
          const down = typeof metrics.bitrate.down === 'number' ? metrics.bitrate.down : null;
          const up = typeof metrics.bitrate.up === 'number' ? metrics.bitrate.up : null;
          const metricParts = [];
          if (down !== null) {
            metricParts.push(`↓ ${down} kbps`);
          }
          if (up !== null) {
            metricParts.push(`↑ ${up} kbps`);
          }
          if (metricParts.length) {
            labelParts.push(metricParts.join(' '));
          }
        }
        if (typeof metrics?.jitter === 'number') {
          labelParts.push(`Jitter ${metrics.jitter} ms`);
        }
        meta.textContent = labelParts.join(' • ');
        identity.appendChild(name);
        identity.appendChild(meta);
        item.appendChild(identity);
        item.appendChild(buildActions(participant));
        this.participantList.appendChild(item);
      });
      const activeTokens = new Set(participants.map((p) => p.token));
      participantQuality.forEach((_, key) => {
        if (!activeTokens.has(key)) {
          participantQuality.delete(key);
        }
      });
    }

    setHandQueue(queue = []) {
      if (!this.handQueue) return;
      this.handQueue.innerHTML = '';
      if (this.handCount) {
        this.handCount.textContent = queue.length;
      }
      queue.forEach((entry) => {
        const item = document.createElement('li');
        const identity = document.createElement('div');
        identity.className = 'identity';
        const name = document.createElement('strong');
        name.textContent = entry.displayName;
        const meta = document.createElement('span');
        meta.textContent = entry.handRaisedAt ? new Date(entry.handRaisedAt).toLocaleTimeString() : '';
        identity.appendChild(name);
        identity.appendChild(meta);
        const actions = document.createElement('div');
        actions.className = 'control-actions';
        if (this.onAllow) {
          const approve = document.createElement('button');
          approve.type = 'button';
          approve.className = 'ghost small';
          approve.textContent = 'Approve';
          approve.addEventListener('click', () => this.onAllow(entry));
          actions.appendChild(approve);
        }
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'ghost small';
        dismiss.textContent = 'Dismiss';
        dismiss.addEventListener('click', () => {
          if (typeof this.onLower === 'function') {
            this.onLower(entry);
          }
        });
        actions.appendChild(dismiss);
        item.appendChild(identity);
        item.appendChild(actions);
        this.handQueue.appendChild(item);
      });
    }

    syncSidebar(conversations = []) {
      if (!this.chatSidebar) return;
      this.chatSidebar.innerHTML = '';
      this.sidebarItems.clear();
      conversations.forEach((conversation) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.token = conversation.token;
        button.dataset.label = conversation.displayName || conversation.token;
        const label = document.createElement('span');
        label.textContent = conversation.displayName || 'Participant';
        button.appendChild(label);
        const badge = document.createElement('span');
        badge.className = `presence-dot ${conversation.online ? 'presence-online' : 'presence-offline'}`;
        button.appendChild(badge);
        if (conversation.unread > 0) {
          const unread = document.createElement('span');
          unread.className = 'badge';
          unread.textContent = conversation.unread;
          button.appendChild(unread);
        }
        if (conversation.token === this.activeConversation) {
          button.classList.add('active');
        }
        button.addEventListener('click', () => {
          this.selectConversation(conversation.token);
        });
        this.chatSidebar.appendChild(button);
        this.sidebarItems.set(conversation.token, button);
      });
      if (this.chatCount) {
        const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread || 0), 0);
        this.chatCount.textContent = totalUnread;
        this.chatCount.classList.toggle('hidden', totalUnread === 0);
        if (this.alertBadge) {
          if (!this.visible && totalUnread > 0) {
            this.alertBadge.classList.remove('hidden');
            this.alertBadge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
          } else if (totalUnread === 0) {
            this.alertBadge.classList.add('hidden');
          }
        }
      }
    }

    setConversation(token, messages = []) {
      this.activeConversation = token;
      if (this.chatHeader) {
        if (!token) {
          this.chatHeader.textContent = 'Select a participant';
        } else {
          const btn = this.sidebarItems.get(token);
          const label = btn?.dataset?.label || token;
          this.chatHeader.textContent = `Chat with ${label}`;
        }
      }
      if (!this.chatMessages) return;
      this.chatMessages.innerHTML = '';
      messages.forEach((message) => this.appendMessage(message));
      const button = this.sidebarItems.get(token);
      this.sidebarItems.forEach((btn) => btn.classList.remove('active'));
      if (button) {
        button.classList.add('active');
      }
      if (this.chatInput) {
        this.chatInput.disabled = !token;
      }
      if (this.callAudioBtn) {
        this.callAudioBtn.disabled = !token;
      }
      if (this.callVideoBtn) {
        this.callVideoBtn.disabled = !token;
      }
    }

    appendMessage(message) {
      if (!this.chatMessages) return;
      const bubble = document.createElement('div');
      bubble.className = 'control-chat-bubble';
      if (message.from === state.joinToken || message.from === 'host') {
        bubble.classList.add('me');
      }
      bubble.textContent = message.message || '';
      const meta = document.createElement('div');
      meta.className = 'control-chat-meta';
      meta.textContent = new Date(message.createdAt || Date.now()).toLocaleTimeString();
      bubble.appendChild(meta);
      this.chatMessages.appendChild(bubble);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    selectConversation(token) {
      if (!token) return;
      if (!this.visible) {
        this.open();
      }
      if (typeof this.onMessage === 'function') {
        // just to trigger seen updates we call with empty string? no.
      }
      this.activeConversation = token;
      if (this.chatHeader) {
        this.chatHeader.textContent = `Chat with ${token}`;
      }
      if (typeof this.onSelect === 'function') {
        this.onSelect(token);
      }
    }

    onSelectConversation(callback) {
      this.onSelect = callback;
    }

    onToggle(callback) {
      this.onVisibilityChange = callback;
    }

    showAlert() {
      if (this.visible) return;
      if (this.alertBadge) {
        this.alertBadge.classList.remove('hidden');
        this.alertBadge.textContent = '!';
      }
    }

    clearAlert() {
      if (this.alertBadge) {
        this.alertBadge.classList.add('hidden');
      }
    }
  }

  class DirectChatManager {
    constructor({ socket, controlCenter: center, toneManager: tones } = {}) {
      this.socket = socket;
      this.controlCenter = null;
      this.toneManager = tones;
      this.conversations = new Map();
      this.activeToken = null;
      this.selfToken = null;
      if (center) {
        this.attachControlCenter(center);
      }
    }

    attachControlCenter(center) {
      if (!center) return;
      this.controlCenter = center;
      this.controlCenter.onSelectConversation((token) => {
        this.select(token);
      });
      this.syncSidebar();
      if (this.activeToken) {
        const conversation = this.conversations.get(this.activeToken);
        if (conversation) {
          this.controlCenter.setConversation(this.activeToken, conversation.messages);
        }
      } else {
        this.controlCenter.setConversation(null, []);
      }
    }

    attachSocket(socket) {
      this.socket = socket;
    }

    setSelfToken(token) {
      this.selfToken = token;
    }

    ensureConversation(token, data = {}) {
      if (!token) return null;
      if (!this.conversations.has(token)) {
        this.conversations.set(token, {
          token,
          displayName: data.displayName || token,
          messages: [],
          unread: 0,
          online: false,
          historyCursor: null,
          hasMore: true
        });
      } else if (data.displayName) {
        const existing = this.conversations.get(token);
        existing.displayName = data.displayName;
      }
      return this.conversations.get(token);
    }

    normalizeMessage(entry) {
      if (!entry) return null;
      const normal = { ...entry };
      if (!normal.id) {
        const stamp = normal.createdAt ? new Date(normal.createdAt).getTime() : Date.now();
        normal.id = `${normal.from || 'unknown'}-${stamp}`;
      }
      if (normal.createdAt && !(normal.createdAt instanceof Date)) {
        const parsed = new Date(normal.createdAt);
        normal.createdAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      }
      if (normal.updatedAt && !(normal.updatedAt instanceof Date)) {
        const parsed = new Date(normal.updatedAt);
        normal.updatedAt = Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      normal.seen = normal.seen === true || Boolean(normal.seenAt);
      return normal;
    }

    mergeMessages(conversation, entries = [], { append = true } = {}) {
      if (!conversation || !Array.isArray(entries) || !entries.length) return;
      const existing = Array.isArray(conversation.messages) ? conversation.messages : [];
      const combined = append ? existing.concat(entries) : entries.concat(existing);
      const map = new Map();
      combined.forEach((msg) => {
        const normalized = this.normalizeMessage(msg);
        if (normalized) {
          map.set(normalized.id, normalized);
        }
      });
      conversation.messages = Array.from(map.values()).sort((a, b) => {
        const aTimeRaw = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bTimeRaw = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        const aTime = Number.isNaN(aTimeRaw) ? 0 : aTimeRaw;
        const bTime = Number.isNaN(bTimeRaw) ? 0 : bTimeRaw;
        return aTime - bTime;
      });
      if (conversation.messages.length > 200) {
        conversation.messages = conversation.messages.slice(-200);
      }
    }

    setParticipants(list = []) {
      list.forEach((participant) => {
        const conversation = this.ensureConversation(participant.token, participant);
        if (conversation) {
          conversation.online = true;
        }
      });
      this.syncSidebar();
    }

    removeParticipant(token) {
      if (!token) return;
      const conversation = this.conversations.get(token);
      if (conversation) {
        conversation.online = false;
        this.syncSidebar();
      }
    }

    updatePresence(token, online) {
      const conversation = this.ensureConversation(token);
      if (!conversation) return;
      conversation.online = online;
      this.syncSidebar();
    }

    appendMessage(entry) {
      const normalized = this.normalizeMessage(entry);
      if (!normalized) return;
      const token = normalized.from === this.selfToken ? normalized.to : normalized.from;
      const conversation = this.ensureConversation(token);
      if (!conversation) return;
      this.mergeMessages(conversation, [normalized]);
      if (token !== this.activeToken && normalized.from !== this.selfToken) {
        conversation.unread = (conversation.unread || 0) + 1;
        this.controlCenter?.showAlert();
        this.toneManager?.play('chat');
      }
      if (token === this.activeToken) {
        this.controlCenter?.appendMessage(normalized);
        this.markSeen(token);
      }
      this.syncSidebar();
    }

    select(token) {
      if (!token) return;
      this.activeToken = token;
      const conversation = this.ensureConversation(token);
      if (!conversation) return;
      if (!conversation.messages.length && this.socket) {
        const payload = { target: token, limit: 60 };
        this.socket.emit('direct:chat:history', payload, (response = {}) => {
          if (Array.isArray(response.messages)) {
            this.mergeMessages(conversation, response.messages, { append: false });
            conversation.historyCursor = response.nextCursor || null;
            conversation.hasMore = response.hasMore === true;
            this.controlCenter?.setConversation(token, conversation.messages);
            this.markSeen(token);
          }
        });
      }
      conversation.unread = 0;
      this.controlCenter?.setConversation(token, conversation.messages);
      this.syncSidebar();
      this.markSeen(token);
    }

    markSeen(token) {
      const conversation = this.conversations.get(token);
      if (!conversation || !conversation.messages.length) return;
      const ids = conversation.messages
        .filter((msg) => !msg.seen && msg.from !== this.selfToken)
        .map((msg) => msg.id)
        .filter(Boolean);
      if (!ids.length) return;
      const idSet = new Set(ids);
      conversation.messages.forEach((msg) => {
        if (idSet.has(msg.id)) {
          msg.seen = true;
        }
      });
      if (this.socket) {
        this.socket.emit('direct:chat:seen', { target: token, messageIds: ids });
      }
    }

    sendMessage(token, message) {
      if (!token || !message || !this.socket) return;
      this.socket.emit('direct:chat:send', { target: token, message }, (response = {}) => {
        if (response.error) {
          console.warn('Direct chat send error', response.error);
        }
        if (response.message) {
          this.appendMessage(response.message);
        }
      });
    }

    syncSidebar() {
      if (!this.controlCenter) return;
      const conversations = Array.from(this.conversations.values()).sort((a, b) => {
        const unreadDiff = (b.unread || 0) - (a.unread || 0);
        if (unreadDiff !== 0) return unreadDiff;
        const nameA = (a.displayName || a.token || '').toLowerCase();
        const nameB = (b.displayName || b.token || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      this.controlCenter.syncSidebar(conversations);
    }

    resetCounts(token, ids) {
      const conversation = this.conversations.get(token);
      if (!conversation) return;
      if (!Array.isArray(ids) || !ids.length) return;
      const idSet = new Set(ids);
      conversation.messages.forEach((msg) => {
        if (idSet.has(msg.id)) {
          msg.seen = true;
        }
      });
      this.syncSidebar();
    }
  }

  class DirectCallManager {
    constructor({ socket, rtcConfig: config, permissionManager: permissions, toneManager: tones } = {}) {
      this.socket = socket;
      this.rtcConfig = config;
      this.permissionManager = permissions;
      this.toneManager = tones;
      this.calls = new Map();
      this.selfToken = null;
    }

    setSelfToken(token) {
      this.selfToken = token;
    }

    attachSocket(socket) {
      this.socket = socket;
    }

    attachPermissionManager(manager) {
      this.permissionManager = manager;
    }

    ensureCall(token) {
      if (!token) return null;
      if (!this.calls.has(token)) {
        this.calls.set(token, {
          token,
          direction: 'outgoing',
          accepted: false,
          media: { video: false },
          overlay: null,
          pc: null,
          localStream: null,
          remoteStream: null
        });
      }
      return this.calls.get(token);
    }

    async startCall(token, options = {}) {
      if (!token || !this.socket) return;
      const call = this.ensureCall(token);
      call.direction = 'outgoing';
      call.media = { video: !!options.video };
      this.showOverlay(call, { status: 'calling' });
      this.socket.emit('direct:call:initiate', {
        target: token,
        media: call.media
      });
    }

    async handleRing({ from, fromName, media }) {
      if (!from) return;
      const call = this.ensureCall(from);
      call.direction = 'incoming';
      call.media = media || { video: false };
      this.toneManager?.play('join');
      this.showOverlay(call, { status: 'ringing', name: fromName || getNameByToken(from) || 'Participant' });
    }

    handleCancel({ from }) {
      const call = this.calls.get(from);
      if (call) {
        this.teardown(call, 'Caller cancelled');
      }
    }

    handleResponse({ from, accepted }) {
      const call = this.calls.get(from);
      if (!call) return;
      if (!accepted) {
        this.teardown(call, 'Call declined');
        showLiveToast(`${getNameByToken(from) || 'Participant'} declined the call`);
        return;
      }
      call.accepted = true;
      this.showOverlay(call, { status: 'connecting' });
      this.beginNegotiation(call, true);
    }

    async acceptCall(token) {
      if (!token || !this.socket) return;
      const call = this.calls.get(token);
      if (!call) return;
      call.accepted = true;
      this.updateOverlayActions(call);
      this.socket.emit('direct:call:response', { target: token, accepted: true });
      await this.beginNegotiation(call, false);
    }

    declineCall(token) {
      if (!token || !this.socket) return;
      const call = this.calls.get(token);
      this.socket.emit('direct:call:response', { target: token, accepted: false });
      if (call) {
        this.teardown(call, 'Declined');
      }
    }

    endCall(token) {
      if (!token) return;
      const call = this.calls.get(token);
      if (call) {
        if (call.accepted) {
          this.socket?.emit('direct:call:end', { target: token });
        } else {
          this.socket?.emit('direct:call:cancel', { target: token });
        }
        this.teardown(call, call.accepted ? 'Call ended' : 'Call cancelled');
      }
    }

    handleEnd({ from }) {
      const call = this.calls.get(from);
      if (call) {
        this.teardown(call, 'Call ended');
      }
    }

    async beginNegotiation(call, initiator) {
      if (!call) return;
      try {
        this.showOverlay(call, { status: 'Connecting…' });
        const pc = this.createPeer(call.token);
        call.pc = pc;
        const stream = await this.ensureLocalStream(call);
        stream.getTracks().forEach((track) => {
          addConfiguredTrack(pc, track, stream);
        });
        applyPreferredCodecs(pc);
        if (initiator) {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer);
          this.socket?.emit('direct:call:signal', { target: call.token, data: { type: 'offer', sdp: offer } });
        }
      } catch (error) {
        this.handleNegotiationFailure(call, error);
      }
    }

    async ensureLocalStream(call) {
      if (call.localStream) return call.localStream;
      if (!this.permissionManager) {
        throw new Error('permission-manager-missing');
      }
      const stream = await this.permissionManager.ensureInteractivePermissions({
        audio: true,
        video: call.media.video
      });
      if (!stream) {
        throw new Error('media-permission-denied');
      }
      call.localStream = stream;
      if (call.overlay) {
        const video = call.overlay.querySelector('.direct-call-local');
        if (video) video.srcObject = stream;
      }
      return stream;
    }

    createPeer(token) {
      const pc = new RTCPeerConnection(this.rtcConfig);
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket?.emit('direct:call:signal', {
            target: token,
            data: { type: 'candidate', candidate: event.candidate }
          });
        }
      };
      pc.ontrack = (event) => {
        const call = this.calls.get(token);
        if (!call) return;
        call.remoteStream = event.streams[0];
        if (call.overlay) {
          const remoteVideo = call.overlay.querySelector('.direct-call-remote');
          if (remoteVideo) remoteVideo.srcObject = call.remoteStream;
        }
        this.showOverlay(call, { status: 'connected' });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          const call = this.calls.get(token);
          if (call) this.teardown(call, 'Network error');
        }
      };
      return pc;
    }

    async handleSignal({ from, data }) {
      if (!from || !data) return;
      const call = this.ensureCall(from);
      if (!call.pc) {
        call.pc = this.createPeer(from);
      }
      const pc = call.pc;
      if (data.type === 'offer') {
        await pc.setRemoteDescription(data.sdp);
        const stream = await this.ensureLocalStream(call);
        if (stream) {
          stream.getTracks().forEach((track) => {
            addConfiguredTrack(pc, track, stream);
          });
        }
        applyPreferredCodecs(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.socket?.emit('direct:call:signal', { target: from, data: { type: 'answer', sdp: answer } });
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription(data.sdp);
      } else if (data.type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    }

    teardown(call, reason) {
      if (!call) return;
      if (call.pc) {
        call.pc.close();
        call.pc = null;
      }
      if (call.localStream) {
        call.localStream.getTracks().forEach((track) => track.stop());
        call.localStream = null;
      }
      if (call.overlay && call.overlay.parentNode) {
        call.overlay.parentNode.removeChild(call.overlay);
      }
      if (reason) {
        showLiveToast(reason, { duration: 3200 });
      }
      this.calls.delete(call.token);
    }

    handleNegotiationFailure(call, error) {
      if (!call) return;
      console.error('Direct call negotiation failed', error);
      const message = this.describeNegotiationError(error);
      this.showOverlay(call, { status: message, variant: 'error' });
      if (call.accepted) {
        this.socket?.emit('direct:call:end', { target: call.token, reason: 'error' });
      } else {
        this.socket?.emit('direct:call:cancel', { target: call.token, reason: 'error' });
      }
      window.setTimeout(() => this.teardown(call, message), 1400);
    }

    describeNegotiationError(error) {
      if (!error) return 'Call failed';
      if (error.name === 'NotAllowedError' || error.message?.includes('permission')) {
        return 'Allow microphone/camera access to continue';
      }
      if (error.name === 'NotFoundError') {
        return 'No input devices available';
      }
      if (error.name === 'NotReadableError') {
        return 'Device in use by another application';
      }
      return 'Call failed to connect';
    }

    showOverlay(call, { status, name, variant } = {}) {
      if (!call) return;
      if (!call.overlay) {
        call.overlay = this.buildOverlay(call);
      }
      const overlay = call.overlay;
      const statusEl = overlay.querySelector('.direct-call-status');
      const titleEl = overlay.querySelector('.direct-call-title');
      if (titleEl) {
        const label = name || getNameByToken(call.token) || 'Participant';
        titleEl.textContent = label;
      }
      if (statusEl) {
        statusEl.textContent = status || 'Connecting';
      }
      const card = overlay.querySelector('.direct-call-card');
      if (card) {
        card.classList.toggle('error', variant === 'error');
      }
      overlay.classList.remove('hidden');
      overlay.classList.add('visible');
      this.updateOverlayActions(call);
    }

    buildOverlay(call) {
      const overlay = document.createElement('div');
      overlay.className = 'direct-call-overlay hidden';
      overlay.innerHTML = `
        <div class="direct-call-card">
          <header>
            <div class="direct-call-title">Connecting…</div>
            <div class="direct-call-status">Preparing</div>
          </header>
          <div class="direct-call-body">
            <video class="direct-call-remote" autoplay playsinline></video>
            <video class="direct-call-local" autoplay playsinline muted></video>
          </div>
          <footer class="direct-call-actions"></footer>
        </div>
      `;
      const actions = overlay.querySelector('.direct-call-actions');
      const hangUp = document.createElement('button');
      hangUp.type = 'button';
      hangUp.className = 'danger';
      hangUp.textContent = 'Hang up';
      hangUp.dataset.role = 'hangup';
      hangUp.addEventListener('click', () => this.endCall(call.token));
      actions.appendChild(hangUp);
      if (call.direction === 'incoming') {
        const accept = document.createElement('button');
        accept.type = 'button';
        accept.className = 'primary';
        accept.textContent = 'Accept';
        accept.dataset.role = 'accept';
        accept.addEventListener('click', () => this.acceptCall(call.token));
        const decline = document.createElement('button');
        decline.type = 'button';
        decline.className = 'ghost';
        decline.textContent = 'Decline';
        decline.dataset.role = 'decline';
        decline.addEventListener('click', () => this.declineCall(call.token));
        actions.appendChild(accept);
        actions.appendChild(decline);
      }
      document.body.appendChild(overlay);
      window.setTimeout(() => overlay.classList.remove('hidden'), 10);
      return overlay;
    }

    updateOverlayActions(call) {
      if (!call?.overlay) return;
      const actions = call.overlay.querySelector('.direct-call-actions');
      if (!actions) return;
      const acceptBtn = actions.querySelector('[data-role="accept"]');
      const declineBtn = actions.querySelector('[data-role="decline"]');
      const hangUpBtn = actions.querySelector('[data-role="hangup"]');
      if (call.accepted) {
        if (acceptBtn) acceptBtn.classList.add('hidden');
        if (declineBtn) declineBtn.classList.add('hidden');
        if (hangUpBtn) hangUpBtn.textContent = 'End call';
      } else if (call.direction === 'incoming') {
        if (acceptBtn) acceptBtn.classList.remove('hidden');
        if (declineBtn) declineBtn.classList.remove('hidden');
        if (hangUpBtn) hangUpBtn.textContent = 'Hang up';
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

      const buildAudioConstraints = (value) => {
        if (!value) return false;
        const base = typeof value === 'object' ? { ...value } : {};
        return {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 },
          channelCount: { ideal: 1 },
          ...base
        };
      };

      const buildVideoConstraints = (value) => {
        if (!value) return false;
        const base = typeof value === 'object' ? { ...value } : {};
        const result = {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          ...base
        };
        const preferred = this.state?.preferredCamera || {};
        if (!result.deviceId && preferred.deviceId) {
          result.deviceId = { exact: preferred.deviceId };
        }
        if (!result.facingMode) {
          if (preferred.facingMode) {
            result.facingMode = { ideal: preferred.facingMode };
          } else {
            result.facingMode = isMobileDevice()
              ? { ideal: 'environment' }
              : { ideal: 'user' };
          }
        }
        return result;
      };

      const audioConstraints = buildAudioConstraints(audio);
      const videoConstraints = buildVideoConstraints(video);

      const constraints = {
        audio: audioConstraints,
        video: videoConstraints
      };

      const attemptFallback = async (error) => {
        if (!videoConstraints) {
          throw error;
        }
        if (videoConstraints.deviceId) {
          const fallbackVideo = { ...videoConstraints };
          delete fallbackVideo.deviceId;
          if (!fallbackVideo.facingMode) {
            fallbackVideo.facingMode = { ideal: 'user' };
          }
          if (this.state?.preferredCamera) {
            this.state.preferredCamera = {
              deviceId: null,
              facingMode: this.state.preferredCamera.facingMode || null
            };
          }
          return navigator.mediaDevices.getUserMedia({
            ...constraints,
            video: fallbackVideo
          });
        }
        if (!isMobileDevice()) {
          throw error;
        }
        const requestedEnvironment =
          videoConstraints?.facingMode &&
          ((typeof videoConstraints.facingMode === 'string' &&
            videoConstraints.facingMode === 'environment') ||
            (typeof videoConstraints.facingMode === 'object' &&
              videoConstraints.facingMode.ideal === 'environment'));
        if (!requestedEnvironment) {
          throw error;
        }
        const fallbackConstraints = {
          ...constraints,
          video: {
            ...videoConstraints,
            facingMode: { ideal: 'user' }
          }
        };
        return navigator.mediaDevices.getUserMedia(fallbackConstraints);
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (audio) this.granted.audio = true;
        if (video) this.granted.video = true;
        this.previewInitialized = true;
        if (typeof this.onStreamReady === 'function') {
          this.onStreamReady(stream, { replace });
        }
        return stream;
      } catch (error) {
        try {
          const fallbackStream = await attemptFallback(error);
          if (audio) this.granted.audio = true;
          if (video) this.granted.video = true;
          this.previewInitialized = true;
          if (typeof this.onStreamReady === 'function') {
            this.onStreamReady(fallbackStream, { replace });
          }
          return fallbackStream;
        } catch (finalError) {
          console.warn('Permission error', finalError);
          return null;
        }
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

  class HostMediaAutoSync {
    constructor({
      state: stateRef,
      onRenegotiate,
      onRejoin,
      onFail,
      connectionWatchdog: watchdog,
      getHostExpectation,
      pollInterval = 500,
      stallThreshold = 1200,
      maxFailure = 30000,
      retryInterval = 500,
      maxRetries = 10,
      gracePeriod = 1200
    } = {}) {
      this.state = stateRef;
      this.onRenegotiate = onRenegotiate;
      this.onRejoin = onRejoin;
      this.onFail = onFail;
      this.connectionWatchdog = watchdog;
      this.getHostExpectation = getHostExpectation;
      this.pollInterval = pollInterval;
      this.stallThreshold = stallThreshold;
      this.maxFailure = maxFailure;
      this.retryInterval = retryInterval;
      this.maxRetries = maxRetries;
      this.gracePeriod = gracePeriod;
      this.entries = new Map();
      this.intervalId = null;
      this.processing = false;
    }

    setWatchdog(watchdog) {
      this.connectionWatchdog = watchdog;
    }

    setHostExpectationGetter(fn) {
      if (typeof fn === 'function') {
        this.getHostExpectation = fn;
      }
    }

    register(token, pc) {
      if (!token || !pc) return;
      const entry = this.entries.get(token) || {};
      entry.pc = pc;
      entry.lastAudioBytes = null;
      entry.lastVideoBytes = null;
      entry.audioStallSince = null;
      entry.videoStallSince = null;
      entry.failureStart = null;
      entry.lastSyncAttempt = null;
      entry.rejoinNotified = false;
      entry.retryTimer = null;
      entry.retryCount = 0;
      entry.registeredAt = Date.now();
      this.entries.set(token, entry);
      this.ensureTimer();
    }

    unregister(token) {
      if (!token) return;
      const entry = this.entries.get(token);
      this.stopRecovery(token, entry);
      this.entries.delete(token);
      if (this.entries.size === 0) {
        this.stopTimer();
      }
    }

    ensureTimer() {
      if (this.intervalId || this.entries.size === 0) return;
      this.intervalId = window.setInterval(() => this.tick(), this.pollInterval);
    }

    stopTimer() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }

    refreshExpectation() {
      const now = Date.now();
      this.entries.forEach((entry, token) => {
        entry.audioStallSince = null;
        entry.videoStallSince = null;
        entry.failureStart = null;
        entry.rejoinNotified = false;
        entry.lastSyncAttempt = null;
        entry.registeredAt = now;
        this.stopRecovery(token, entry);
      });
    }

    async tick() {
      if (this.processing) return;
      if (this.entries.size === 0) {
        this.stopTimer();
        return;
      }
      this.processing = true;
      try {
        const snapshot = Array.from(this.entries.entries());
        for (const [token, entry] of snapshot) {
          await this.inspectPeer(token, entry);
        }
      } finally {
        this.processing = false;
      }
    }

    async inspectPeer(token, entry) {
      const pc = entry?.pc;
      if (!pc || typeof pc.getStats !== 'function') {
        this.unregister(token);
        return;
      }

      const stateValue = pc.connectionState || pc.iceConnectionState;
      if (stateValue && !['connected', 'completed'].includes(stateValue)) {
        this.stopRecovery(token, entry);
        entry.audioStallSince = null;
        entry.videoStallSince = null;
        entry.failureStart = null;
        entry.lastSyncAttempt = null;
        entry.rejoinNotified = false;
        return;
      }

      if (!this.state.isHost && token !== 'host') {
        this.stopRecovery(token, entry);
        return;
      }

      let stats;
      try {
        stats = await pc.getStats();
      } catch (error) {
        console.warn('Stats error during media sync', error);
        return;
      }

      if (!stats) return;

      const now = Date.now();
      if (!entry.registeredAt) {
        entry.registeredAt = now;
      }

      const direction = this.state.isHost ? 'outbound' : 'inbound';
      let audioBytes = null;
      let videoBytes = null;
      const receivers = typeof pc.getReceivers === 'function' ? pc.getReceivers() : [];
      let remoteAudioActive = null;
      let remoteVideoActive = null;
      if (!this.state.isHost && receivers.length) {
        receivers.forEach((receiver) => {
          const track = receiver.track;
          if (!track) return;
          const active = track.readyState === 'live' && !track.muted;
          if (track.kind === 'audio') {
            remoteAudioActive = active ? true : remoteAudioActive === null ? false : remoteAudioActive;
          } else if (track.kind === 'video') {
            remoteVideoActive = active ? true : remoteVideoActive === null ? false : remoteVideoActive;
          }
        });
      }

      stats.forEach((report) => {
        if (!report || report.isRemote) return;
        const kind = report.kind || report.mediaType;
        if (direction === 'inbound' && report.type === 'inbound-rtp') {
          if (kind === 'audio') {
            audioBytes = Math.max(audioBytes ?? 0, report.bytesReceived || 0);
          } else if (kind === 'video') {
            videoBytes = Math.max(videoBytes ?? 0, report.bytesReceived || 0);
          }
        } else if (direction === 'outbound' && report.type === 'outbound-rtp') {
          if (kind === 'audio') {
            audioBytes = Math.max(audioBytes ?? 0, report.bytesSent || 0);
          } else if (kind === 'video') {
            videoBytes = Math.max(videoBytes ?? 0, report.bytesSent || 0);
          }
        }
      });

      const hasAudioTrack = this.state.localStream
        ? this.state.localStream.getAudioTracks().some((track) => track.enabled)
        : false;
      const hasCameraVideo = this.state.localStream
        ? this.state.localStream.getVideoTracks().some((track) => track.enabled)
        : false;
      const hasScreenVideo = this.state.screenStream
        ? this.state.screenStream.getVideoTracks().some((track) => track.readyState === 'live')
        : false;

      const localAudioActive = this.state.isHost ? hasAudioTrack : null;
      const localVideoActive = this.state.isHost ? hasCameraVideo || hasScreenVideo : null;

      const hostIntent =
        !this.state.isHost && token === 'host' && typeof this.getHostExpectation === 'function'
          ? this.getHostExpectation() || {}
          : null;

      const hostAudioExpected = hostIntent ? hostIntent.audio === true : null;
      const hostVideoExpected = hostIntent ? hostIntent.video === true : null;

      let audioExpected;
      let videoExpected;

      if (this.state.isHost) {
        audioExpected = audioBytes !== null && localAudioActive;
        videoExpected = videoBytes !== null && localVideoActive;
      } else if (token === 'host') {
        audioExpected = hostAudioExpected === null ? audioBytes !== null : hostAudioExpected;
        videoExpected = hostVideoExpected === null ? videoBytes !== null : hostVideoExpected;
      } else {
        audioExpected = audioBytes !== null && remoteAudioActive !== false;
        videoExpected = videoBytes !== null && remoteVideoActive !== false;
      }

      let audioHealthy = true;
      if (audioExpected) {
        const progressed = audioBytes !== null && (entry.lastAudioBytes === null || audioBytes > entry.lastAudioBytes);
        const trackLive = this.state.isHost ? true : remoteAudioActive !== false;
        audioHealthy = progressed && trackLive;
      }

      let videoHealthy = true;
      if (videoExpected) {
        const progressed = videoBytes !== null && (entry.lastVideoBytes === null || videoBytes > entry.lastVideoBytes);
        const trackLive = this.state.isHost ? true : remoteVideoActive !== false;
        videoHealthy = progressed && trackLive;
      }

      if (audioBytes !== null) {
        entry.lastAudioBytes = audioBytes;
      }
      if (videoBytes !== null) {
        entry.lastVideoBytes = videoBytes;
      }

      if (now - entry.registeredAt < this.gracePeriod) {
        if (audioHealthy) {
          entry.audioStallSince = null;
        }
        if (videoHealthy) {
          entry.videoStallSince = null;
        }
        return;
      }

      if (audioExpected && !audioHealthy) {
        if (!entry.audioStallSince) {
          entry.audioStallSince = now;
        }
      } else {
        entry.audioStallSince = null;
      }

      if (videoExpected && !videoHealthy) {
        if (!entry.videoStallSince) {
          entry.videoStallSince = now;
        }
      } else {
        entry.videoStallSince = null;
      }

      const earliestStall = Math.min(entry.audioStallSince || Infinity, entry.videoStallSince || Infinity);

      if (earliestStall !== Infinity && now - earliestStall >= this.stallThreshold) {
        if (!entry.failureStart) {
          entry.failureStart = earliestStall;
        }
        this.startRecovery(token, entry);
        if (
          !this.state.isHost &&
          typeof this.onRejoin === 'function' &&
          !entry.rejoinNotified &&
          now - entry.failureStart >= this.maxFailure
        ) {
          this.onRejoin('Media connection lost. Rejoining…');
          entry.rejoinNotified = true;
        }
      } else {
        if (entry.failureStart) {
          this.connectionWatchdog?.clearFailure?.();
          this.connectionWatchdog?.clearToast?.();
        }
        entry.failureStart = null;
        entry.rejoinNotified = false;
        this.stopRecovery(token, entry);
      }
    }

    startRecovery(token, entry) {
      if (!entry) return;
      if (!entry.retryTimer) {
        entry.retryCount = 0;
        this.bumpRecovery(token, entry);
        entry.retryTimer = window.setInterval(() => {
          if (!this.entries.has(token)) {
            this.stopRecovery(token, entry);
            return;
          }
          this.bumpRecovery(token, entry);
        }, this.retryInterval);
      }
    }

    stopRecovery(token, entry) {
      const ref = entry || this.entries.get(token);
      if (!ref) return;
      if (ref.retryTimer) {
        clearInterval(ref.retryTimer);
        ref.retryTimer = null;
      }
      ref.retryCount = 0;
    }

    bumpRecovery(token, entry) {
      if (!entry) return;
      if (entry.retryCount >= this.maxRetries) {
        this.failOut(token, entry);
        return;
      }
      entry.retryCount += 1;
      entry.lastSyncAttempt = Date.now();
      this.connectionWatchdog?.showReconnecting('Recovering media…');
      if (typeof this.onRenegotiate === 'function') {
        this.onRenegotiate(token);
      }
    }

    failOut(token, entry) {
      this.stopRecovery(token, entry);
      if (entry) {
        entry.failureStart = null;
        entry.audioStallSince = null;
        entry.videoStallSince = null;
      }
      if (typeof this.onFail === 'function') {
        this.connectionWatchdog?.clearFailure?.();
        this.connectionWatchdog?.clearToast?.();
        this.onFail(token);
      }
    }
  }

  let toneManager;
  let participantManager;
  let controlCenter;
  let directChatManager;
  let directCallManager;
  let chatManager;
  let permissionManager;
  let micControl;
  let cameraControl;
  let screenShareControl;
  let connectionWatchdog;
  let hostMediaSync;

  const playTone = (preset) => {
    const wasHandled = toneManager?.play(preset);
    if (toneManager && toneManager.enabled !== false && wasHandled !== false) {
      return;
    }
    if (!tonePlayer) return;
    if (preset === 'join') {
      tonePlayer.play(880, 0.28);
    } else if (preset === 'leave') {
      tonePlayer.play(520, 0.32);
    } else if (preset === 'hand') {
      tonePlayer.play(940, 0.24);
    }
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
    const participantsOpen = state.activeDrawer === 'participants';
    if (elements.participantsDrawer) {
      elements.participantsDrawer.classList.toggle('open', participantsOpen);
      elements.participantsDrawer.classList.toggle('hidden', !participantsOpen);
      elements.participantsDrawer.setAttribute('aria-hidden', (!participantsOpen).toString());
    }
    const chatOpen = state.activeDrawer === 'chat';
    if (elements.chatOverlay) {
      elements.chatOverlay.classList.toggle('open', chatOpen);
      elements.chatOverlay.classList.toggle('hidden', !chatOpen);
      elements.chatOverlay.setAttribute('aria-hidden', (!chatOpen).toString());
    }
    if (elements.chatDrawer) {
      elements.chatDrawer.setAttribute('aria-hidden', (!chatOpen).toString());
      elements.chatDrawer.classList.toggle('open', chatOpen);
    }
    const showBackdrop = !!state.activeDrawer && state.activeDrawer !== 'chat';
    if (elements.drawerBackdrop) {
      elements.drawerBackdrop.classList.toggle('hidden', !showBackdrop);
    }
    if (elements.chatToggle) {
      elements.chatToggle.setAttribute('aria-pressed', chatOpen.toString());
    }
    if (elements.participantsToggle) {
      elements.participantsToggle.setAttribute('aria-pressed', participantsOpen.toString());
    }
    if (elements.quickChat) {
      elements.quickChat.classList.toggle('is-active', chatOpen);
      elements.quickChat.setAttribute('aria-pressed', chatOpen.toString());
      elements.quickChat.setAttribute('aria-label', chatOpen ? 'Close chat' : 'Open chat');
    }
    chatManager?.setDrawerState(chatOpen);
  };

  const openDrawer = (name) => {
    state.activeDrawer = name;
    syncDrawerState();
    registerOverlayInteraction({ autoHide: false });
  };

  const closeDrawer = () => {
    state.activeDrawer = null;
    syncDrawerState();
    closeMoreMenu();
    registerOverlayInteraction({ autoHide: true });
  };

  const toggleDrawer = (name) => {
    if (state.activeDrawer === name) {
      closeDrawer();
    } else {
      closeMoreMenu();
      openDrawer(name);
    }
  };

  // Make toggleDrawer available globally for ChatManager
  window.toggleDrawer = toggleDrawer;

  const determineFileExtensionFromMime = (mimeType = '') => {
    if (!mimeType || typeof mimeType !== 'string') return 'webm';
    const normalized = mimeType.split(';')[0].trim().toLowerCase();
    const mapping = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-matroska': 'mkv',
      'video/ogg': 'ogg'
    };
    if (mapping[normalized]) {
      return mapping[normalized];
    }
    const [, fallback] = normalized.split('/');
    return fallback || 'webm';
  };

  const buildRecordingFileName = (mimeType) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = determineFileExtensionFromMime(mimeType);
    return `class-${classCode}-recording-${timestamp}.${extension}`;
  };

  const promptLocalDownload = (blob, mimeType) => {
    if (!blob || !blob.size) return null;
    const fileName = buildRecordingFileName(mimeType || blob.type || 'video/webm');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 0);
    return fileName;
  };

  const syncRecordingManager = (recordingState) => {
    if (!state.isHost || !recordingManager.isSupported()) return;
    if (!recordingState?.isRecording) {
      recordingManager.ensureStopped().catch(() => {});
      return;
    }
    if (recordingState.isPaused) {
      recordingManager.ensurePaused().catch(() => {});
    } else {
      recordingManager.ensureResumed().catch(() => {});
    }
  };

  const updateRecordingStatus = () => {
    if (!elements.recordingStatus) return;
    const isRecording = !!state.recording?.isRecording;
    const isPaused = !!state.recording?.isPaused;
    const pending = !!state.recordingUploadPending;
    const uploadStatus = state.uploadStatus || state.recording?.uploadStatus;
    let statusText = 'Recording inactive';
    if (isRecording) {
      statusText = isPaused ? 'Recording paused' : 'Recording in progress…';
    } else if (uploadStatus === 'queued') {
      statusText = 'Video upload queued...';
    } else if (uploadStatus === 'uploading') {
      statusText = 'Uploading video to server...';
    } else if (uploadStatus === 'completed') {
      statusText = 'Video uploaded successfully';
    } else if (uploadStatus === 'failed') {
      statusText = 'Video upload failed';
    }
    elements.recordingStatus.textContent = statusText;
    elements.recordingStatus.classList.toggle('active', isRecording && !isPaused);
    elements.recordingStatus.classList.toggle('paused', isPaused);
    elements.recordingStatus.classList.toggle('uploading', uploadStatus === 'uploading' || uploadStatus === 'queued');
    elements.recordingStatus.classList.toggle('uploaded', uploadStatus === 'completed');
    if (elements.recordingStart) {
      elements.recordingStart.classList.toggle('hidden', !state.isHost || isRecording);
      elements.recordingStart.disabled = pending || !state.isHost || isRecording;
    }
    if (elements.recordingStop) {
      elements.recordingStop.classList.toggle('hidden', !state.isHost || !isRecording);
      elements.recordingStop.disabled = pending || !state.isHost || !isRecording;
    }
    if (elements.recordingPause) {
      elements.recordingPause.classList.toggle('hidden', !state.isHost || !isRecording);
      elements.recordingPause.textContent = isPaused ? 'Resume recording' : 'Pause recording';
      elements.recordingPause.classList.toggle('is-active', isPaused);
      elements.recordingPause.setAttribute('aria-pressed', isPaused.toString());
      elements.recordingPause.setAttribute('aria-label', isPaused ? 'Resume recording' : 'Pause recording');
      elements.recordingPause.disabled = pending || !state.isHost || !isRecording;
    }
    if (elements.quickRecord) {
      const nextLabel = isRecording ? 'Stop' : 'Record';
      const quickLabel = elements.quickRecord.querySelector('.label');
      if (quickLabel) {
        quickLabel.textContent = nextLabel;
      }
      elements.quickRecord.classList.toggle('hidden', !state.isHost);
      elements.quickRecord.classList.toggle('is-active', isRecording);
      elements.quickRecord.setAttribute('aria-pressed', isRecording.toString());
      elements.quickRecord.setAttribute('aria-label', `${isRecording ? 'Stop' : 'Start'} recording`);
      elements.quickRecord.setAttribute('aria-hidden', (!state.isHost).toString());
      elements.quickRecord.disabled = pending || !state.isHost;
      elements.quickRecord.setAttribute('aria-disabled', (pending || !state.isHost).toString());
    }
    if (elements.recordingLink) {
      const link = state.classInfo?.recordingClassLink || state.classInfo?.recordedVideoLink;
      const uploadStatus = state.uploadStatus || state.recording?.uploadStatus;
      
      // Only show download link if upload is completed and link is available
      if (link && uploadStatus === 'completed') {
        elements.recordingLink.classList.remove('hidden');
        elements.recordingLink.innerHTML = `<a href="${link}" target="_blank" rel="noopener">Download recording</a>`;
      } else if (uploadStatus === 'queued' || uploadStatus === 'uploading') {
        // Show upload status instead of download link
        elements.recordingLink.classList.remove('hidden');
        elements.recordingLink.innerHTML = `<span style="color: var(--muted);">Upload in progress, please wait...</span>`;
      } else {
        elements.recordingLink.classList.add('hidden');
        elements.recordingLink.textContent = '';
      }
    }

    // Toggle timer visibility
    if (elements.recordingTimer) {
      elements.recordingTimer.classList.toggle('hidden', !isRecording);
    }
    // Toggle header recording meter
    if (elements.meterRecording) {
      elements.meterRecording.classList.toggle('hidden', !isRecording);
    }
    
    // Toggle blinking recording indicator (visible to all users)
    if (elements.recordingIndicator) {
      elements.recordingIndicator.classList.toggle('hidden', !isRecording);
    }
  };

  const applyRecordingPayload = (payload = {}) => {
    if (!payload) return;
    state.classInfo = state.classInfo || {};
    const recording = payload.recording || payload;
    if (recording) {
      // Fallback: seed startedAt if missing when recording starts client-side
      if (recording.isRecording && !recording.startedAt && !state.recording?.startedAt) {
        recording.startedAt = new Date().toISOString();
      }
      state.recording = { ...recording, isPaused: !!recording.isPaused };
      state.classInfo.recording = state.recording;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'recordedVideoLink')) {
      state.classInfo.recordedVideoLink = payload.recordedVideoLink;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'recordingClassLink')) {
      state.classInfo.recordingClassLink = payload.recordingClassLink;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'uploadStatus')) {
      state.uploadStatus = payload.uploadStatus;
    }
    updateRecordingStatus();
    syncRecordingManager(state.recording);
    updateRecordingTimer();
  };

  // Timers: meeting start and recording elapsed
  let meetingStartInterval = null;
  let recordingTimerInterval = null;

  const formatHMS = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const updateMeetingStartTime = () => {
    const el = elements.meetingStartTime;
    const headerEl = elements.meterMeetingTime;
    if (!el && !headerEl) return;
    const startedAt = state.classInfo?.startedAt || state.classInfo?.startTime || state.classInfo?.createdAt;
    if (!startedAt) {
      if (el) el.textContent = 'Not started';
      if (headerEl) headerEl.textContent = '00:00:00';
      return;
    }
    const started = new Date(startedAt).getTime();
    if (!Number.isFinite(started)) {
      if (el) el.textContent = 'Not started';
      if (headerEl) headerEl.textContent = '00:00:00';
      return;
    }
    const update = () => {
      const diff = Date.now() - started;
      if (el) el.textContent = `Meeting started ${formatHMS(diff)} ago`;
      if (headerEl) headerEl.textContent = formatHMS(diff);
    };
    clearInterval(meetingStartInterval);
    meetingStartInterval = setInterval(update, 1000);
    update();
  };

  const updateRecordingTimer = () => {
    const el = elements.recordingTimer;
    const headerEl = elements.meterRecordingTime;
    if (!el && !headerEl) return;
    const rec = state.recording;
    if (!rec?.isRecording || !rec?.startedAt) {
      if (el) el.textContent = '00:00:00';
      if (headerEl) headerEl.textContent = '00:00:00';
      clearInterval(recordingTimerInterval);
      return;
    }
    const baseStart = new Date(rec.startedAt).getTime();
    if (!Number.isFinite(baseStart)) return;
    const pausedFor = Number(rec.totalPausedMs || 0);
    const update = () => {
      const now = Date.now();
      const effectiveStart = baseStart + pausedFor;
      const diff = Math.max(0, now - effectiveStart);
      if (el) el.textContent = formatHMS(diff);
      if (headerEl) headerEl.textContent = formatHMS(diff);
    };
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = setInterval(update, 1000);
    update();
  };

  // VVD Text Overlay Functions
  const updateVVDOverlay = (text, visible, position) => {
    if (!elements.vvdTextOverlay || !elements.vvdOverlayContent) return;
    
    state.vvdOverlay.text = text || '';
    state.vvdOverlay.visible = visible !== undefined ? visible : state.vvdOverlay.visible;
    state.vvdOverlay.position = position || state.vvdOverlay.position;
    
    elements.vvdOverlayContent.textContent = state.vvdOverlay.text;
    elements.vvdTextOverlay.classList.toggle('hidden', !state.vvdOverlay.visible);
    
    // Update position classes
    elements.vvdTextOverlay.className = elements.vvdTextOverlay.className.replace(/top-left|top-right|bottom-left|bottom-right|center/g, '');
    elements.vvdTextOverlay.classList.add(state.vvdOverlay.position);
  };

  const showVVDOverlay = (text, position) => {
    updateVVDOverlay(text, true, position);
  };

  const hideVVDOverlay = () => {
    updateVVDOverlay(null, false);
  };

  const clearVVDOverlay = () => {
    updateVVDOverlay('', false);
  };

  // Upload function for IndexedDB stored videos
  const uploadFromIndexedDB = async (upload) => {
    try {
      console.log(`📤 Uploading from IndexedDB: ${upload.fileName}`);
      
      // Show toast for background upload
      showLiveToast(`⬆️ Uploading saved recording (attempt ${upload.attempts + 1})...`, { duration: 3000 });
      
      const formData = new FormData();
      formData.append('recording', upload.blob, upload.fileName);
      formData.append('mimeType', upload.mimeType);
      if (upload.durationMs) {
        formData.append('durationMs', String(upload.durationMs));
      }
      formData.append('size', String(upload.size));
      
      const options = { 
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined
      };
      
      const res = await fetch(`/classes/${upload.classCode}/recording/stop`, applyHostAuth(options));
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'Upload failed');
      }
      
      const data = await res.json();
      
      if (data?.uploadStatus === 'queued' || data?.uploadStatus === 'uploading') {
        console.log(`✅ Upload successful: ${upload.fileName}`);
        showLiveToast('✅ Background upload successful!', { duration: 3000 });
        applyRecordingPayload(data);
        return { success: true, data };
      }
      
      return { success: false, error: 'Upload not queued' };
      
    } catch (error) {
      console.error(`❌ Upload failed: ${upload.fileName}`, error);
      showLiveToast(`⚠️ Upload failed - will retry in background`, { duration: 3000 });
      return { success: false, error: error.message };
    }
  };

  const performRecordingAction = async (action, { body = null, headers: customHeaders = {} } = {}) => {
    if (!state.isHost) return null;
    try {
      const options = { 
        method: 'POST',
        // Add timeout for better browser compatibility
        signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined // 60s timeout
      };
      
      if (body instanceof FormData) {
        options.body = body;
        // Don't set Content-Type for FormData - browser will set it with boundary
        if (customHeaders && Object.keys(customHeaders).length) {
          // Only add custom headers that aren't Content-Type
          const filtered = {};
          Object.keys(customHeaders).forEach(key => {
            if (key.toLowerCase() !== 'content-type') {
              filtered[key] = customHeaders[key];
            }
          });
          if (Object.keys(filtered).length) {
            options.headers = filtered;
          }
        }
      } else if (body) {
        const payload = typeof body === 'string' ? body : JSON.stringify(body);
        options.body = payload;
        options.headers = { 'Content-Type': 'application/json', ...customHeaders };
      } else {
        options.body = JSON.stringify({});
        options.headers = { 'Content-Type': 'application/json', ...customHeaders };
      }
      
      const res = await fetch(`/classes/${classCode}/recording/${action}`, applyHostAuth(options));
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || `Unable to ${action} recording`);
      }
      const data = await res.json();
      if (action === 'start') {
        state.classInfo.recordedVideoLink = null;
        state.classInfo.recordingClassLink = null;
      }
      applyRecordingPayload(data);
      return data;
    } catch (error) {
      console.error(`performRecordingAction(${action}) failed:`, error);
      
      // Don't show alert for network errors during retry attempts
      if (!error.message?.includes('retry')) {
        if (action === 'stop') {
          // For stop action, we'll retry - don't alert yet
          console.log('Upload failed, will retry...');
        } else {
          alert(error.message || `Unable to ${action} recording`);
        }
      }
      throw error;
    } finally {
      registerOverlayInteraction({ autoHide: true });
    }
  };

  const startRecordingSession = async () => {
    if (!state.isHost || state.recording?.isRecording || state.recordingUploadPending) return;
    if (!recordingManager.isSupported()) {
      alert('Recording is not supported in this browser. Please try a different device or browser.');
      return;
    }
    state.recordingUploadPending = true;
    updateRecordingStatus();
    let serverAttempted = false;
    try {
      await recordingManager.start();
      serverAttempted = true;
      await performRecordingAction('start');
    } catch (error) {
      console.error('startRecordingSession error', error);
      if (serverAttempted) {
        await recordingManager.stop({ discard: true }).catch(() => {});
      } else {
        alert(error.message || 'Unable to start recording');
      }
    } finally {
      state.recordingUploadPending = false;
      updateRecordingStatus();
    }
  };

  const toggleRecordingPause = async () => {
    if (!state.isHost || !state.recording?.isRecording || state.recordingUploadPending) return;
    const action = state.recording.isPaused ? 'resume' : 'pause';
    state.recordingUploadPending = true;
    updateRecordingStatus();
    try {
      await performRecordingAction(action);
    } catch (error) {
      console.error('toggleRecordingPause error', error);
    } finally {
      state.recordingUploadPending = false;
      updateRecordingStatus();
    }
  };

  const stopRecordingSession = async () => {
    if (!state.isHost || !state.recording?.isRecording || state.recordingUploadPending) return;
    state.recordingUploadPending = true;
    updateRecordingStatus();
    let recordingResult = null;
    if (recordingManager.isSupported()) {
      try {
        recordingResult = await recordingManager.stop();
      } catch (error) {
        console.error('Unable to stop local recorder', error);
        alert(error.message || 'Unable to finalize recording');
      }
    }
    
    // NEW STRATEGY: Save to IndexedDB first, then upload from there
    let savedToIndexedDB = false;
    
    try {
      // Step 1: Save video to persistent storage (IndexedDB)
      if (recordingResult?.blob && recordingResult.blob.size) {
        const mime = recordingResult.mimeType || recordingResult.blob.type || 'video/webm';
        const fileName = buildRecordingFileName(mime);
        
        console.log('💾 Saving video to local storage first...', { 
          fileName, 
          mime, 
          size: recordingResult.blob.size,
          duration: recordingResult.durationMs 
        });
        
        // Save to IndexedDB
        if (window.uploadQueue) {
          try {
            await window.uploadQueue.saveVideo({
              blob: recordingResult.blob,
              fileName,
              mimeType: mime,
              durationMs: recordingResult.durationMs,
              size: recordingResult.blob.size,
              classCode: state.classCode || classCode
            });
            
            savedToIndexedDB = true;
            console.log('✅ Video saved to IndexedDB - will auto-upload in background');
            
            // Show toast notification
            showLiveToast('📹 Recording saved! Uploading in background...', { duration: 3000 });
            
          } catch (indexedDBError) {
            console.error('Failed to save to IndexedDB:', indexedDBError);
          }
        }
      }
      
      // Step 2: Try immediate upload (if IndexedDB save successful, background will handle retries)
      // If not saved to IndexedDB, try immediate upload as fallback
      if (!savedToIndexedDB && recordingResult?.blob) {
        console.log('⚠️ IndexedDB not available, trying direct upload...');
        
        const formData = new FormData();
        const mime = recordingResult.mimeType || recordingResult.blob.type || 'video/webm';
        const fileName = buildRecordingFileName(mime);
        
        formData.append('recording', recordingResult.blob, fileName);
        formData.append('mimeType', mime);
        if (recordingResult.durationMs) {
          formData.append('durationMs', String(recordingResult.durationMs));
        }
        formData.append('size', String(recordingResult.blob.size));
        
        try {
          const response = await performRecordingAction('stop', { body: formData });
          
          if (response?.uploadStatus === 'queued' || response?.uploadStatus === 'uploading') {
            console.log('✅ Direct upload successful');
          }
        } catch (uploadError) {
          console.error('Direct upload failed:', uploadError);
          alert('Unable to upload recording. Please refresh the page to retry.');
        }
      }
      
      // Always try to stop recording on server
      try {
        await performRecordingAction('stop', { body: new FormData() });
      } catch (error) {
        console.error('Server stop failed:', error);
      }
      
    } catch (error) {
      console.error('stopRecordingSession error', error);
    } finally {
      state.recordingUploadPending = false;
      updateRecordingStatus();
      
      // Trigger immediate queue processing
      if (savedToIndexedDB && window.uploadQueue) {
        setTimeout(() => {
          window.uploadQueue.processQueue(uploadFromIndexedDB);
        }, 1000);
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
    controlCenter?.setHandQueue(entries);
  };

  const submitPollVote = async (optionId) => {
    try {
      const res = await fetch(`/classes/${classCode}/polls/vote`, applyHostAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId, joinToken: state.joinToken })
      }));
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
    fetch(
      `/classes/${classCode}/questions/${question.id}`,
      applyHostAuth({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer })
      })
    );
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
    controlCenter?.setParticipants(state.classInfo?.participants || [], {
      lobby: state.lobby,
      mediaStates: state.mediaStates,
      raised: state.raisedHands,
      quality: participantQuality
    });
  };

  const notifyAutoJoinUpdate = () => {
    const roster = Array.isArray(state.classInfo?.autoJoinRoster)
      ? state.classInfo.autoJoinRoster
      : [];
    const participants = Array.isArray(state.classInfo?.participants)
      ? state.classInfo.participants
      : [];
    const entries = roster.map((entry) => {
      const match = participants.find((participant) => participant.autoJoinId === entry.studentId);
      const name = entry.displayName || match?.displayName || `Student ${entry.studentId}`;
      return {
        studentId: entry.studentId,
        displayName: name,
        joined: Boolean(match)
      };
    });
    const detail = {
      entries,
      total: entries.length
    };
    window.__autoJoinState = detail;
    window.dispatchEvent(new CustomEvent('auto-join:update', { detail }));
  };

  const getTotalParticipantsCount = () => {
    const participants = Array.isArray(state.classInfo?.participants)
      ? state.classInfo.participants.length
      : 0;
    const hostCount = state.classInfo?.host ? 1 : 0;
    return participants + hostCount;
  };

  const updateMeetingStats = () => {
    const total = getTotalParticipantsCount();
    if (elements.meetingParticipantCount) {
      elements.meetingParticipantCount.textContent = total.toString();
    }
    if (elements.meetingParticipantStat) {
      elements.meetingParticipantStat.classList.toggle('active', total > 0);
    }
    const audioEnabled = !!state.localStream?.getTracks()?.some((track) => track.kind === 'audio' && track.enabled);
    if (elements.meetingMicStatus) {
      elements.meetingMicStatus.textContent = audioEnabled ? 'Mic on' : 'Mic off';
    }
    if (elements.meetingMicStat) {
      elements.meetingMicStat.classList.toggle('active', audioEnabled);
    }
  };

  const isStreamActive = (stream) => {
    if (!stream || typeof stream.getTracks !== 'function') {
      return false;
    }
    return stream.getTracks().some((track) => track.readyState === 'live');
  };

  const hideOverlayControls = () => {
    if (state.controlsTimer) {
      window.clearTimeout(state.controlsTimer);
      state.controlsTimer = null;
    }
    if (!elements.meetingShell) return;
    elements.meetingShell.classList.add('controls-hidden');
    elements.meetingShell.classList.remove('controls-visible');
    state.controlsVisible = false;
  };

  const ensureOverlayControlsVisible = ({ autoHide = true } = {}) => {
    if (!elements.meetingShell) return;
    elements.meetingShell.classList.add('controls-visible');
    elements.meetingShell.classList.remove('controls-hidden');
    state.controlsVisible = true;
    if (state.controlsTimer) {
      window.clearTimeout(state.controlsTimer);
      state.controlsTimer = null;
    }
    if (autoHide && !state.activeDrawer) {
      const delay = typeof state.controlsHideDelay === 'number' ? state.controlsHideDelay : 1000;
      if (delay > 0) {
        state.controlsTimer = window.setTimeout(() => {
          state.controlsTimer = null;
          hideOverlayControls();
        }, delay);
      }
    }
  };

  const registerOverlayInteraction = ({ autoHide = true } = {}) => {
    ensureOverlayControlsVisible({ autoHide });
  };

  const applyRoleStyling = () => {
    document.body.classList.toggle('is-host', !!state.isHost);
    document.body.classList.toggle('is-student', !state.isHost);
    if (elements.meetingShell) {
      elements.meetingShell.classList.toggle('viewer-autohide', !state.isHost);
    }
    if (state.isHost) {
      state.controlsHideDelay = 0;
      ensureOverlayControlsVisible({ autoHide: false });
    } else {
      state.controlsHideDelay = isMobileDevice() ? 2200 : 1800;
      ensureOverlayControlsVisible({ autoHide: true });
    }
  };

  const computeViewportLayout = () => {
    if (typeof window === 'undefined') {
      return 'landscape';
    }
    const docEl = typeof document !== 'undefined' ? document.documentElement : null;
    const width = window.innerWidth || docEl?.clientWidth || 0;
    const height = window.innerHeight || docEl?.clientHeight || 0;
    if (!width) {
      return 'landscape';
    }
    if (width <= 960) {
      return 'portrait';
    }
    if (height > width && width <= 1280) {
      return 'portrait';
    }
    return 'landscape';
  };

  const applyMeetingShellLayout = (layout) => {
    if (!elements.meetingShell) return;
    elements.meetingShell.classList.toggle('layout-portrait', layout === 'portrait');
    elements.meetingShell.classList.toggle('layout-landscape', layout !== 'portrait');
  };

  const syncViewportLayout = ({ force = false } = {}) => {
    const desired = computeViewportLayout();
    if (!force && state.layout === desired) {
      return desired;
    }
    state.layout = desired;
    applyMeetingShellLayout(desired);
    return desired;
  };

  const setLayout = () => {
    const activeLayout = syncViewportLayout({ force: true });
    if (elements.layoutLandscape) {
      elements.layoutLandscape.classList.toggle('is-active', activeLayout === 'landscape');
      elements.layoutLandscape.setAttribute('aria-pressed', activeLayout === 'landscape' ? 'true' : 'false');
    }
    if (elements.layoutPortrait) {
      elements.layoutPortrait.classList.toggle('is-active', activeLayout === 'portrait');
      elements.layoutPortrait.setAttribute('aria-pressed', activeLayout === 'portrait' ? 'true' : 'false');
    }
    if (elements.quickOrientation) {
      const label = elements.quickOrientation.querySelector('.label');
      if (label) {
        label.textContent = activeLayout === 'portrait' ? 'Portrait' : 'Landscape';
      }
      delete elements.quickOrientation.dataset.target;
    }
  };

  const renderParticipants = () => {
    if (!elements.participantsList || !state.classInfo) return;
    const participants = state.classInfo.participants || [];
    elements.participantsList.innerHTML = '';
    participantManager?.updateParticipants(participants);
    directChatManager?.setParticipants(participants);
    controlCenter?.setParticipants(participants, {
      lobby: state.lobby,
      mediaStates: state.mediaStates,
      raised: state.raisedHands,
      quality: participantQuality
    });

    const buildMediaBadge = (icon, active) => {
      const span = document.createElement('span');
      span.className = `media-chip ${active ? 'on' : 'off'}`;
      span.textContent = icon;
      return span;
    };

    updateMeetingStats();

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
      if (participant.autoJoinId) {
        li.classList.add('auto-joined');
      }
      const identity = document.createElement('div');
      identity.className = 'identity';
      const strong = document.createElement('strong');
      strong.textContent = participant.displayName;
      identity.appendChild(strong);
      if (participant.autoJoinId) {
        const tag = document.createElement('span');
        tag.className = 'participant-tag auto';
        tag.textContent = 'Auto-joined';
        identity.appendChild(tag);
      }
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
    remoteStreamCache.delete(id);
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

  const rememberCameraPreference = (stream) => {
    if (!stream) return;
    const [track] = stream.getVideoTracks ? stream.getVideoTracks() : [];
    if (!track || typeof track.getSettings !== 'function') return;
    const settings = track.getSettings();
    const { deviceId = null, facingMode = null } = settings || {};
    const previousFacing = state.preferredCamera?.facingMode || null;
    state.preferredCamera = {
      deviceId: deviceId || null,
      facingMode: facingMode || previousFacing
    };
    updateQuickCameraButton().catch(() => {});
  };

  const refreshAvailableCameras = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      state.availableCameras = [];
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.availableCameras = devices.filter((device) => device.kind === 'videoinput');
      updateQuickCameraButton(state.availableCameras).catch(() => {});
      return state.availableCameras;
    } catch (error) {
      console.warn('enumerateDevices failed', error);
      state.availableCameras = [];
      updateQuickCameraButton([]).catch(() => {});
      return [];
    }
  };

  const getAvailableCameras = async (force = false) => {
    if (!force && Array.isArray(state.availableCameras) && state.availableCameras.length) {
      return state.availableCameras;
    }
    return refreshAvailableCameras();
  };

  const describeCameraPreference = (preference) => {
    if (!preference) return 'Switch camera';
    if (preference.facingMode === 'environment') {
      return 'Switch to back camera';
    }
    if (preference.facingMode === 'user') {
      return 'Switch to front camera';
    }
    return 'Switch camera';
  };

  const determineNextCameraPreference = async (devices) => {
    const cameraDevices = devices || (await getAvailableCameras());
    const currentTrack = state.localStream?.getVideoTracks()?.[0];
    const settings = currentTrack && typeof currentTrack.getSettings === 'function' ? currentTrack.getSettings() : {};
    const currentDeviceId = settings?.deviceId || state.preferredCamera?.deviceId || null;
    if (cameraDevices.length > 1) {
      const currentIndex = cameraDevices.findIndex((device) => device.deviceId === currentDeviceId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cameraDevices.length : 0;
      const target = cameraDevices[nextIndex];
      return target ? { deviceId: target.deviceId, facingMode: null } : null;
    }
    const currentFacing =
      settings?.facingMode ||
      state.preferredCamera?.facingMode ||
      (isMobileDevice() ? 'environment' : null);
    if (!currentFacing && !isMobileDevice()) {
      return null;
    }
    const nextFacing = currentFacing === 'environment' ? 'user' : 'environment';
    return { deviceId: null, facingMode: nextFacing };
  };

  const updateQuickCameraButton = async (devices) => {
    if (!elements.quickCamera) return;
    let list = devices;
    if (!Array.isArray(list)) {
      list = await getAvailableCameras();
    }
    const preference = await determineNextCameraPreference(list);
    const hasEnvironmentCamera = Array.isArray(list)
      ? list.some((device) => /back|rear|environment/i.test(device.label || ''))
      : false;
    const shouldShow = !!preference && isMobileDevice() && (hasEnvironmentCamera || (list?.length || 0) > 1);
    elements.quickCamera.classList.toggle('hidden', !shouldShow);
    elements.quickCamera.setAttribute('aria-hidden', (!shouldShow).toString());
  };

  const handleCameraMenuResize = () => closeCameraMenu();

  const syncCameraMenuOptions = async (options = {}) => {
    if (!elements.cameraMenu) return;
    const toggleBtn = elements.cameraMenuToggle;
    if (toggleBtn) {
      const videoEnabled = isTrackEnabled('video');
      toggleBtn.textContent = videoEnabled ? 'Turn camera off' : 'Turn camera on';
      const canToggle = cameraControl?.canInteract ? cameraControl.canInteract(options) : true;
      toggleBtn.disabled = !canToggle;
      toggleBtn.setAttribute('aria-disabled', (!canToggle).toString());
    }
    const switchBtn = elements.cameraMenuSwitch;
    if (switchBtn) {
      const devices = await getAvailableCameras(true);
      const preference = await determineNextCameraPreference(devices);
      const canSwitch = !!preference;
      switchBtn.textContent = describeCameraPreference(preference);
      switchBtn.disabled = !canSwitch;
      switchBtn.setAttribute('aria-disabled', (!canSwitch).toString());
    }
  };

  const closeCameraMenu = (returnFocus = false) => {
    const context = state.cameraMenuContext;
    if (!context) return;
    const menu = elements.cameraMenu;
    if (menu) {
      menu.classList.add('hidden');
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
      menu.removeAttribute('data-position');
    }
    if (state.cameraMenuDismiss) {
      document.removeEventListener('click', state.cameraMenuDismiss);
      state.cameraMenuDismiss = null;
    }
    if (state.cameraMenuKeyHandler) {
      document.removeEventListener('keydown', state.cameraMenuKeyHandler);
      state.cameraMenuKeyHandler = null;
    }
    if (state.cameraMenuResizeAttached) {
      window.removeEventListener('resize', handleCameraMenuResize);
      state.cameraMenuResizeAttached = false;
    }
    const { button } = context;
    if (button) {
      button.classList.remove('menu-open');
      button.setAttribute('aria-expanded', 'false');
      if (returnFocus) {
        button.focus({ preventScroll: true });
      }
    }
    state.cameraMenuContext = null;
  };

  const openCameraMenu = async (button, options = {}) => {
    if (!button || !elements.cameraMenu) return;
    state.cameraMenuContext = { button, options };
    await syncCameraMenuOptions(options);
    const rect = button.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const menu = elements.cameraMenu;
    menu.style.left = `${rect.left + rect.width / 2 + scrollX}px`;
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      const bounds = menu.getBoundingClientRect();
      let top = rect.top + scrollY - bounds.height - 12;
      let position = 'top';
      if (top < scrollY + 12) {
        top = rect.bottom + 12 + scrollY;
        position = 'bottom';
      }
      menu.style.top = `${top}px`;
      menu.dataset.position = position;
      menu.classList.add('open');
    });
    button.classList.add('menu-open');
    button.setAttribute('aria-expanded', 'true');
    const focusTarget = menu.querySelector('button:not(:disabled)');
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
    }
    state.cameraMenuDismiss = (event) => {
      const target = event.target;
      if (!menu.contains(target) && !button.contains(target)) {
        closeCameraMenu();
      }
    };
    state.cameraMenuKeyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCameraMenu(true);
      }
    };
    document.addEventListener('click', state.cameraMenuDismiss);
    document.addEventListener('keydown', state.cameraMenuKeyHandler);
    if (!state.cameraMenuResizeAttached) {
      window.addEventListener('resize', handleCameraMenuResize);
      state.cameraMenuResizeAttached = true;
    }
  };

  const installCameraMenu = (button, options = {}) => {
    if (!button) return;
    if (button.dataset.cameraMenuBound === '1') return;
    button.dataset.cameraMenuBound = '1';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.cameraMenuContext?.button === button) {
        closeCameraMenu();
        return;
      }
      await openCameraMenu(button, options);
    });
  };

  const switchCameraSource = async () => {
    if (!permissionManager) {
      showLiveToast('Camera controls unavailable');
      return false;
    }
    const devices = await getAvailableCameras(true);
    const nextPreference = await determineNextCameraPreference(devices);
    if (!nextPreference) {
      showLiveToast('No other camera detected', { duration: 2200 });
      return false;
    }
    state.preferredCamera = nextPreference;
    const hadAudioTracks = !!state.localStream?.getAudioTracks()?.length;
    const audioEnabled = isTrackEnabled('audio');
    const videoEnabled = isTrackEnabled('video');
    const stream = await permissionManager.acquireStream({ audio: hadAudioTracks, video: true, replace: true });
    if (!stream) {
      showLiveToast('Unable to switch camera', { duration: 2200 });
      return false;
    }
    setMediaTrackState('audio', audioEnabled, {
      skipEmit: true,
      skipButtons: true,
      suppressBanner: true
    });
    setMediaTrackState('video', videoEnabled, { skipEmit: true, skipButtons: true });
    syncTrackButtons();
    emitMediaUpdate();
    showLiveToast('Switched camera', { duration: 1600 });
    return true;
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
    rememberCameraPreference(stream);
    refreshAvailableCameras().catch(() => {});
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
            .then(() => configureSenderParameters(sender, { track }))
            .catch((error) => console.warn('replaceTrack error', error));
        } else {
          try {
            addConfiguredTrack(pc, track, stream);
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

  const setupPreview = async ({ force = false } = {}) => {
    const hasLive = isStreamActive(state.localStream);
    if (!force && state.previewReady && state.localStream && hasLive) {
      return state.localStream;
    }
    if (!permissionManager) {
      return state.localStream || null;
    }
    state.previewReady = true;
    const current = state.localStream;
    const hadAudioTracks = (current?.getAudioTracks()?.length || 0) > 0 || state.isHost;
    let hadVideoTracks = (current?.getVideoTracks()?.length || 0) > 0 || state.isHost || !current;
    if (!hadAudioTracks && !hadVideoTracks) {
      hadVideoTracks = true;
    }
    const stream = await permissionManager.acquireStream({
      audio: hadAudioTracks,
      video: hadVideoTracks,
      replace: true
    });
    if (!stream && current && hasLive) {
      return current;
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
    if (elements.emailInvite) {
      elements.emailInvite.dataset.link = state.classInfo.meetingLink;
    }
    refreshStage();
  };

  const loadClass = async () => {
    const res = await fetch(`/classes/${classCode}`, applyHostAuth());
    if (!res.ok) throw new Error('Failed to load class');
    state.classInfo = await res.json();
    if (!state.hostToken && state.classInfo.hostAccessToken) {
      state.hostToken = state.classInfo.hostAccessToken;
      persistHostToken(state.hostToken);
    }
    state.whiteboard.strokes = (state.classInfo.whiteboard?.strokes || []).map((stroke) => ({
      ...stroke,
      path: Array.isArray(stroke.path) ? stroke.path : []
    }));
    state.activePoll = state.classInfo.activePoll || null;
    state.pollHistory = state.classInfo.pollHistory || [];
    state.questions = state.classInfo.questions || [];
    state.recording = state.classInfo.recording || { isRecording: false, isPaused: false };
    // Fallback: seed meeting startedAt if missing
    if (!state.classInfo.startedAt) {
      state.classInfo.startedAt = state.classInfo.startedAt || state.classInfo.startTime || state.classInfo.createdAt || new Date().toISOString();
    }
    // Initialize timers for meeting and recording
    try { updateMeetingStartTime(); } catch (_) {}
    try { updateRecordingTimer(); } catch (_) {}
    applyMediaState('host', state.classInfo.hostMediaState || { audio: false, video: false });
    (state.classInfo.participants || []).forEach((participant) => {
      applyMediaState(participant.token, participant.mediaState);
    });
    participantManager?.updateParticipants(state.classInfo.participants || []);
    directChatManager?.setParticipants(state.classInfo.participants || []);
    controlCenter?.setParticipants(state.classInfo.participants || [], {
      lobby: state.lobby,
      mediaStates: state.mediaStates,
      raised: state.raisedHands,
      quality: participantQuality
    });
    updateMeetingMeta();
    renderParticipants();
    renderWhiteboard();
    renderPolls();
    renderQna();
    updateRecordingStatus();
    refreshStage();
    notifyAutoJoinUpdate();
  };

  const loadUser = async () => {
    try {
      const res = await fetch('/auth/me');
      if (!res.ok) return;
      state.user = await res.json();
      const normalizedRole = (state.user?.role || '').trim().toLowerCase();
      if (normalizedRole && !state.roleHint) {
        state.roleHint = normalizedRole;
      }
    } catch (error) {
      state.user = null;
    }
  };

  const connectSocket = () => {
    if (state.socket) return;
    state.socket = io();
    directChatManager?.attachSocket(state.socket);
    directCallManager?.attachSocket(state.socket);

    state.socket.on('connect', () => {
      connectionWatchdog?.clearFailure();
      connectionWatchdog?.notifySocketRecovered();
      state.socket.emit(
        'session:join',
        {
          classCode,
          token: getStoredToken(),
          joinToken: state.joinToken,
          displayName: elements.nameInput?.value || state.user?.name,
          hostToken: state.hostToken || undefined
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
          directChatManager?.setSelfToken(state.joinToken);
          directCallManager?.setSelfToken(state.joinToken);
          hideRejoinPrompt();
          clearReconnectTimer();
          state.isHost = response.role === 'host';
          applyRoleStyling();
          permissionManager?.configureRole(state.isHost);
          participantManager?.setIsHost(state.isHost);
          controlCenter?.setHost(state.isHost);
          updateRecordingStatus();
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
      directChatManager?.updatePresence(participant.token, true);
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
      directChatManager?.updatePresence(joinToken, false);
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

    state.socket.on('class:started', ({ autoJoinees } = {}) => {
      state.classInfo.status = 'live';
      if (!Array.isArray(state.classInfo.autoJoinRoster)) {
        state.classInfo.autoJoinRoster = [];
      }
      if (!Array.isArray(state.classInfo.participants)) {
        state.classInfo.participants = [];
      }
      if (!Array.isArray(state.classInfo.autoJoineeIds)) {
        state.classInfo.autoJoineeIds = [];
      }
      if (Array.isArray(autoJoinees)) {
        autoJoinees.forEach((entry) => {
          if (!entry?.token) {
            return;
          }
          const existingParticipant = state.classInfo.participants.find((p) => p.token === entry.token);
          if (!existingParticipant) {
            state.classInfo.participants.push({
              displayName: entry.displayName || 'Participant',
              token: entry.token,
              autoJoinId: entry.autoJoinId,
              mediaState: { audio: false, video: false }
            });
          }
          if (entry.autoJoinId && !state.classInfo.autoJoinRoster.some((item) => item.studentId === entry.autoJoinId)) {
            state.classInfo.autoJoinRoster.push({
              studentId: entry.autoJoinId,
              displayName: entry.displayName || 'Participant',
              joinToken: entry.token
            });
          }
          if (entry.autoJoinId && !state.classInfo.autoJoineeIds.includes(entry.autoJoinId)) {
            state.classInfo.autoJoineeIds.push(entry.autoJoinId);
          }
        });
        notifyAutoJoinUpdate();
      }
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

    state.socket.on('class:ended', async () => {
      if (state.isHost && state.recording?.isRecording) {
        try {
          await stopRecordingSession();
        } catch (error) {
          console.error('Failed to finalize recording after class ended', error);
        }
      }
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

    state.socket.on('direct:chat:new', (message) => {
      directChatManager?.appendMessage(message);
    });
    state.socket.on('direct:chat:seen', ({ from, messageIds = [] }) => {
      directChatManager?.resetCounts(from, messageIds);
    });
    state.socket.on('direct:call:ring', (payload) => {
      directCallManager?.handleRing(payload);
    });
    state.socket.on('direct:call:cancelled', (payload) => {
      directCallManager?.handleCancel(payload);
    });
    state.socket.on('direct:call:response', (payload) => {
      directCallManager?.handleResponse(payload);
    });
    state.socket.on('direct:call:signal', (payload) => {
      directCallManager?.handleSignal(payload);
    });
    state.socket.on('direct:call:ended', (payload) => {
      directCallManager?.handleEnd(payload);
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

    state.socket.on('host:state', (mediaState = {}) => {
      applyMediaState('host', mediaState);
      if (state.classInfo) {
        state.classInfo.hostMediaState = mediaState;
      }
      if (!state.isHost) {
        hostMediaSync?.refreshExpectation?.();
      }
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
      applyRecordingPayload(payload);
    });

    state.socket.on('vvd:overlay', (payload) => {
      if (!payload) return;
      updateVVDOverlay(payload.text, payload.visible, payload.position);
    });

    state.socket.on('upload:status', (payload) => {
      if (!payload) return;
      state.uploadStatus = payload.status;
      if (payload.uploadUrl) {
        state.classInfo.recordedVideoLink = payload.uploadUrl;
        state.classInfo.recordingClassLink = payload.uploadUrl;
      }
      updateRecordingStatus();
      
      // Show toast notifications for upload progress
      if (payload.status === 'queued') {
        showLiveToast('📤 Video queued for upload...', { duration: 2000 });
      } else if (payload.status === 'uploading') {
        showLiveToast('⬆️ Uploading video to server...', { duration: 3000 });
      } else if (payload.status === 'completed') {
        console.log('Video uploaded successfully:', payload.uploadUrl);
        showLiveToast('✅ Video uploaded successfully!', { duration: 3000 });
      } else if (payload.status === 'failed') {
        console.error('Video upload failed:', payload.error);
        showLiveToast('❌ Video upload failed - will retry automatically', { duration: 4000 });
      }
    });

    state.socket.on('recording:uploaded', (payload) => {
      if (!payload) return;
      state.classInfo.recordedVideoLink = payload.recordedVideoLink;
      state.classInfo.recordingClassLink = payload.recordingClassLink;
      state.uploadStatus = 'completed';
      updateRecordingStatus();
      showLiveToast('🎬 Recording ready for download!', { duration: 3000 });
    });

    state.socket.on('webrtc:signal', handleSignal);
  };

  const isFullscreen = () => {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || 
              document.mozFullScreenElement || document.msFullscreenElement);
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
      console.log('✅ Exited fullscreen mode');
      showLiveToast('🖥️ Exited fullscreen mode', { duration: 2000 });
    } catch (error) {
      console.log('Exit fullscreen failed:', error);
    }
  };

  const requestFullscreen = async () => {
    try {
      const elem = document.documentElement;
      
      // Check if already in fullscreen
      if (isFullscreen()) {
        console.log('Already in fullscreen mode');
        return;
      }
      
      // Request fullscreen with browser compatibility
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen(); // Safari
      } else if (elem.mozRequestFullScreen) {
        await elem.mozRequestFullScreen(); // Firefox
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen(); // IE/Edge
      }
      
      console.log('✅ Entered fullscreen mode');
      showLiveToast('🖥️ Entered fullscreen mode', { duration: 2000 });
    } catch (error) {
      console.log('Fullscreen request failed or denied:', error);
      // Don't show error to user - they might have denied permission
    }
  };

  const toggleFullscreen = async () => {
    if (isFullscreen()) {
      await exitFullscreen();
    } else {
      await requestFullscreen();
    }
  };

  const updateFullscreenButton = () => {
    const fullscreenBtn = document.getElementById('toggle-fullscreen');
    const fullscreenText = document.getElementById('fullscreen-text');
    const quickFullscreenBtn = document.getElementById('quick-fullscreen');
    
    const inFullscreen = isFullscreen();
    
    // Update menu button
    if (fullscreenBtn && fullscreenText) {
      fullscreenText.textContent = inFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
      fullscreenBtn.setAttribute('aria-pressed', inFullscreen.toString());
    }
    
    // Update quick button in top-left
    if (quickFullscreenBtn) {
      quickFullscreenBtn.setAttribute('aria-pressed', inFullscreen.toString());
      quickFullscreenBtn.setAttribute('title', inFullscreen ? 'Exit fullscreen (ESC)' : 'Enter fullscreen (F11)');
      quickFullscreenBtn.setAttribute('aria-label', inFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
      
      if (inFullscreen) {
        quickFullscreenBtn.classList.add('in-fullscreen');
      } else {
        quickFullscreenBtn.classList.remove('in-fullscreen');
      }
    }
  };

  const beginCall = async () => {
    if (!isStreamActive(state.localStream)) {
      await setupPreview({ force: true });
    }
    if (state.isHost) {
      (state.classInfo.participants || []).forEach((p) => {
        createPeerConnection(p.token, true);
      });
    } else {
      createPeerConnection('host', true);
    }
    
    // Auto-enter fullscreen when call begins
    setTimeout(() => {
      requestFullscreen();
    }, 500); // Small delay to ensure UI is ready
  };

  const leaveSession = () => {
    state.peers.forEach((pc, key) => {
      hostMediaSync?.unregister?.(key);
      pc.close();
    });
    state.peers.clear();
    remoteStreamCache.clear();
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
    participantQuality.clear();
    peerStatsIntervals.forEach((timer) => clearInterval(timer));
    peerStatsIntervals.clear();
    peerStatsSamples.clear();
    state.mediaStates.clear();
    state.mediaStates.set('host', { audio: false, video: false });
    hostMediaSync?.refreshExpectation?.();
    state.previewReady = false;
    state.recordingUploadPending = false;
    recordingManager.ensureStopped().catch(() => {});
  };

  const createPeerConnection = (targetToken, initiator = false) => {
    if (!targetToken || state.peers.has(targetToken)) return state.peers.get(targetToken);

    const pc = new RTCPeerConnection(rtcConfig);
    hostMediaSync?.register(targetToken, pc);
    state.peers.set(targetToken, pc);
    updateParticipantQuality(targetToken, 'connecting');
    connectionWatchdog?.watchPeer(pc);

    if (state.isHost && state.localStream) {
      state.localStream.getTracks().forEach((track) => {
        addConfiguredTrack(pc, track, state.localStream);
      });
    }
    if (state.isHost && state.screenStream) {
      state.screenStream.getTracks().forEach((track) => {
        const sender = addConfiguredTrack(pc, track, state.screenStream, { isScreen: true });
        if (sender) {
          state.screenSenders.push({ pc, sender, token: targetToken, track });
        }
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
      let stream = event.streams && event.streams[0];
      if (!stream) {
        const cached = remoteStreamCache.get(targetToken) || new MediaStream();
        if (event.track && !cached.getTracks().some((track) => track.id === event.track.id)) {
          cached.addTrack(event.track);
        }
        remoteStreamCache.set(targetToken, cached);
        stream = cached;
      } else {
        remoteStreamCache.set(targetToken, stream);
      }
      if (!stream) return;
      attachStream(targetToken, stream, getNameByToken(targetToken));
      if (event.track && typeof event.track.addEventListener === 'function') {
        event.track.addEventListener('ended', () => {
          const cached = remoteStreamCache.get(targetToken);
          if (cached) {
            cached.removeTrack(event.track);
            if (cached.getTracks().length === 0) {
              remoteStreamCache.delete(targetToken);
            }
          }
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
      participantQuality.delete(targetToken);
      stopPeerStatsMonitor(targetToken);
      hostMediaSync?.unregister(targetToken);
      remoteStreamCache.delete(targetToken);
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
        startPeerStatsMonitor(targetToken, pc);
      } else if (stateValue === 'disconnected') {
        scheduleRecovery();
        schedulePeerRecovery(targetToken, 'disconnected');
        stopPeerStatsMonitor(targetToken);
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
        stopPeerStatsMonitor(targetToken);
      } else if (stateValue === 'closed') {
        clearPeerRecovery(targetToken);
        teardownPeer();
        stopPeerStatsMonitor(targetToken);
      }
      updateParticipantQuality(targetToken, { status: stateValue });
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
          applyPreferredCodecs(pc);
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
      applyPreferredCodecs(pc);
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
          state.localStream.getTracks().forEach((track) => {
            addConfiguredTrack(pc, track, state.localStream);
          });
        }
        applyPreferredCodecs(pc);
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
    await fetch(
      `/classes/${classCode}/admit`,
      applyHostAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinToken: token })
      })
    );

    notifyAutoJoinUpdate();
  };

  const removeParticipant = async (token) => {
    await fetch(
      `/classes/${classCode}/remove`,
      applyHostAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinToken: token })
      })
    );
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
      const res = await fetch(
        `/classes/${classCode}/join`,
        applyHostAuth({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: state.savedDisplayName })
        })
      );
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
    const res = await fetch(
      `/classes/${classCode}/join`,
      applyHostAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName })
      })
    );
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
    const res = await fetch(`/classes/${classCode}/start`, applyHostAuth({ method: 'PATCH' }));
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
    if (state.isHost && state.recording?.isRecording) {
      try {
        await stopRecordingSession();
      } catch (error) {
        console.error('Failed to stop recording before ending class', error);
      }
    }
    await fetch(`/classes/${classCode}/end`, applyHostAuth({ method: 'PATCH' }));
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

  elements.returnDashboard?.addEventListener('click', (event) => {
    const bridge = window.ReactNativeWebView;
    const canPostMessage = bridge && typeof bridge.postMessage === 'function';
    if (!canPostMessage) {
      return;
    }
    event.preventDefault();
    const role = resolveRoleHint();
    const targetScreen = determineDashboardTarget(role);
    const payload = {
      type: 'NAVIGATE_DASHBOARD',
      role,
      targetScreen
    };
    try {
      bridge.postMessage(JSON.stringify(payload));
    } catch (error) {
      const fallbackHref = event.currentTarget.getAttribute('href') || '/';
      window.location.assign(fallbackHref);
    }
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

  elements.emailInvite?.addEventListener('click', (e) => {
    const link = elements.copyLink?.dataset.link || e.currentTarget.dataset.link || window.location.href;
    const subject = encodeURIComponent('Join my class');
    const emailLines = ['Hi,', '', `Join the class here: ${link}`, '', 'See you there!'];
    const body = encodeURIComponent(emailLines.join('\n'));
    const target = `mailto:?subject=${subject}&body=${body}`;
    window.location.href = target;
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
    const res = await fetch(
      `/classes/${classCode}/polls`,
      applyHostAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, options })
      })
    );
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
    await fetch(`/classes/${classCode}/polls/close`, applyHostAuth({ method: 'POST' }));
  });

  elements.qnaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = elements.qnaInput.value.trim();
    if (!question) return;
    const res = await fetch(
      `/classes/${classCode}/questions`,
      applyHostAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, joinToken: state.joinToken })
      })
    );
    if (res.ok) {
      elements.qnaInput.value = '';
    }
  });

  elements.recordingStart?.addEventListener('click', () => {
    if (!state.isHost) return;
    startRecordingSession().catch(() => {});
  });

  elements.recordingPause?.addEventListener('click', () => {
    if (!state.isHost || !state.recording?.isRecording) return;
    toggleRecordingPause().catch(() => {});
  });

  elements.recordingStop?.addEventListener('click', () => {
    if (!state.isHost) return;
    stopRecordingSession().catch(() => {});
  });

  // VVD Overlay Event Listeners
  elements.vvdOverlayShow?.addEventListener('click', () => {
    if (!state.isHost) return;
    const text = elements.vvdOverlayText?.value?.trim() || '';
    const position = elements.vvdOverlayPosition?.value || 'bottom-right';
    if (text) {
      showVVDOverlay(text, position);
      // Broadcast to all participants
      state.socket.emit('vvd:overlay', {
        text,
        visible: true,
        position
      });
    }
  });

  elements.vvdOverlayHide?.addEventListener('click', () => {
    if (!state.isHost) return;
    hideVVDOverlay();
    // Broadcast to all participants
    state.socket.emit('vvd:overlay', {
      text: state.vvdOverlay.text,
      visible: false,
      position: state.vvdOverlay.position
    });
  });

  elements.vvdOverlayClear?.addEventListener('click', () => {
    if (!state.isHost) return;
    clearVVDOverlay();
    elements.vvdOverlayText.value = '';
    // Broadcast to all participants
    state.socket.emit('vvd:overlay', {
      text: '',
      visible: false,
      position: state.vvdOverlay.position
    });
  });

  elements.quickRecord?.addEventListener('click', () => {
    if (!state.isHost || state.recordingUploadPending) return;
    registerOverlayInteraction({ autoHide: true });
    if (state.recording?.isRecording) {
      stopRecordingSession().catch(() => {});
    } else {
      startRecordingSession().catch(() => {});
    }
  });

  elements.quickCamera?.addEventListener('click', async () => {
    registerOverlayInteraction({ autoHide: true });
    await switchCameraSource();
  });

  if (elements.quickOrientation && !elements.quickOrientation.classList.contains('hidden')) {
    elements.quickOrientation.addEventListener('click', () => {
      registerOverlayInteraction({ autoHide: true });
    });
  }

  elements.quickChat?.addEventListener('click', () => {
    if (state.activeDrawer === 'chat') {
      closeDrawer();
    } else {
      openDrawer('chat');
    }
  });

  elements.floatingControls?.addEventListener('pointerenter', () => registerOverlayInteraction({ autoHide: false }));
  elements.floatingControls?.addEventListener('pointerleave', () => registerOverlayInteraction({ autoHide: true }));
  elements.floatingControls?.addEventListener('focusin', () => registerOverlayInteraction({ autoHide: false }));
  elements.floatingControls?.addEventListener('focusout', () => registerOverlayInteraction({ autoHide: true }));
  elements.meetingControls?.addEventListener('pointerenter', () => registerOverlayInteraction({ autoHide: false }));
  elements.meetingControls?.addEventListener('pointerleave', () => registerOverlayInteraction({ autoHide: true }));
  elements.meetingControls?.addEventListener('focusin', () => registerOverlayInteraction({ autoHide: false }));
  elements.meetingControls?.addEventListener('focusout', () => registerOverlayInteraction({ autoHide: true }));

  elements.stage?.addEventListener('pointerdown', (event) => {
    if (state.activeDrawer) return;
    if (event.target.closest('.floating-controls') || event.target.closest('.meeting-controls')) {
      return;
    }
    registerOverlayInteraction({ autoHide: true });
  });

  elements.chatOverlay?.addEventListener('click', (event) => {
    if (event.target === elements.chatOverlay || event.target?.dataset?.dismiss === 'chat') {
      closeDrawer();
    }
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
    closeCameraMenu();
    syncViewportLayout();
  });

  // Auto-fullscreen on mobile landscape orientation
  const handleOrientationChange = async () => {
    if (!isMobileDevice()) return;
    
    // Check if in live view
    const liveView = document.getElementById('live-view');
    if (!liveView || liveView.classList.contains('hidden')) return;
    
    const isLandscape = window.innerWidth > window.innerHeight;
    
    if (isLandscape) {
      // Automatically enter fullscreen when rotating to landscape on mobile
      if (!isFullscreen()) {
        console.log('📱 Mobile landscape detected - entering fullscreen');
        await requestFullscreen();
      }
      
      // Lock orientation to landscape if supported
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape').catch(() => {
            // Silently fail if orientation lock not supported
          });
        }
      } catch (err) {
        // Orientation lock not supported or failed
      }
    } else {
      // Unlock orientation when rotating back to portrait
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (err) {
        // Orientation unlock failed
      }
    }
    
    // Sync layout after orientation change
    syncViewportLayout();
  };

  // Listen for orientation changes
  window.addEventListener('orientationchange', handleOrientationChange);
  
  // Also listen for resize as a fallback for devices that don't support orientationchange
  let resizeTimeout;
  const handleResizeOrientation = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleOrientationChange, 300);
  };
  
  // Add to existing resize handler
  window.addEventListener('resize', handleResizeOrientation);

  // Listen for fullscreen changes to update UI
  const handleFullscreenChange = () => {
    updateFullscreenButton();
    
    // If exiting fullscreen on mobile, unlock orientation
    if (!isFullscreen() && isMobileDevice()) {
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (err) {
        // Orientation unlock failed
      }
    }
  };

  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange', handleFullscreenChange);
  document.addEventListener('MSFullscreenChange', handleFullscreenChange);

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

  elements.cameraMenu?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  elements.cameraMenuToggle?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const options = state.cameraMenuContext?.options || {};
    if (cameraControl) {
      await cameraControl.toggle(options);
    }
    closeCameraMenu(true);
  });

  elements.cameraMenuSwitch?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await switchCameraSource();
    closeCameraMenu(true);
  });

  const setToggleState = (button, activeLabel, inactiveLabel, isActive) => {
    if (!button) return;
    button.classList.toggle('is-off', !isActive);
    button.classList.toggle('is-active', !!isActive);
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
      elements.viewerCameraToggle.disabled = false;
      elements.viewerCameraToggle.classList.toggle('is-disabled', !videoAllowed);
      elements.viewerCameraToggle.setAttribute('aria-disabled', (!videoAllowed).toString());
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
    updateMeetingStats();
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
      chatManager = new ChatManager({
        badgeEl: elements.chatBadge,
        floatingBadgeEl: elements.quickChatBadge
      });
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
    if (!hostMediaSync) {
      hostMediaSync = new HostMediaAutoSync({
        state,
        connectionWatchdog,
        getHostExpectation: () => getMediaState('host'),
        pollInterval: 500,
        stallThreshold: 1000,
        retryInterval: 500,
        maxRetries: 10,
        maxFailure: 20000,
        gracePeriod: 1200,
        onRenegotiate: (token) => {
          attemptPeerRecovery(token, { iceRestart: true });
          schedulePeerRecovery(token, 'media-desync');
        },
        onRejoin: (message) => {
          triggerSilentRejoin({ message });
        },
        onFail: (token) => {
          if (!state.isHost && token === 'host') {
            disconnectForUnrecoverableMedia();
          }
        }
      });
    } else {
      hostMediaSync.setWatchdog(connectionWatchdog);
      hostMediaSync.setHostExpectationGetter(() => getMediaState('host'));
    }
    if (!controlCenter && elements.controlCenterPanel) {
      controlCenter = new ControlCenter({
        panelEl: elements.controlCenterPanel,
        openButton: elements.controlCenterOpen,
        closeButton: elements.controlCenterClose,
        participantList: elements.controlParticipantList,
        participantMeta: elements.controlParticipantMeta,
        participantCount: elements.controlParticipantCount,
        lobbyCount: elements.controlLobbyCount,
        handQueue: elements.controlHandQueue,
        handCount: elements.controlHandCount,
        chatSidebar: elements.controlChatSidebar,
        chatHeader: elements.controlChatHeader,
        chatMessages: elements.controlChatMessages,
        chatCount: elements.controlChatCount,
        chatForm: elements.controlChatForm,
        chatInput: elements.controlChatInput,
        callAudioBtn: elements.controlCallAudio,
        callVideoBtn: elements.controlCallVideo,
        alertBadge: elements.controlCenterAlert
      });
    }
    if (!directChatManager) {
      directChatManager = new DirectChatManager({ socket: state.socket, controlCenter, toneManager });
    } else {
      directChatManager.attachSocket(state.socket);
      directChatManager.attachControlCenter(controlCenter);
    }
    if (!directCallManager) {
      directCallManager = new DirectCallManager({
        socket: state.socket,
        rtcConfig,
        permissionManager,
        toneManager
      });
    } else {
      directCallManager.attachSocket(state.socket);
      directCallManager.attachPermissionManager(permissionManager);
    }
    if (controlCenter) {
      controlCenter.setCallbacks({
        onMute: (participant, enable) => sendMediaControl(participant.token, { audio: enable }),
        onVideo: (participant, enable) => sendMediaControl(participant.token, { video: enable }),
        onRemove: (participant) => removeParticipant(participant.token),
        onAllow: (participant) => allowParticipant(participant.token),
        onLower: (participant) => lowerHand(participant.token),
        onMessage: (token, message) => directChatManager?.sendMessage(token, message),
        onCall: (token, media) => directCallManager?.startCall(token, media)
      });
      controlCenter.setHost(state.isHost);
      controlCenter.onSelectConversation((token) => {
        state.activeDirectChat = token;
        directChatManager?.select(token);
      });
      controlCenter.onToggle((open) => {
        state.controlCenterOpen = open;
        if (open && state.activeDirectChat) {
          directChatManager?.markSeen(state.activeDirectChat);
        }
      });
      if (!state.activeDirectChat) {
        controlCenter.setConversation(null, []);
      }
    }
    
    // Initialize mobile menu
    initializeMobileMenu();
  };

  const initializeMobileMenu = () => {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenuClose = document.getElementById('mobile-menu-close');
    const mobileControlsMenu = document.getElementById('mobile-controls-menu');
    const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
    const mobileMenuGrid = document.getElementById('mobile-menu-grid');
    const controlDock = document.getElementById('control-dock');

    if (!mobileMenuBtn || !mobileControlsMenu || !mobileMenuGrid || !controlDock) return;

    // First-time hint indicator
    const HINT_SHOWN_KEY = 'vvd_mobile_menu_hint_shown';
    const hasSeenHint = storageGet(storage.local, HINT_SHOWN_KEY);
    
    // Check if mobile (width <= 768px OR landscape with height <= 500px)
    const isMobileView = () => {
      return window.innerWidth <= 768 || (window.innerHeight <= 500 && window.matchMedia('(orientation: landscape)').matches);
    };
    
    // Show hint on first visit (mobile only)
    if (!hasSeenHint && isMobileView()) {
      setTimeout(() => {
        mobileMenuBtn.classList.add('show-hint');
        
        // Auto-hide hint after 5 seconds
        setTimeout(() => {
          mobileMenuBtn.classList.remove('show-hint');
          storageSet(storage.local, HINT_SHOWN_KEY, 'true');
        }, 5000);
      }, 1000); // Show after 1 second delay
    }

    // Button labels mapping
    const buttonLabels = {
      'live-mic-toggle': 'Microphone',
      'viewer-mic-toggle': 'Microphone',
      'live-camera-toggle': 'Camera',
      'viewer-camera-toggle': 'Camera',
      'toggle-chat': 'Chat',
      'hand-raise-btn': 'Raise Hand',
      'toggle-participants': 'Participants',
      'quick-record': 'Record',
      'screen-share': 'Share Screen',
      'end-btn': 'End Class',
      'stage-zoom-out': 'Zoom Out',
      'stage-zoom-in': 'Zoom In',
      'control-more': 'More Options'
    };

    // Clone control buttons to mobile menu
    const cloneControlsToMobileMenu = () => {
      mobileMenuGrid.innerHTML = '';
      
      const buttons = controlDock.querySelectorAll('.control-btn');
      buttons.forEach(button => {
        // Skip if hidden by role
        if (button.classList.contains('host-only') && !state.isHost) return;
        if (button.classList.contains('student-only') && state.isHost) return;
        
        const clone = button.cloneNode(true);
        const label = buttonLabels[button.id] || button.getAttribute('aria-label') || 'Control';
        
        // Add label text
        const labelSpan = document.createElement('span');
        labelSpan.className = 'control-label';
        labelSpan.textContent = label;
        clone.appendChild(labelSpan);
        
        // Special handling for "More Options" button
        if (button.id === 'control-more') {
          clone.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Close mobile menu first
            closeMobileMenu();
            
            // Then open the more options menu after a short delay
            setTimeout(() => {
              toggleMoreMenu(true);
            }, 100);
          });
        } else {
          // Copy event listeners by re-attaching them for other buttons
          clone.addEventListener('click', (e) => {
            e.preventDefault();
            button.click();
            
            // Close menu instantly after any action so user can see the result
            closeMobileMenu();
          });
        }
        
        mobileMenuGrid.appendChild(clone);
      });
    };

    // Open mobile menu (only on mobile devices)
    const openMobileMenu = () => {
      console.log('openMobileMenu called');
      console.log('isMobileView result:', isMobileView());
      
      // Only open menu on mobile (check width and landscape mode)
      if (!isMobileView()) {
        console.log('Not mobile view - exiting');
        return; // Do nothing on desktop
      }
      
      console.log('Opening menu...');
      
      // Hide hint when user opens menu
      if (mobileMenuBtn.classList.contains('show-hint')) {
        mobileMenuBtn.classList.remove('show-hint');
        storageSet(storage.local, HINT_SHOWN_KEY, 'true');
      }
      
      cloneControlsToMobileMenu();
      mobileControlsMenu?.classList.remove('hidden');
      mobileMenuBackdrop?.classList.remove('hidden');
      mobileMenuBtn?.setAttribute('aria-expanded', 'true');
      document.body.classList.add('no-scroll');
      
      console.log('Menu should be visible now');
      console.log('Menu classes:', mobileControlsMenu?.className);
    };

    // Close mobile menu
    const closeMobileMenu = () => {
      mobileControlsMenu?.classList.add('hidden');
      mobileMenuBackdrop?.classList.add('hidden');
      mobileMenuBtn?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
    };

    // Event listeners
    mobileMenuBtn.addEventListener('click', (e) => {
      console.log('Mobile menu button clicked!');
      console.log('Window width:', window.innerWidth);
      console.log('Window height:', window.innerHeight);
      console.log('Is mobile view:', isMobileView());
      console.log('Orientation:', window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait');
      openMobileMenu();
    });
    mobileMenuClose?.addEventListener('click', closeMobileMenu);
    mobileMenuBackdrop?.addEventListener('click', closeMobileMenu);
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !mobileControlsMenu?.classList.contains('hidden')) {
        closeMobileMenu();
      }
    });

    // Store functions for later use
    window.mobileMenuHelpers = {
      open: openMobileMenu,
      close: closeMobileMenu,
      refresh: cloneControlsToMobileMenu
    };
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
    const needsAudioPermission = typeof media.audio === 'boolean' && media.audio === true && !isTrackEnabled('audio');
    const needsVideoPermission = typeof media.video === 'boolean' && media.video === true && !isTrackEnabled('video');
    if ((needsAudioPermission || needsVideoPermission) && permissionManager) {
      const stream = await permissionManager.ensureInteractivePermissions({
        audio: needsAudioPermission,
        video: needsVideoPermission
      });
      if (!state.localStream && stream) {
        applyLocalStream(stream, { replace: true });
      }
      if (!state.localStream) {
        return;
      }
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
          const sender = addConfiguredTrack(pc, track, displayStream, { isScreen: true });
          if (sender) {
            state.screenSenders.push({ pc, sender, token, track });
          }
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
    installCameraMenu(elements.cameraBtn);
    installCameraMenu(elements.liveCameraToggle);
  };

  const bindViewerControls = () => {
    micControl?.bind(elements.viewerMicToggle, { viewer: true });
    installCameraMenu(elements.viewerCameraToggle, { viewer: true });
  };

  elements.stageZoomIn?.addEventListener('click', () => {
    setStageZoom(state.stageZoom + 0.1);
  });

  elements.stageZoomOut?.addEventListener('click', () => {
    setStageZoom(state.stageZoom - 0.1);
  });

  // Fullscreen toggle button (in More menu)
  const fullscreenBtn = document.getElementById('toggle-fullscreen');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', async () => {
      await toggleFullscreen();
      updateFullscreenButton();
    });
  }

  // Quick fullscreen button (top-left corner)
  const quickFullscreenBtn = document.getElementById('quick-fullscreen');
  if (quickFullscreenBtn) {
    quickFullscreenBtn.addEventListener('click', async () => {
      await toggleFullscreen();
      updateFullscreenButton();
      registerOverlayInteraction({ autoHide: true });
    });
  }

  // Listen for fullscreen changes (user presses F11 or ESC)
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
  document.addEventListener('mozfullscreenchange', updateFullscreenButton);
  document.addEventListener('MSFullscreenChange', updateFullscreenButton);

  elements.chatToggle?.addEventListener('click', () => toggleDrawer('chat'));
  elements.participantsToggle?.addEventListener('click', () => toggleDrawer('participants'));
  elements.chatClose?.addEventListener('click', () => closeDrawer());
  elements.participantsClose?.addEventListener('click', () => closeDrawer());
  if (elements.layoutLandscape && !elements.layoutLandscape.classList.contains('hidden')) {
    elements.layoutLandscape.addEventListener('click', () => {
      registerOverlayInteraction({ autoHide: true });
    });
  }
  if (elements.layoutPortrait && !elements.layoutPortrait.classList.contains('hidden')) {
    elements.layoutPortrait.addEventListener('click', () => {
      registerOverlayInteraction({ autoHide: true });
    });
  }
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

  // Handle device changes - automatically switch to external camera when connected
  if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      try {
        const previousCameras = state.availableCameras || [];
        const currentCameras = await refreshAvailableCameras();
        
        // Check if a new camera was added
        if (currentCameras.length > previousCameras.length) {
          const newCameras = currentCameras.filter(cam => 
            !previousCameras.some(prev => prev.deviceId === cam.deviceId)
          );
          
          if (newCameras.length > 0 && state.localStream) {
            // A new camera was connected - switch to it if video is enabled
            const videoEnabled = isTrackEnabled('video');
            if (videoEnabled) {
              const newCamera = newCameras[0];
              console.log('New camera detected:', newCamera.label || newCamera.deviceId);
              
              // Update preferred camera to the new device
              state.preferredCamera = {
                deviceId: newCamera.deviceId,
                facingMode: null
              };
              
              // Re-acquire stream with new camera
              if (permissionManager) {
                try {
                  await permissionManager.acquireStream({ 
                    audio: isTrackEnabled('audio'), 
                    video: true, 
                    replace: true 
                  });
                  showLiveToast(`Switched to ${newCamera.label || 'external camera'}`);
                } catch (error) {
                  console.error('Failed to switch to new camera:', error);
                }
              }
            }
          }
        }
        
        // Update camera menu options
        await updateQuickCameraButton(currentCameras).catch(() => {});
        await syncCameraMenuOptions().catch(() => {});
      } catch (error) {
        console.warn('devicechange handler error:', error);
      }
    });
  }

  const init = async () => {
    hideRejoinPrompt();
    initializeComponents();
    setLayout();
    ensureOverlayControlsVisible({ autoHide: false });
    await loadClass();
    await loadUser();
    state.isHost =
      (state.user && state.classInfo.host && state.user.id === state.classInfo.host.id)
      || !!state.hostToken;
    permissionManager?.configureRole(state.isHost);
    participantManager?.setIsHost(state.isHost);
    controlCenter?.setHost(state.isHost);
    chatManager?.attachToneManager(toneManager);
    syncDrawerState();
    setStageZoom(1);
    applyRoleStyling();
    
    // Initialize persistent upload queue for hosts
    if (state.isHost && window.uploadQueue) {
      try {
        await window.uploadQueue.init();
        console.log('📦 Upload queue initialized');
        
        // Start background upload processing
        window.uploadQueue.startAutoUpload(uploadFromIndexedDB);
        
        // Set up status change callback to update UI
        window.uploadQueue.onStatusChange = async (pendingCount) => {
          console.log(`📊 Pending uploads: ${pendingCount}`);
          // You can update UI here to show pending upload count
        };
        
        // Check for any pending uploads on load
        const pendingCount = await window.uploadQueue.getPendingCount();
        if (pendingCount > 0) {
          console.log(`🔄 Found ${pendingCount} pending upload(s) from previous session`);
          showLiveToast(`🔄 ${pendingCount} recording(s) pending - uploading in background...`, { duration: 4000 });
        }
      } catch (error) {
        console.error('Failed to initialize upload queue:', error);
      }
    }
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
    updateQuickCameraButton().catch(() => {});
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
      if (elements.nameInput) {
        elements.nameInput.value = state.user?.name || elements.nameInput.value || '';
      }
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
