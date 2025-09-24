(() => {
  const root = document.getElementById('class-app');
  if (!root) return;

  const classCode = root.dataset.classCode;
  const tokenKey = 'vs_token';
  const joinKey = `vs_join_${classCode}`;

  const state = {
    socket: null,
    classInfo: null,
    user: null,
    joinToken: sessionStorage.getItem(joinKey) || null,
    isHost: false,
    admitted: false,
    localStream: null,
    screenStream: null,
    screenSenders: [],
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
    previewReady: false
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
    utilityToggle: document.getElementById('options-toggle'),
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
    raisedHandsList: document.getElementById('raised-hands-list')
  };

  const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const getStoredToken = () => window.localStorage.getItem(tokenKey);

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
  };

  const openDrawer = (name) => {
    state.activeDrawer = name;
    syncDrawerState();
  };

  const closeDrawer = () => {
    state.activeDrawer = null;
    syncDrawerState();
  };

  const toggleDrawer = (name) => {
    if (state.activeDrawer === name) {
      closeDrawer();
    } else {
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
      audio: mediaState.audio !== false,
      video: mediaState.video !== false
    });
  };

  const getMediaState = (token) => state.mediaStates.get(token) || { audio: true, video: true };

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

  const updateHandRaiseButton = () => {
    if (!elements.handRaiseBtn) return;
    elements.handRaiseBtn.classList.toggle('hidden', state.isHost);
    if (state.isHost) return;
    elements.handRaiseBtn.disabled = !state.admitted;
    elements.handRaiseBtn.textContent = state.handRaised ? 'Lower hand' : 'Raise hand';
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
    ['joinView', 'lobbyView', 'hostLobbyView', 'liveView', 'endedView'].forEach((key) => {
      if (!elements[key]) return;
      elements[key].classList.toggle('hidden', key !== name);
    });
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
  };

  const renderParticipants = () => {
    if (!elements.participantsList || !state.classInfo) return;
    const participants = state.classInfo.participants || [];
    elements.participantsList.innerHTML = '';

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
    if (type === 'screen') {
      state.hostMedia.screen = stream;
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          state.hostMedia.screen = null;
          refreshStage();
        };
      });
    } else if (type === 'camera') {
      state.hostMedia.camera = stream;
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          state.hostMedia.camera = null;
          refreshStage();
        };
      });
    }
    refreshStage();
  };

  const attachParticipantStream = (id, stream, label) => {
    const videoEl = ensureParticipantTile(id, label);
    if (!videoEl) return;
    setVideoSource(videoEl, stream, id === state.joinToken);
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
    if (state.previewReady && (state.isHost ? !!state.localStream : true)) {
      return;
    }

    if (!state.isHost) {
      state.previewReady = true;
      if (elements.previewVideo) {
        elements.previewVideo.srcObject = null;
      }
      refreshStage();
      syncTrackButtons();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      state.localStream = stream;
      state.previewReady = true;
      if (elements.previewVideo) {
        setVideoSource(elements.previewVideo, stream, true);
      }
      refreshStage();
      syncTrackButtons();
    } catch (error) {
      state.previewReady = true;
      console.warn('Media error', error);
    }
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
        if (response.joinToken) {
          state.joinToken = response.joinToken;
          sessionStorage.setItem(joinKey, state.joinToken);
        }
        state.isHost = response.role === 'host';
        if (elements.hostControls) {
          elements.hostControls.classList.toggle('hidden', !state.isHost);
        }
        if (elements.screenShareBtn) {
          elements.screenShareBtn.classList.toggle('hidden', !state.isHost);
        }
        if (elements.endButton) {
          elements.endButton.classList.toggle('hidden', !state.isHost);
        }
        refreshStage();
        updateHandRaiseButton();
        state.admitted = response.role === 'participant' && state.classInfo?.status === 'live';
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
        } else if (state.admitted) {
          setView('liveView');
          beginCall();
        }
        emitMediaUpdate();
        }
      );
    });

    state.socket.on('lobby:update', ({ lobby }) => {
      if (!Array.isArray(lobby)) return;
      state.lobby = lobby;
      renderLobby();
    });

    state.socket.on('participant:approved', ({ participant }) => {
      if (participant?.token && participant.token === state.joinToken) {
        state.admitted = true;
        state.classInfo.participants = state.classInfo.participants || [];
        if (!state.classInfo.participants.some((p) => p.token === participant.token)) {
          state.classInfo.participants.push(participant);
          applyMediaState(participant.token, participant.mediaState);
          renderParticipants();
        }
        setView('liveView');
        beginCall();
        elements.waitingMessage.textContent = 'Joining the class…';
        state.handRaised = false;
        updateHandRaiseButton();
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
    });

    state.socket.on('participant:removed', ({ joinToken }) => {
      if (joinToken === state.joinToken) {
        leaveSession();
        setView('joinView');
        state.admitted = false;
        elements.waitingMessage.textContent = 'Removed by host';
        sessionStorage.removeItem(joinKey);
        state.joinToken = null;
        state.handRaised = false;
        updateHandRaiseButton();
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
        renderLobby();
      }
      removeVideoEl(joinToken);
      state.peers.delete(joinToken);
      state.screenSenders = state.screenSenders.filter(({ token }) => token !== joinToken);
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
    });

    state.socket.on('class:started', () => {
      state.classInfo.status = 'live';
      if (state.isHost) {
        beginCall();
        setView('liveView');
      } else if (state.admitted) {
        setView('liveView');
        beginCall();
      }
      refreshStage();
    });

    state.socket.on('class:ended', () => {
      leaveSession();
      setView('endedView');
      sessionStorage.removeItem(joinKey);
      state.joinToken = null;
      state.admitted = false;
      state.handRaised = false;
      updateHandRaiseButton();
      if (!state.isHost && state.socket) {
        state.socket.disconnect();
        state.socket = null;
      }
    });

    state.socket.on('chat:new', appendMessage);
    state.socket.on('chat:remove', ({ msgId }) => {
      const el = elements.chatMessages.querySelector(`[data-id="${msgId}"]`);
      if (el) el.remove();
    });

    state.socket.on('participant:media', ({ joinToken, mediaState }) => {
      applyMediaState(joinToken, mediaState);
      updateParticipantState(joinToken, { mediaState });
      renderParticipants();
    });

    state.socket.on('hand:raised', ({ joinToken, name, handRaisedAt }) => {
      updateParticipantState(joinToken, { handRaisedAt });
      state.raisedHands.set(joinToken, { token: joinToken, displayName: name, handRaisedAt });
      renderParticipants();
      if (joinToken === state.joinToken) {
        state.handRaised = true;
        updateHandRaiseButton();
      }
    });

    state.socket.on('hand:lowered', ({ joinToken }) => {
      updateParticipantState(joinToken, { handRaisedAt: null });
      state.raisedHands.delete(joinToken);
      renderParticipants();
      if (joinToken === state.joinToken) {
        state.handRaised = false;
        updateHandRaiseButton();
      }
    });

    state.socket.on('hand:allowed', ({ joinToken }) => {
      updateParticipantState(joinToken, { handRaisedAt: null, allowedToSpeakAt: new Date().toISOString() });
      state.raisedHands.delete(joinToken);
      renderParticipants();
      if (joinToken === state.joinToken) {
        state.handRaised = false;
        updateHandRaiseButton();
      }
    });

    state.socket.on('host:allow-speak', () => {
      state.handRaised = false;
      updateHandRaiseButton();
      applyHostMediaState({ audio: true });
      alert('The host allowed you to speak. Your microphone is enabled.');
    });

    state.socket.on('host:media', (mediaState) => {
      applyHostMediaState(mediaState);
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
  };

  const createPeerConnection = (targetToken, initiator = false) => {
    if (!targetToken || state.peers.has(targetToken)) return state.peers.get(targetToken);

    const pc = new RTCPeerConnection(rtcConfig);
    state.peers.set(targetToken, pc);

    if (state.isHost && state.localStream) {
      state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));
    }
    if (state.isHost && state.screenStream) {
      const [screenTrack] = state.screenStream.getVideoTracks();
      if (screenTrack) {
        const sender = pc.addTrack(screenTrack, state.screenStream);
        state.screenSenders.push({ pc, sender, token: targetToken });
      }
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

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        removeVideoEl(targetToken);
        state.peers.delete(targetToken);
        if (targetToken === 'host' && !state.isHost) {
          state.hostMedia = { camera: null, screen: null };
          refreshStage();
        }
      }
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

  const renegotiate = async (pc, targetToken) => {
    try {
      const offer = await pc.createOffer();
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
        renderLobby();
      }
    });
  };

  elements.joinButton?.addEventListener('click', async () => {
    const displayName = elements.nameInput.value.trim();
    if (!displayName) {
      alert('Enter your name');
      return;
    }
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
    sessionStorage.setItem(joinKey, state.joinToken);
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
    await fetch(`/classes/${classCode}/end`, { method: 'PATCH' });
    leaveSession();
    setView('endedView');
  });

  elements.leaveBtn?.addEventListener('click', () => {
    leaveSession();
    if (!state.isHost && state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }
    sessionStorage.removeItem(joinKey);
    state.joinToken = null;
    setView('joinView');
  });

  elements.copyLink?.addEventListener('click', async (e) => {
    const link = e.currentTarget.dataset.link || window.location.href;
    await navigator.clipboard.writeText(link);
    e.currentTarget.textContent = 'Copied!';
    setTimeout(() => (e.currentTarget.textContent = 'Copy link'), 1500);
  });

  elements.copyCode?.addEventListener('click', async (e) => {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    e.currentTarget.textContent = 'Copied!';
    setTimeout(() => (e.currentTarget.textContent = 'Copy code'), 1500);
  });

  elements.shareInfo?.addEventListener('click', async (e) => {
    const link = elements.copyLink?.dataset.link || e.currentTarget.dataset.link || window.location.href;
    await navigator.clipboard.writeText(link);
    e.currentTarget.textContent = 'Copied!';
    setTimeout(() => (e.currentTarget.textContent = 'Copy invite'), 1500);
  });

  elements.utilityToggle?.addEventListener('click', () => toggleUtilityPanel());
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
    }
  });

  const setToggleState = (button, activeLabel, inactiveLabel, isActive) => {
    if (!button) return;
    button.classList.toggle('is-off', !isActive);
    button.textContent = isActive ? activeLabel : inactiveLabel;
  };

  const syncTrackButtons = () => {
    const audioEnabled = !!state.localStream?.getAudioTracks().some((track) => track.enabled);
    const videoEnabled = !!state.localStream?.getVideoTracks().some((track) => track.enabled);
    setToggleState(elements.muteBtn, 'Mic on', 'Mic off', audioEnabled);
    setToggleState(elements.liveMicToggle, 'Mic on', 'Mic off', audioEnabled);
    setToggleState(elements.cameraBtn, 'Camera on', 'Camera off', videoEnabled);
    setToggleState(elements.liveCameraToggle, 'Camera on', 'Camera off', videoEnabled);
  };

  const emitMediaUpdate = () => {
    if (!state.socket || !state.localStream) return;
    const audioEnabled = !!state.localStream.getAudioTracks().some((track) => track.enabled);
    const videoEnabled = !!state.localStream.getVideoTracks().some((track) => track.enabled);
    state.socket.emit('media:update', { audio: audioEnabled, video: videoEnabled });
  };

  const applyHostMediaState = (media) => {
    if (!state.localStream || !media) return;
    if (typeof media.audio === 'boolean') {
      state.localStream.getAudioTracks().forEach((track) => {
        track.enabled = media.audio;
      });
    }
    if (typeof media.video === 'boolean') {
      state.localStream.getVideoTracks().forEach((track) => {
        track.enabled = media.video;
      });
      refreshStage();
    }
    syncTrackButtons();
    emitMediaUpdate();
  };

  const toggleTrack = (kind) => {
    if (!state.localStream) return;
    state.localStream.getTracks().forEach((track) => {
      if (track.kind === kind) {
        track.enabled = !track.enabled;
      }
    });
    if (kind === 'video') {
      refreshStage();
    }
    syncTrackButtons();
    emitMediaUpdate();
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
    if (elements.screenShareBtn) {
      elements.screenShareBtn.textContent = 'Share screen';
    }
  };

  const bindTrackToggles = () => {
    if (!state.isHost) return;
    elements.muteBtn?.addEventListener('click', () => toggleTrack('audio'));
    elements.cameraBtn?.addEventListener('click', () => toggleTrack('video'));
    elements.liveMicToggle?.addEventListener('click', () => toggleTrack('audio'));
    elements.liveCameraToggle?.addEventListener('click', () => toggleTrack('video'));
  };

  elements.screenShareBtn?.addEventListener('click', async () => {
    if (!state.isHost) return;
    if (state.screenStream) {
      stopScreenShare();
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      state.screenStream = displayStream;
      refreshStage();
      const [screenTrack] = displayStream.getVideoTracks();
      state.screenSenders = [];
      state.peers.forEach((pc, token) => {
        const sender = pc.addTrack(screenTrack, displayStream);
        state.screenSenders.push({ pc, sender, token });
        renegotiate(pc, token);
      });
      if (elements.screenShareBtn) {
        elements.screenShareBtn.textContent = 'Stop sharing';
      }
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Screen share error', error);
    }
  });

  elements.chatToggle?.addEventListener('click', () => toggleDrawer('chat'));
  elements.participantsToggle?.addEventListener('click', () => toggleDrawer('participants'));
  elements.chatClose?.addEventListener('click', () => closeDrawer());
  elements.participantsClose?.addEventListener('click', () => closeDrawer());
  elements.drawerBackdrop?.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDrawer();
    }
  });

  const init = async () => {
    await loadClass();
    await loadUser();
    state.isHost = state.user && state.classInfo.host && state.user.id === state.classInfo.host.id;
    syncDrawerState();
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
    }
    await setupPreview();
    bindTrackToggles();
    state.lobby = state.classInfo.lobby || [];
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
    if (state.isHost) {
      elements.nameInput.value = state.user.name;
      setView(state.classInfo.status === 'live' ? 'liveView' : 'hostLobbyView');
      connectSocket();
      renderLobby();
      refreshLobby();
      if (state.classInfo.status === 'live') {
        beginCall();
      }
    } else {
      setView('joinView');
      if (state.joinToken) {
        setView('lobbyView');
        connectSocket();
      }
    }

    loadChatHistory();
  };

  init();
})();
