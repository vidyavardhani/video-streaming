(() => {
  const root = document.getElementById('dashboard');
  if (!root) return;

  const form = document.getElementById('create-class-form');
  const list = document.getElementById('class-list');
  const emptyState = document.getElementById('no-classes');
  const logoutForm = document.querySelector('form[action="/auth/logout"]');

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
