(() => {
  const app = document.getElementById('dashboard-app');
  if (!app) return;

  const PAGE_SIZE = 5;

  const elements = {
    welcomeTitle: document.getElementById('welcome-title'),
    viewHosts: document.querySelectorAll('.view'),
    navButtons: document.querySelectorAll('.nav-item'),
    viewTriggers: document.querySelectorAll('[data-view-trigger]'),
    quickCreate: document.getElementById('quick-create'),
    openCreateModal: document.getElementById('open-create-modal'),
    createModal: document.getElementById('create-modal'),
    createModalClose: document.getElementById('create-modal-close'),
    createModalCancel: document.getElementById('create-modal-cancel'),
    modalTitleInput: document.getElementById('modal-title-input'),
    createForm: document.getElementById('create-class-form'),
    createResult: document.getElementById('create-result'),
    createOutput: document.getElementById('create-output'),
    copyCreatedLink: document.getElementById('copy-created-link'),
    classList: document.getElementById('class-list'),
    classDetail: document.getElementById('class-detail'),
    classPagination: document.getElementById('class-pagination'),
    pageStatus: document.getElementById('page-status'),
    recentList: document.getElementById('recent-class-list'),
    recentEmpty: document.getElementById('recent-empty'),
    noClasses: document.getElementById('no-classes'),
    statTotalClasses: document.getElementById('stat-total-classes'),
    statActiveClasses: document.getElementById('stat-active-classes'),
    statEndedClasses: document.getElementById('stat-ended-classes'),
    statTotalStudents: document.getElementById('stat-total-students'),
    sidebarCount: document.getElementById('sidebar-participant-count'),
    sidebarEmpty: document.getElementById('sidebar-participant-empty'),
    sidebarList: document.getElementById('sidebar-participant-list'),
    logoutForm: document.querySelector('.sidebar-logout'),
    profileForm: document.getElementById('profile-form'),
    profileName: document.getElementById('profile-name'),
    profileEmail: document.getElementById('profile-email'),
    profilePassword: document.getElementById('profile-password'),
    profileToggle: document.getElementById('edit-profile-toggle'),
    profileCancel: document.getElementById('profile-cancel'),
    profileActions: document.querySelector('#profile-form .form-actions'),
    developerKey: document.getElementById('developer-key'),
    developerCopy: document.getElementById('copy-api-key'),
    developerRegen: document.getElementById('regen-api-key'),
    toast: document.getElementById('dashboard-toast')
  };

  const state = {
    classes: [],
    page: 1,
    selectedClass: null,
    editingProfile: false,
    user: {
      name: app.dataset.userName || '',
      email: '',
      apiKey: null
    }
  };

  const statusCopy = {
    scheduled: 'Scheduled',
    live: 'Live',
    ended: 'Ended'
  };

  const statusClassMap = {
    scheduled: 'scheduled',
    live: 'live',
    ended: 'ended'
  };

  const formatDate = (value, options = {}) => {
    if (!value) return '—';
    try {
      const date = typeof value === 'string' ? new Date(value) : value;
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...options
      }).format(date);
    } catch (error) {
      return '—';
    }
  };

  const formatDateShort = (value) => {
    if (!value) return '—';
    try {
      const date = typeof value === 'string' ? new Date(value) : value;
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch (error) {
      return '—';
    }
  };

  const showToast = (message) => {
    if (!elements.toast || !message) return;
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    window.setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 2600);
  };

  const switchView = (name) => {
    elements.navButtons.forEach((btn) => {
      const isMatch = btn.dataset.view === name;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-current', isMatch ? 'page' : 'false');
    });
    elements.viewHosts.forEach((section) => {
      section.classList.toggle('active', section.dataset.view === name);
    });
  };

  const copyText = async (text) => {
    if (!navigator.clipboard) {
      const temp = document.createElement('textarea');
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      return;
    }
    await navigator.clipboard.writeText(text);
  };

  const computeStats = () => {
    const total = state.classes.length;
    const active = state.classes.filter((klass) => klass.status === 'live').length;
    const ended = state.classes.filter((klass) => klass.status === 'ended').length;
    const studentSet = new Set();
    state.classes.forEach((klass) => {
      (klass.attendance || []).forEach((entry) => {
        if (entry && entry.token) {
          studentSet.add(entry.token);
        }
      });
    });

    elements.statTotalClasses.textContent = total;
    elements.statActiveClasses.textContent = active;
    elements.statEndedClasses.textContent = ended;
    elements.statTotalStudents.textContent = studentSet.size;
  };

  const renderRecent = () => {
    if (!elements.recentList || !elements.recentEmpty) return;
    elements.recentList.innerHTML = '';
    const recent = state.classes.slice(0, 4);
    if (!recent.length) {
      elements.recentEmpty.classList.remove('hidden');
      return;
    }
    elements.recentEmpty.classList.add('hidden');
    recent.forEach((klass) => {
      const item = document.createElement('li');
      item.className = 'panel-item';
      item.innerHTML = `
        <div>
          <h3>${klass.title}</h3>
          <p class="panel-meta">${statusCopy[klass.status] || klass.status} · Code ${klass.meetingCode}</p>
        </div>
        <button type="button" class="ghost" data-jump="${klass.code}">Open</button>
      `;
      elements.recentList.appendChild(item);
    });
  };

  const applyPagination = () => {
    if (!elements.classPagination) return;
    const totalPages = Math.max(1, Math.ceil(state.classes.length / PAGE_SIZE));
    if (state.page > totalPages) {
      state.page = totalPages;
    }
    if (totalPages <= 1) {
      elements.classPagination.hidden = true;
      return;
    }
    elements.classPagination.hidden = false;
    if (elements.pageStatus) {
      elements.pageStatus.textContent = `Page ${state.page} of ${totalPages}`;
    }
    const [prev, next] = elements.classPagination.querySelectorAll('.page-btn');
    if (prev) {
      prev.disabled = state.page === 1;
    }
    if (next) {
      next.disabled = state.page === totalPages;
    }
  };

  const renderClassList = () => {
    if (!elements.classList || !elements.noClasses) return;
    const start = (state.page - 1) * PAGE_SIZE;
    const paged = state.classes.slice(start, start + PAGE_SIZE);
    elements.classList.innerHTML = '';
    if (!state.classes.length) {
      elements.noClasses.classList.remove('hidden');
      if (elements.classPagination) {
        elements.classPagination.hidden = true;
      }
      state.selectedClass = null;
      renderClassDetail();
      renderSidebarParticipants();
      return;
    }
    elements.noClasses.classList.add('hidden');
    paged.forEach((klass) => {
      const item = document.createElement('li');
      item.className = `class-item${state.selectedClass?.code === klass.code ? ' active' : ''}`;
      item.dataset.code = klass.code;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', state.selectedClass?.code === klass.code ? 'true' : 'false');
      item.innerHTML = `
        <span class="class-status ${statusClassMap[klass.status] || ''}">${statusCopy[klass.status] || klass.status}</span>
        <h3>${klass.title}</h3>
        <p class="class-meta">Live participants: ${klass.participantCount || 0} · Total joined: ${klass.attendanceCount || 0}</p>
        <p class="class-meta">Meeting code: ${klass.meetingCode}</p>
      `;
      elements.classList.appendChild(item);
    });
    applyPagination();
  };

  const renderSidebarParticipants = () => {
    if (!elements.sidebarList || !elements.sidebarEmpty || !elements.sidebarCount) return;
    const participants = state.selectedClass?.participants || [];
    const count = participants.length;
    elements.sidebarCount.textContent = count;
    elements.sidebarList.innerHTML = '';
    if (!count) {
      elements.sidebarEmpty.classList.remove('hidden');
      return;
    }
    elements.sidebarEmpty.classList.add('hidden');
    participants.forEach((entry) => {
      const item = document.createElement('li');
      const initials = (entry.displayName || 'Student').split(' ').map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
      item.innerHTML = `
        <span class="participant-name">${entry.displayName || 'Student'}</span>
        <span class="participant-meta">Joined ${formatDateShort(entry.joinedAt)} · ${initials}</span>
      `;
      elements.sidebarList.appendChild(item);
    });
  };

  const showCreateModal = () => {
    if (!elements.createModal) return;
    elements.createForm?.reset();
    elements.createModal.classList.remove('hidden');
    requestAnimationFrame(() => {
      elements.createModal.classList.add('is-open');
      window.setTimeout(() => {
        elements.modalTitleInput?.focus();
      }, 120);
    });
    document.body.classList.add('no-scroll');
  };

  const hideCreateModal = () => {
    if (!elements.createModal) return;
    elements.createModal.classList.remove('is-open');
    const finalize = () => {
      elements.createModal?.classList.add('hidden');
      document.body.classList.remove('no-scroll');
    };
    elements.createModal.addEventListener('transitionend', finalize, { once: true });
    window.setTimeout(finalize, 220);
  };

  const isCreateModalOpen = () => Boolean(elements.createModal?.classList.contains('is-open'));

  const renderClassDetail = () => {
    if (!elements.classDetail) return;
    if (!state.selectedClass) {
      elements.classDetail.innerHTML = `
        <div class="detail-placeholder">
          <h3>Select a class</h3>
          <p>Pick a class from the list to see participants and controls.</p>
        </div>
      `;
      return;
    }
    const klass = state.selectedClass;
    const canStart = klass.status === 'scheduled';
    const canEnd = klass.status === 'live';
    const participantItems = (klass.participants || []).map((entry) => {
      return `
        <li>
          <div>
            <strong>${entry.displayName || 'Student'}</strong>
            <div class="detail-meta">Joined ${formatDate(entry.joinedAt)}</div>
          </div>
          <span class="detail-meta">${entry.mediaState?.audio === false ? 'Muted' : 'Audio on'}</span>
        </li>
      `;
    }).join('');

    elements.classDetail.innerHTML = `
      <div class="detail-header">
        <div>
          <h3>${klass.title}</h3>
          <p class="class-meta">Meeting link: <a href="${klass.meetingLink}" target="_blank" rel="noopener">${klass.meetingLink}</a></p>
          <p class="class-meta">Code ${klass.meetingCode}</p>
        </div>
        <div class="detail-actions">
          <a href="${klass.meetingLink}" target="_blank" rel="noopener" class="secondary">Open</a>
          <button type="button" class="primary" data-class-action="start" ${canStart ? '' : 'disabled'}>Start class</button>
          <button type="button" class="ghost" data-class-action="end" ${canEnd ? '' : 'disabled'}>End class</button>
        </div>
      </div>
      <div class="detail-section">
        <h4>Overview</h4>
        <p class="class-meta">Status: ${statusCopy[klass.status] || klass.status}</p>
        <p class="class-meta">Created ${formatDate(klass.createdAt)}</p>
        <p class="class-meta">Participants joined: ${klass.participantCount || 0} live · ${klass.attendanceCount || 0} total</p>
      </div>
      <div class="detail-section">
        <h4>Participants (${klass.participants?.length || 0})</h4>
        ${participantItems ? `<ul class="detail-list">${participantItems}</ul>` : '<p class="class-meta">No one has joined yet.</p>'}
      </div>
    `;
  };

  const selectClass = (code) => {
    const nextSelected = state.classes.find((item) => item.code === code) || null;
    state.selectedClass = nextSelected;
    renderClassList();
    renderClassDetail();
    renderSidebarParticipants();
  };

  const updateClasses = (classes) => {
    state.classes = Array.isArray(classes) ? classes : [];
    state.selectedClass = state.classes.find((item) => item.code === state.selectedClass?.code) || state.classes[0] || null;
    state.page = 1;
    computeStats();
    renderRecent();
    renderClassList();
    renderClassDetail();
    renderSidebarParticipants();
  };

  const loadClasses = async () => {
    try {
      const res = await fetch('/classes/mine');
      if (res.status === 401) {
        window.location.href = '/';
        return;
      }
      if (!res.ok) {
        throw new Error('Unable to load classes');
      }
      const data = await res.json();
      updateClasses(data);
    } catch (error) {
      console.error(error);
      showToast('Unable to load classes.');
    }
  };

  const loadUser = async () => {
    try {
      const res = await fetch('/auth/me');
      if (!res.ok) throw new Error('Unable to load profile');
      const data = await res.json();
      state.user.name = data.name;
      state.user.email = data.email;
      state.user.apiKey = data.apiKey;
      if (elements.welcomeTitle) {
        elements.welcomeTitle.textContent = `Hi, ${data.name}`;
      }
      if (elements.profileName) {
        elements.profileName.value = data.name;
      }
      if (elements.profileEmail) {
        elements.profileEmail.value = data.email;
      }
      if (elements.profilePassword) {
        elements.profilePassword.value = '';
      }
      if (elements.developerKey) {
        elements.developerKey.textContent = data.apiKey || 'No key generated';
      }
    } catch (error) {
      console.error(error);
    }
  };

  const generateApiKey = async () => {
    try {
      const res = await fetch('/admin/developer/api-key', { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.user.apiKey = data.apiKey;
      elements.developerKey.textContent = data.apiKey;
      showToast('New API key generated.');
    } catch (error) {
      showToast('Unable to generate API key.');
    }
  };

  const setProfileEditing = (enabled) => {
    state.editingProfile = enabled;
    [elements.profileName, elements.profileEmail, elements.profilePassword].forEach((input) => {
      if (!input) return;
      if (enabled) {
        input.removeAttribute('disabled');
      } else {
        input.setAttribute('disabled', 'disabled');
      }
    });
    if (elements.profilePassword && !enabled) {
      elements.profilePassword.value = '';
    }
    if (elements.profileActions) {
      elements.profileActions.classList.toggle('hidden', !enabled);
    }
    if (elements.profileToggle) {
      elements.profileToggle.textContent = enabled ? 'View' : 'Edit';
    }
  };

  const submitProfile = async (event) => {
    event.preventDefault();
    if (!state.editingProfile) return;
    const payload = {};
    const name = elements.profileName?.value.trim();
    const email = elements.profileEmail?.value.trim();
    const password = elements.profilePassword?.value.trim();
    if (name && name !== state.user.name) payload.name = name;
    if (email && email !== state.user.email) payload.email = email;
    if (password) payload.password = password;
    if (!Object.keys(payload).length) {
      showToast('No changes to update.');
      setProfileEditing(false);
      return;
    }
    try {
      const res = await fetch('/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error('Unable to update profile');
      }
      const data = await res.json();
      state.user.name = data.user.name;
      state.user.email = data.user.email;
      elements.profileName.value = data.user.name;
      elements.profileEmail.value = data.user.email;
      if (elements.welcomeTitle) {
        elements.welcomeTitle.textContent = `Hi, ${data.user.name}`;
      }
      showToast('Profile updated.');
      setProfileEditing(false);
    } catch (error) {
      console.error(error);
      showToast('Unable to update profile.');
    }
  };

  const createClass = async (event) => {
    event.preventDefault();
    if (!elements.createForm) return;
    const formData = new FormData(elements.createForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      const res = await fetch('/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error('Unable to create class');
      }
      const data = await res.json();
      elements.createForm.reset();
      hideCreateModal();
      if (elements.createResult && elements.createOutput) {
        elements.createOutput.textContent = data.meetingLink;
        elements.createResult.classList.remove('hidden');
        elements.createResult.dataset.link = data.meetingLink;
      }
      showToast('Class created!');
      await loadClasses();
      selectClass(data.meetingCode);
    } catch (error) {
      console.error(error);
      showToast('Unable to create class.');
    }
  };

  const handleClassAction = async (action) => {
    if (!state.selectedClass) return;
    const code = state.selectedClass.code;
    const endpoint = action === 'start' ? `/classes/${code}/start` : `/classes/${code}/end`;
    try {
      const res = await fetch(endpoint, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      showToast(action === 'start' ? 'Class started.' : 'Class ended.');
      await loadClasses();
      selectClass(code);
    } catch (error) {
      showToast('Unable to update class state.');
    }
  };

  const changePage = (direction) => {
    const totalPages = Math.max(1, Math.ceil(state.classes.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page + direction), totalPages);
    renderClassList();
  };

  const bindEvents = () => {
    elements.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
      });
    });

    elements.viewTriggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const view = trigger.dataset.viewTrigger;
        if (view) {
          switchView(view);
        }
      });
    });

    const showCreateModal = () => {
      if (!elements.createModal) return;
      elements.createForm?.reset();
      elements.createModal.classList.remove('hidden');
      requestAnimationFrame(() => {
        elements.createModal.classList.add('is-open');
        window.setTimeout(() => {
          elements.modalTitleInput?.focus();
        }, 120);
      });
      document.body.classList.add('no-scroll');
    };

    const hideCreateModal = () => {
      if (!elements.createModal) return;
      elements.createModal.classList.remove('is-open');
      const finalize = () => {
        elements.createModal?.classList.add('hidden');
        document.body.classList.remove('no-scroll');
      };
      elements.createModal.addEventListener('transitionend', finalize, { once: true });
      window.setTimeout(finalize, 220);
    };

    const isCreateModalOpen = () => elements.createModal && elements.createModal.classList.contains('is-open');

    elements.quickCreate?.addEventListener('click', () => {
      switchView('classes');
      showCreateModal();
    });

    elements.openCreateModal?.addEventListener('click', showCreateModal);

    elements.createModalClose?.addEventListener('click', hideCreateModal);
    elements.createModalCancel?.addEventListener('click', hideCreateModal);
    elements.createModal?.addEventListener('click', (event) => {
      if (event.target === elements.createModal) {
        hideCreateModal();
      }
    });

    elements.classList?.addEventListener('click', (event) => {
      const item = event.target.closest('.class-item');
      if (!item) return;
      selectClass(item.dataset.code);
    });

    elements.recentList?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-jump]');
      if (!button) return;
      const code = button.dataset.jump;
      if (!code) return;
      switchView('classes');
      selectClass(code);
    });

    elements.createForm?.addEventListener('submit', createClass);

    elements.copyCreatedLink?.addEventListener('click', async () => {
      const link = elements.createResult?.dataset.link;
      if (!link) return;
      await copyText(link);
      showToast('Class link copied.');
    });

    elements.classPagination?.addEventListener('click', (event) => {
      const button = event.target.closest('.page-btn');
      if (!button) return;
      if (button.dataset.page === 'prev') {
        changePage(-1);
      } else if (button.dataset.page === 'next') {
        changePage(1);
      }
    });

    elements.classDetail?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-class-action]');
      if (!button || button.disabled) return;
      handleClassAction(button.dataset.classAction);
    });

    elements.logoutForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await fetch('/auth/logout', { method: 'POST' });
      window.localStorage.removeItem('vs_token');
      window.location.href = '/';
    });

    elements.profileToggle?.addEventListener('click', () => {
      setProfileEditing(!state.editingProfile);
    });

    elements.profileCancel?.addEventListener('click', () => {
      if (!state.editingProfile) return;
      elements.profileName.value = state.user.name;
      elements.profileEmail.value = state.user.email;
      if (elements.profilePassword) {
        elements.profilePassword.value = '';
      }
      setProfileEditing(false);
    });

    elements.profileForm?.addEventListener('submit', submitProfile);

    if (elements.profileActions) {
      elements.profileActions.classList.add('hidden');
    }

    elements.developerCopy?.addEventListener('click', async () => {
      if (!state.user.apiKey) {
        showToast('Generate a key first.');
        return;
      }
      await copyText(state.user.apiKey);
      showToast('API key copied.');
    });

    elements.developerRegen?.addEventListener('click', generateApiKey);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isCreateModalOpen()) {
        hideCreateModal();
      }
    });
  };

  const init = async () => {
  let hideCreateModal = () => {};
  let showCreateModal = () => {};
  let isCreateModalOpen = () => false;

  const initBindings = () => {
    const bindings = bindEvents();
    if (bindings) {
      hideCreateModal = bindings.hideCreateModal || hideCreateModal;
      showCreateModal = bindings.showCreateModal || showCreateModal;
      isCreateModalOpen = bindings.isCreateModalOpen || isCreateModalOpen;
    }
  };

  initBindings();
  switchView('overview');
  setProfileEditing(false);
  await Promise.all([loadUser(), loadClasses()]);
  };

  init();
})();
