(() => {
  const root = document.getElementById('class-app');
  if (!root) return;

  const classId = root.dataset.classId;
  const tokenKey = 'vs_token';
  const joinKey = `vs_join_${classId}`;

  const state = {
    socket: null,
    classInfo: null,
    user: null,
    joinToken: sessionStorage.getItem(joinKey) || null,
    isHost: false,
    admitted: false,
    localStream: null,
    screenStream: null,
    peers: new Map(),
    videos: new Map(),
    lobby: []
  };

  const elements = {
    joinView: document.getElementById('join-view'),
    lobbyView: document.getElementById('lobby-view'),
    hostLobbyView: document.getElementById('host-lobby'),
    liveView: document.getElementById('live-view'),
    endedView: document.getElementById('ended-view'),
    previewVideo: document.getElementById('preview-video'),
    localVideo: document.getElementById('local-video'),
    videoGrid: document.getElementById('video-grid'),
    nameInput: document.getElementById('display-name'),
    joinButton: document.getElementById('join-btn'),
    startButton: document.getElementById('start-btn'),
    endButton: document.getElementById('end-btn'),
    admitList: document.getElementById('lobby-list'),
    meetingTitle: document.getElementById('meeting-title'),
    meetingCode: document.getElementById('meeting-code'),
    copyLink: document.getElementById('copy-link'),
    copyCode: document.getElementById('copy-code'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-text'),
    chatMessages: document.getElementById('chat-messages'),
    muteBtn: document.getElementById('toggle-mic'),
    cameraBtn: document.getElementById('toggle-camera'),
    screenShareBtn: document.getElementById('screen-share'),
    leaveBtn: document.getElementById('leave-btn'),
    waitingMessage: document.getElementById('waiting-message'),
    participantsList: document.getElementById('participants-list')
  };

  const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const getStoredToken = () => window.localStorage.getItem(tokenKey);

  const setView = (name) => {
    ['joinView', 'lobbyView', 'hostLobbyView', 'liveView', 'endedView'].forEach((key) => {
      if (!elements[key]) return;
      elements[key].classList.toggle('hidden', key !== name);
    });
  };

  const renderLobby = () => {
    if (!elements.admitList) return;
    elements.admitList.innerHTML = '';
    if (!state.lobby.length) {
      elements.admitList.innerHTML = '<li class="empty">No one is waiting.</li>';
      return;
    }
    state.lobby.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'lobby-entry';
      li.innerHTML = `
        <span>${entry.displayName}</span>
        <div class="actions">
          <button data-token="${entry.token}" class="primary">Admit</button>
          <button data-token="${entry.token}" class="ghost">Remove</button>
        </div>
      `;
      li.querySelector('.primary').addEventListener('click', () => admit(entry.token));
      li.querySelector('.ghost').addEventListener('click', () => removeParticipant(entry.token));
      elements.admitList.appendChild(li);
    });
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

  const createVideoEl = (id, label) => {
    let el = state.videos.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'video-tile';
      el.innerHTML = `
        <video playsinline autoplay></video>
        <span class="label">${label || ''}</span>
      `;
      elements.videoGrid.appendChild(el);
      state.videos.set(id, el);
    } else if (label) {
      const labelEl = el.querySelector('.label');
      if (labelEl) {
        labelEl.textContent = label;
      }
    }
    return el.querySelector('video');
  };

  const removeVideoEl = (id) => {
    const el = state.videos.get(id);
    if (el) {
      el.remove();
      state.videos.delete(id);
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
    const video = createVideoEl(id, label || getNameByToken(id));
    if ('srcObject' in video) {
      video.srcObject = stream;
    } else {
      video.src = window.URL.createObjectURL(stream);
    }
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
        elements.previewVideo.srcObject = stream;
      }
      if (elements.localVideo) {
        elements.localVideo.srcObject = stream;
      }
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
  };

  const loadClass = async () => {
    const res = await fetch(`/classes/${classId}`);
    if (!res.ok) throw new Error('Failed to load class');
    state.classInfo = await res.json();
    updateMeetingMeta();
    renderParticipants();
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
          classId,
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
    });

    state.socket.on('participant:disconnected', ({ joinToken }) => {
      if (state.classInfo?.participants) {
        state.classInfo.participants = state.classInfo.participants.filter((p) => p.token !== joinToken);
        renderParticipants();
      }
      removeVideoEl(joinToken);
      state.peers.delete(joinToken);
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
    stopStream(state.screenStream);
    state.screenStream = null;
  };

  const createPeerConnection = (targetToken, initiator = false) => {
    if (!targetToken || state.peers.has(targetToken)) return state.peers.get(targetToken);

    const pc = new RTCPeerConnection(rtcConfig);
    state.peers.set(targetToken, pc);

    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        state.socket.emit('webrtc:signal', {
          classId,
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
            classId,
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
          classId,
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
    wrapper.dataset.id = message._id;
    const header = document.createElement('div');
    header.className = 'chat-meta';
    header.textContent = `${message.senderName || 'User'} · ${new Date(message.createdAt).toLocaleTimeString()}`;
    const body = document.createElement('p');
    body.textContent = message.message;
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    elements.chatMessages.appendChild(wrapper);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  };

  const loadChatHistory = async () => {
    try {
      const res = await fetch(`/chat/${classId}`);
      if (!res.ok) return;
      const messages = await res.json();
      messages.forEach(appendMessage);
    } catch (error) {
      console.error('Chat history error', error);
    }
  };

  const admit = async (token) => {
    await fetch(`/classes/${classId}/admit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinToken: token })
    });
  };

  const removeParticipant = async (token) => {
    await fetch(`/classes/${classId}/remove`, {
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
    const res = await fetch(`/classes/${classId}/join`, {
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
    const res = await fetch(`/classes/${classId}/start`, { method: 'PATCH' });
    if (!res.ok) {
      alert('Unable to start class');
      return;
    }
    state.classInfo.status = 'live';
    setView('liveView');
    beginCall();
  });

  elements.endButton?.addEventListener('click', async () => {
    await fetch(`/classes/${classId}/end`, { method: 'PATCH' });
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

  elements.chatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = elements.chatInput.value.trim();
    if (!text) return;
    const body = { message: text, joinToken: state.joinToken };
    const res = await fetch(`/chat/${classId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      elements.chatInput.value = '';
    }
  });

  const toggleTrack = (kind) => {
    if (!state.localStream) return;
    state.localStream.getTracks().forEach((track) => {
      if (track.kind === kind) {
        track.enabled = !track.enabled;
      }
    });
  };

  elements.muteBtn?.addEventListener('click', () => {
    toggleTrack('audio');
  });
  elements.cameraBtn?.addEventListener('click', () => {
    toggleTrack('video');
  });

  elements.screenShareBtn?.addEventListener('click', async () => {
    if (state.screenStream) {
      stopStream(state.screenStream);
      state.screenStream = null;
      state.localStream.getTracks().forEach((track) => track.enabled = true);
      return;
    }
    try {
      state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const [screenTrack] = state.screenStream.getVideoTracks();
      const videoSenders = [];
      state.peers.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          videoSenders.push(sender);
        }
      });
      videoSenders.forEach((sender) => sender.replaceTrack(screenTrack));
      screenTrack.onended = () => {
        videoSenders.forEach((sender) => {
          const track = state.localStream?.getVideoTracks()[0];
          if (track) sender.replaceTrack(track);
        });
        stopStream(state.screenStream);
        state.screenStream = null;
      };
    } catch (error) {
      console.error('Screen share error', error);
    }
  });

  const init = async () => {
    await loadClass();
    await loadUser();
    await setupPreview();

    state.isHost = state.user && state.classInfo.host && state.user.id === state.classInfo.host.id;
    state.lobby = state.classInfo.lobby || [];
    if (elements.endButton) {
      elements.endButton.classList.toggle('hidden', !state.isHost);
    }
    if (elements.screenShareBtn) {
      elements.screenShareBtn.classList.toggle('hidden', !state.isHost);
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
