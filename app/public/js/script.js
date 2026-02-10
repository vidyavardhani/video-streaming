(function () {
  const app = document.getElementById('app');
  if (!app) return;

  const classId = app.dataset.classId;
  const token = window.localStorage.getItem('vs_token');
  const headers = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };

  const panels = {
    join: document.getElementById('join-screen'),
    lobby: document.getElementById('lobby-screen'),
    live: document.getElementById('live-screen'),
    end: document.getElementById('end-screen')
  };

  const previewVideo = document.getElementById('preview-video');
  const joinButton = document.getElementById('join-class');
  const startButton = document.getElementById('start-class');
  const toggleMicBtn = document.getElementById('toggle-mic');
  const toggleCameraBtn = document.getElementById('toggle-camera');
  const liveToggleMicBtn = document.getElementById('live-toggle-mic');
  const liveToggleCameraBtn = document.getElementById('live-toggle-camera');
  const screenShareBtn = document.getElementById('screen-share');
  const endCallBtn = document.getElementById('end-call');
  const copyLinkBtn = document.getElementById('copy-link');
  const copyCodeBtn = document.getElementById('copy-code');
  const lobbyList = document.getElementById('lobby-list');
  const lobbyMessage = document.getElementById('lobby-message');
  const meetingCodeEl = document.getElementById('meeting-code');
  const modalCode = document.getElementById('modal-code');
  const modalLink = document.getElementById('modal-link');
  const modalTitle = document.getElementById('modal-title');
  const modalParticipants = document.getElementById('modal-participants');
  const openInfoBtn = document.getElementById('open-info');
  const infoModal = document.getElementById('meeting-info-modal');
  const closeModalBtn = document.getElementById('close-modal');
  const chatForm = document.getElementById('chat-form');
  const chatText = document.getElementById('chat-text');
  const chatMessages = document.getElementById('chat-messages');
  const participantsList = document.getElementById('participants-list');
  const meetingTitleEl = document.getElementById('meeting-title');
  const userNameEl = document.getElementById('user-name');
  const displayNameInput = document.getElementById('display-name');
  const returnDashboardBtn = document.getElementById('return-dashboard');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const chatTab = document.getElementById('chat-tab');
  const peopleTab = document.getElementById('people-tab');
  const mainVideo = document.getElementById('main-video');

  let currentUser = null;
  let classData = null;
  let socket = null;
  let localStream = null;
  let screenStream = null;
  let micEnabled = true;
  let cameraEnabled = true;
  let isHost = false;
  let participants = new Map();
  const peers = new Map();
  let hostSocketId = null;
  let teacherStream = null;
  const leafPeers = new Set();
  const leafPcs = new Map();
  let myRelaySocketId = null;
  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  async function loadIceServers() {
    if (!token) return;
    try {
      const data = await fetchJSON('/api/webrtc/ice-servers');
      if (data.iceServers && data.iceServers.length) {
        rtcConfig.iceServers = data.iceServers;
      }
    } catch (err) {
      console.warn('ICE servers fetch failed, using STUN only', err);
    }
  }

  function setPanel(name) {
    Object.values(panels).forEach((panel) => panel.classList.remove('active'));
    if (panels[name]) {
      panels[name].classList.add('active');
    }
  }

  function ensureAuth() {
    if (!token) {
      setPanel('join');
      lobbyMessage.textContent = 'Please login and store your JWT token in localStorage as "vs_token" to continue.';
      joinButton.disabled = true;
      startButton.disabled = true;
      return false;
    }
    return true;
  }

  function updateMeetingMeta() {
    if (!classData) return;
    meetingCodeEl.textContent = `Code: ${classData.meetingCode || '—'}`;
    copyCodeBtn.textContent = classData.meetingCode || 'Copy';
    modalCode.textContent = classData.meetingCode || '—';
    modalLink.textContent = classData.meetingLink || window.location.href;
    modalTitle.textContent = classData.title || 'Live Class';
    meetingTitleEl.textContent = classData.title || 'Live Class';
    copyLinkBtn.dataset.link = classData.meetingLink || window.location.href;
    copyCodeBtn.dataset.code = classData.meetingCode || '';
  }

  function updateParticipantsUI(list) {
    participantsList.innerHTML = '';
    modalParticipants.innerHTML = '';
    list.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item.displayName || item.user?.name || 'Participant';
      participantsList.appendChild(li);

      const modalLi = document.createElement('li');
      modalLi.textContent = li.textContent;
      modalParticipants.appendChild(modalLi);
    });
  }

  function renderLobby(lobbyMembers) {
    lobbyList.innerHTML = '';
    if (!lobbyMembers.length) {
      lobbyList.innerHTML = '<p>No students waiting.</p>';
      return;
    }
    lobbyMembers.forEach((member) => {
      const item = document.createElement('div');
      item.className = 'lobby-item';
      const name = document.createElement('span');
      name.textContent = member.displayName || 'Student';
      const actions = document.createElement('div');
      actions.className = 'lobby-actions';

      const admitBtn = document.createElement('button');
      admitBtn.className = 'primary-btn';
      admitBtn.textContent = 'Admit';
      admitBtn.addEventListener('click', () => admitStudent(member));

      const denyBtn = document.createElement('button');
      denyBtn.className = 'ghost-btn';
      denyBtn.textContent = 'Deny';
      denyBtn.addEventListener('click', () => removeStudent(member));

      actions.appendChild(admitBtn);
      actions.appendChild(denyBtn);
      item.appendChild(name);
      item.appendChild(actions);
      lobbyList.appendChild(item);
    });
  }

  function appendChatMessage(message) {
    const container = document.createElement('div');
    container.className = 'chat-message';
    container.dataset.id = message._id;
    const header = document.createElement('strong');
    header.textContent = message.senderName || 'User';
    const body = document.createElement('p');
    body.textContent = message.message;
    container.appendChild(header);
    container.appendChild(body);

    if (isHost) {
      const remove = document.createElement('button');
      remove.textContent = 'Delete';
      remove.className = 'ghost-btn';
      remove.addEventListener('click', () => deleteMessage(message._id));
      container.appendChild(remove);
    }

    chatMessages.appendChild(container);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeChatMessage(msgId) {
    const el = chatMessages.querySelector(`[data-id="${msgId}"]`);
    if (el) {
      el.remove();
    }
  }

  async function fetchJSON(url, options = {}) {
    const config = Object.assign({ headers }, options);
    if (options && options.body && typeof options.body !== 'string') {
      config.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, config);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Request failed');
    }
    return res.json();
  }

  async function loadInitialData() {
    if (!ensureAuth()) return;
    try {
      const [user, klass] = await Promise.all([
        fetchJSON('/auth/me'),
        fetchJSON(`/classes/${classId}`)
      ]);
      currentUser = user;
      classData = klass;
      await loadIceServers();
      isHost = currentUser && classData.host && currentUser.id === classData.host._id;
      app.classList.toggle('host', isHost);
      userNameEl.textContent = currentUser.name;
      displayNameInput.value = currentUser.name;
      updateMeetingMeta();
      updateParticipantsUI(classData.participants || []);
      setupSocket();
      if (classData.status === 'live') {
        lobbyMessage.textContent = 'Class already live. Join when admitted.';
      }
      if (isHost) {
        lobbyMessage.textContent = 'Waiting students will appear here.';
        renderLobby(classData.lobby || []);
      }
      initPreview();
      loadChatHistory();
    } catch (error) {
      console.error(error);
      lobbyMessage.textContent = error.message;
    }
  }

  async function initPreview() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      previewVideo.srcObject = localStream;
    } catch (error) {
      console.warn('Unable to access camera/mic', error);
    }
  }

  function setupSocket() {
    socket = io();
    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('participant-joined', (data) => {
      if (data.userId) {
        participants.set(data.userId, data);
      }
    });

    socket.on('lobby-update', (lobbyMembers) => {
      if (isHost) {
        classData.lobby = lobbyMembers || [];
        renderLobby(classData.lobby);
      }
    });

    socket.on('host-socket-id', ({ hostSocketId: id }) => {
      hostSocketId = id;
    });

    socket.on('your-relay-is', ({ relaySocketId }) => {
      myRelaySocketId = relaySocketId;
    });

    socket.on('relay-add-leaf', ({ leafSocketId }) => {
      leafPeers.add(leafSocketId);
      callLeaf(leafSocketId);
    });

    socket.on('participant-admitted', (participant) => {
      if (!participant) return;
      const id = participant.user?.toString?.() || participant.user || participant.displayName;
      if (!isHost && currentUser && id === currentUser.id) {
        enterLiveSession();
      }
      if (isHost) {
        classData.participants = classData.participants || [];
        classData.participants.push(participant);
        updateParticipantsUI(classData.participants);
        renderLobby(classData?.lobby || []);
        if (participant.socketId && participant.isRelay) {
          callParticipant(participant.socketId);
        }
      }
    });

    socket.on('participant-removed', ({ studentId }) => {
      if (currentUser && studentId === currentUser.id) {
        setPanel('join');
        alert('Host removed you from the class.');
      }
      if (isHost && classData) {
        classData.participants = (classData.participants || []).filter((p) => {
          const pid = p.user?.toString?.() || p.user;
          return pid !== studentId;
        });
        updateParticipantsUI(classData.participants);
      }
    });

    socket.on('class-started', () => {
      if (!isHost) {
        lobbyMessage.textContent = 'Class is live. Waiting for host approval...';
      }
    });

    socket.on('class-ended', () => {
      tearDownSession();
      setPanel('end');
    });

    socket.on('messageCreated', (message) => {
      appendChatMessage(message);
    });

    socket.on('messageRemoved', ({ msgId }) => {
      removeChatMessage(msgId);
    });

    socket.on('participant-left', ({ userId, socketId }) => {
      if (userId) {
        participants.delete(userId);
      }
      const leafPc = leafPcs.get(socketId);
      if (leafPc) {
        leafPc.close();
        leafPcs.delete(socketId);
        leafPeers.delete(socketId);
      }
      detachRemoteStream(socketId);
      if (classData) {
        classData.participants = (classData.participants || []).filter((p) => {
          const pid = p.user?.toString?.() || p.user;
          return pid !== userId;
        });
        updateParticipantsUI(classData.participants);
      }
    });

    socket.on('signal', async ({ from, payload }) => {
      if (payload.type === 'offer') {
        const pc = createPeerConnection(from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const isLeafReceivingFromRelay = myRelaySocketId && from === myRelaySocketId;
        if (localStream && !isLeafReceivingFromRelay) {
          localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { target: from, payload: { type: 'answer', sdp: answer } });
      } else if (payload.type === 'answer') {
        const pc = peers.get(from) || leafPcs.get(from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      } else if (payload.type === 'candidate') {
        const pc = peers.get(from) || leafPcs.get(from);
        if (pc && payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (error) {
            console.error('Failed to add candidate', error);
          }
        }
      }
    });
  }

  function joinRoom() {
    if (!socket) return;
    socket.emit('joinRoom', {
      classId,
      userId: currentUser.id,
      name: currentUser.name,
      role: currentUser.role
    });
    socket.emit('register-peer', { classId, role: currentUser.role });
  }

  function createPeerConnection(targetId, initiator) {
    if (peers.has(targetId)) {
      return peers.get(targetId);
    }
    const pc = new RTCPeerConnection(rtcConfig);
    peers.set(targetId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', {
          target: targetId,
          payload: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      attachRemoteStream(targetId, event.streams[0]);
      if (targetId === hostSocketId && event.streams[0]) {
        teacherStream = event.streams[0];
        leafPeers.forEach((leafId) => callLeaf(leafId));
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        detachRemoteStream(targetId);
        peers.delete(targetId);
      }
    };

    if (initiator && localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    return pc;
  }

  async function callLeaf(leafSocketId) {
    if (!teacherStream || leafPcs.has(leafSocketId)) return;
    const pc = new RTCPeerConnection(rtcConfig);
    leafPcs.set(leafSocketId, pc);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', {
          target: leafSocketId,
          payload: { type: 'candidate', candidate: event.candidate }
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        leafPcs.delete(leafSocketId);
        leafPeers.delete(leafSocketId);
        detachRemoteStream(leafSocketId);
      }
    };
    teacherStream.getTracks().forEach((track) => pc.addTrack(track, teacherStream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { target: leafSocketId, payload: { type: 'offer', sdp: offer } });
  }

  async function callParticipant(targetId) {
    const pc = createPeerConnection(targetId, true);
    if (!localStream) {
      await initPreview();
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === track.kind);
        if (!sender) {
          pc.addTrack(track, localStream);
        }
      });
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { target: targetId, payload: { type: 'offer', sdp: offer } });
  }

  function attachRemoteStream(targetId, stream) {
    let video = mainVideo.querySelector(`[data-id="${targetId}"]`);
    if (!video) {
      video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.dataset.id = targetId;
      mainVideo.appendChild(video);
    }
    if ('srcObject' in video) {
      video.srcObject = stream;
    } else {
      video.src = window.URL.createObjectURL(stream);
    }
  }

  function detachRemoteStream(targetId) {
    const video = mainVideo.querySelector(`[data-id="${targetId}"]`);
    if (video) {
      video.srcObject = null;
      video.remove();
    }
  }

  function updateLocalPreview() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];
    if (videoTrack) videoTrack.enabled = cameraEnabled;
    if (audioTrack) audioTrack.enabled = micEnabled;
  }

  async function enterLiveSession() {
    setPanel('live');
    if (!localStream) {
      await initPreview();
    }
    const selfVideo = document.createElement('video');
    selfVideo.autoplay = true;
    selfVideo.muted = true;
    selfVideo.playsInline = true;
    selfVideo.dataset.id = 'self';
    selfVideo.srcObject = localStream;
    mainVideo.appendChild(selfVideo);
    updateLocalPreview();
    joinRoom();
    if (classData) {
      classData.participants = classData.participants || [];
      const exists = classData.participants.some((p) => {
        const pid = p.user?.toString?.() || p.user;
        return pid === currentUser.id;
      });
      if (!exists) {
        classData.participants.push({ displayName: currentUser.name, user: currentUser.id });
      }
      updateParticipantsUI(classData.participants);
    }
    if (isHost) {
      participants.forEach((value) => {
        if (value.socketId && value.userId !== currentUser.id) {
          callParticipant(value.socketId);
        }
      });
    }
  }

  function tearDownSession() {
    peers.forEach((pc) => pc.close());
    peers.clear();
    leafPcs.forEach((pc) => pc.close());
    leafPcs.clear();
    leafPeers.clear();
    teacherStream = null;
    hostSocketId = null;
    myRelaySocketId = null;
    participants.clear();
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      screenStream = null;
    }
    const videos = mainVideo.querySelectorAll('video');
    videos.forEach((v) => v.remove());
  }

  async function startClassFlow() {
    try {
      await fetchJSON(`/classes/${classId}/start`, { method: 'PATCH' });
      if (classData) {
        classData.status = 'live';
      }
      enterLiveSession();
    } catch (error) {
      alert(error.message);
    }
  }

  async function joinClassFlow() {
    try {
      await fetchJSON(`/classes/${classId}/join`, {
        method: 'POST',
        body: { displayName: displayNameInput.value || currentUser.name }
      });
      if (classData) {
        classData.lobby = classData.lobby || [];
      }
      joinRoom();
      setPanel('lobby');
      lobbyMessage.textContent = 'Waiting for host to let you in...';
    } catch (error) {
      alert(error.message);
    }
  }

  async function admitStudent(member) {
    try {
      await fetchJSON(`/classes/${classId}/admit`, {
        method: 'POST',
        body: { studentId: member.user }
      });
      classData.lobby = (classData.lobby || []).filter((item) => item.user !== member.user);
      renderLobby(classData.lobby);
      if (member.socketId) {
        callParticipant(member.socketId);
      }
    } catch (error) {
      alert(error.message);
    }
  }

  async function removeStudent(member) {
    try {
      await fetchJSON(`/classes/${classId}/remove`, {
        method: 'POST',
        body: { studentId: member.user }
      });
      classData.lobby = (classData.lobby || []).filter((item) => item.user !== member.user);
      renderLobby(classData.lobby);
    } catch (error) {
      alert(error.message);
    }
  }

  async function loadChatHistory() {
    try {
      const history = await fetchJSON(`/chat/${classId}`);
      chatMessages.innerHTML = '';
      history.forEach(appendChatMessage);
    } catch (error) {
      console.warn('Chat history failed', error);
    }
  }

  async function sendChatMessage(message) {
    if (!message.trim()) return;
    chatText.value = '';
    try {
      await fetchJSON(`/chat/${classId}`, {
        method: 'POST',
        body: { message }
      });
    } catch (error) {
      alert(error.message);
    }
  }

  async function deleteMessage(msgId) {
    try {
      await fetchJSON(`/chat/${classId}/${msgId}`, { method: 'DELETE' });
    } catch (error) {
      alert(error.message);
    }
  }

  async function toggleScreenShare() {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      screenStream = null;
      if (localStream) {
        localStream.getVideoTracks().forEach((track) => track.enabled = cameraEnabled);
      }
      socket.emit('stopScreenShare', { roomId: classId });
      return;
    }
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      peers.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });
      socket.emit('startScreenShare', { roomId: classId });
    } catch (error) {
      console.error('Screen share failed', error);
    }
  }

  // Event listeners
  if (joinButton) {
    joinButton.addEventListener('click', () => {
      if (!currentUser) return;
      joinClassFlow();
    });
  }

  if (startButton) {
    startButton.addEventListener('click', () => {
      if (!currentUser) return;
      setPanel('live');
      startClassFlow();
    });
  }

  toggleMicBtn?.addEventListener('click', () => {
    micEnabled = !micEnabled;
    updateLocalPreview();
  });

  toggleCameraBtn?.addEventListener('click', () => {
    cameraEnabled = !cameraEnabled;
    updateLocalPreview();
  });

  liveToggleMicBtn?.addEventListener('click', () => {
    micEnabled = !micEnabled;
    updateLocalPreview();
  });

  liveToggleCameraBtn?.addEventListener('click', () => {
    cameraEnabled = !cameraEnabled;
    updateLocalPreview();
  });

  screenShareBtn?.addEventListener('click', () => {
    if (isHost) {
      toggleScreenShare();
    }
  });

  endCallBtn?.addEventListener('click', async () => {
    if (isHost) {
      await fetchJSON(`/classes/${classId}/end`, { method: 'PATCH' });
    }
    tearDownSession();
    setPanel('end');
  });

  copyLinkBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(classData.meetingLink || window.location.href);
      copyLinkBtn.textContent = 'Copied!';
      setTimeout(() => (copyLinkBtn.textContent = 'Copy'), 2000);
    } catch (error) {
      console.warn('Copy failed', error);
    }
  });

  copyCodeBtn?.addEventListener('click', async () => {
    if (!classData.meetingCode) return;
    try {
      await navigator.clipboard.writeText(classData.meetingCode);
      copyCodeBtn.textContent = 'Copied!';
      setTimeout(() => updateMeetingMeta(), 2000);
    } catch (error) {
      console.warn('Copy failed', error);
    }
  });

  openInfoBtn?.addEventListener('click', () => {
    infoModal.classList.remove('hidden');
  });

  closeModalBtn?.addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });

  chatForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    sendChatMessage(chatText.value);
  });

  returnDashboardBtn?.addEventListener('click', () => {
    window.location.href = '/';
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      chatTab.classList.toggle('active', tab === 'chat');
      peopleTab.classList.toggle('active', tab === 'people');
    });
  });

  loadInitialData();
})();
