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
    hostMedia: { camera: null, screen: null }
  };

  const elements = {
    joinView: document.getElementById('join-view'),
    lobbyView: document.getElementById('lobby-view'),
    hostLobbyView: document.getElementById('host-lobby'),
    liveView: document.getElementById('live-view'),
    endedView: document.getElementById('ended-view'),
    previewVideo: document.getElementById('preview-video'),
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
    liveLobbyCount: document.getElementById('live-lobby-count')
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
    if (state.classInfo.host) {
      const hostItem = document.createElement('li');
      hostItem.textContent = `${state.classInfo.host.name} (Host)`;
      elements.participantsList.appendChild(hostItem);
    }
    participants.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.displayName;
      elements.participantsList.appendChild(li);
    });
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
    if ('srcObject' in video) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
    } else {
      video.src = window.URL.createObjectURL(stream);
    }
    video.muted = muted;
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      state.localStream = stream;
      if (elements.previewVideo) {
        setVideoSource(elements.previewVideo, stream, true);
      }
      if (!state.isHost) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      refreshStage();
      syncTrackButtons();
    } catch (error) {
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
    updateMeetingMeta();
    renderParticipants();
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
          renderParticipants();
        }
        setView('liveView');
        beginCall();
        elements.waitingMessage.textContent = 'Joining the class…';
      }
    });

    state.socket.on('participant:joined', ({ participant }) => {
      if (!participant?.token) return;
      state.classInfo.participants = state.classInfo.participants || [];
      if (!state.classInfo.participants.some((p) => p.token === participant.token)) {
        state.classInfo.participants.push(participant);
        renderParticipants();
      }
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
    refreshStage();
  };

  const createPeerConnection = (targetToken, initiator = false) => {
    if (!targetToken || state.peers.has(targetToken)) return state.peers.get(targetToken);

    const pc = new RTCPeerConnection(rtcConfig);
    state.peers.set(targetToken, pc);

    if (state.localStream) {
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
      attachStream(targetToken, stream, getNameByToken(targetToken));
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        removeVideoEl(targetToken);
        state.peers.delete(targetToken);
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

  const init = async () => {
    await loadClass();
    await loadUser();
    state.isHost = state.user && state.classInfo.host && state.user.id === state.classInfo.host.id;
    await setupPreview();
    bindTrackToggles();
    state.lobby = state.classInfo.lobby || [];
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
