(() => {
  const root = document.getElementById('dashboard');
  if (!root) return;

  const form = document.getElementById('create-class-form');
  const list = document.getElementById('class-list');
  const emptyState = document.getElementById('no-classes');
  const recordingsList = document.getElementById('recording-list');
  const noRecordings = document.getElementById('no-recordings');
  const logoutForm = document.querySelector('form[action="/auth/logout"]');

  const formatDate = (value) => {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value));
    } catch (error) {
      return '';
    }
  };

  const renderClasses = (classes) => {
    list.innerHTML = '';
    if (!classes.length) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    classes.forEach((klass) => {
      const li = document.createElement('li');
      li.className = 'class-card';
      const isLive = klass.status === 'live';
      const canStart = klass.status === 'scheduled';
      li.innerHTML = `
        <div>
          <h3>${klass.title}</h3>
          <p>Status: <strong>${klass.status}</strong></p>
          <p>Code: <code>${klass.meetingCode}</code></p>
          <p>Link: <a href="${klass.meetingLink}" target="_blank">${klass.meetingLink}</a></p>
        </div>
        <div class="actions">
          <button data-action="start" data-code="${klass.code}" class="primary" ${canStart ? '' : 'disabled'}>Start</button>
          <button data-action="end" data-code="${klass.code}" class="ghost" ${isLive ? '' : 'disabled'}>End</button>
          <a href="${klass.meetingLink}" class="secondary" target="_blank">Open</a>
        </div>
      `;
      list.appendChild(li);
    });
  };

  const renderRecordings = (classes) => {
    if (!recordingsList || !noRecordings) return;
    recordingsList.innerHTML = '';
    const entries = classes
      .flatMap((klass) =>
        (klass.recordings || []).map((recording) => ({
          title: klass.title,
          code: klass.meetingCode,
          url: recording.url,
          startedAt: recording.startedAt,
          endedAt: recording.endedAt
        }))
      )
      .sort(
        (a, b) =>
          new Date(b.startedAt || b.endedAt || 0).getTime() -
          new Date(a.startedAt || a.endedAt || 0).getTime()
      );

    if (!entries.length) {
      noRecordings.classList.remove('hidden');
      return;
    }

    noRecordings.classList.add('hidden');

    entries.slice(0, 8).forEach((entry) => {
      if (!entry.url) return;
      const li = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = entry.title;
      const meta = document.createElement('span');
      const start = formatDate(entry.startedAt);
      const end = formatDate(entry.endedAt);
      meta.textContent = start && end ? `${start} → ${end}` : start || end || '';
      const link = document.createElement('a');
      link.href = entry.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'View recording';
      li.appendChild(heading);
      if (meta.textContent) {
        li.appendChild(meta);
      }
      li.appendChild(link);
      recordingsList.appendChild(li);
    });
  };

  const loadClasses = async () => {
    const res = await fetch('/classes/mine');
    if (res.status === 401) {
      window.location.href = '/';
      return;
    }
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    renderClasses(data);
    renderRecordings(data);
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await fetch('/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      alert('Unable to create class');
      return;
    }
    form.reset();
    loadClasses();
  });

  list?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const code = button.dataset.code;
    const action = button.dataset.action;
    const endpoint = action === 'start' ? `/classes/${code}/start` : `/classes/${code}/end`;
    const res = await fetch(endpoint, { method: 'PATCH' });
    if (!res.ok) {
      alert('Unable to update class');
      return;
    }
    loadClasses();
  });

  logoutForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await fetch('/auth/logout', { method: 'POST' });
    window.localStorage.removeItem('vs_token');
    window.location.href = '/';
  });

  loadClasses();
})();
