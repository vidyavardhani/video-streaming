(() => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorBox = document.getElementById('form-error');

  const displayError = (message) => {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  };

  const handleAuth = (form, url) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Unable to submit');
        }
        const payload = await res.json();
        if (payload.token) {
          window.localStorage.setItem('vs_token', payload.token);
        }
        const destination = payload.user?.role === 'teacher' ? '/dashboard' : '/';
        window.location.href = destination;
      } catch (error) {
        displayError(error.message);
      }
    });
  };

  if (loginForm) {
    handleAuth(loginForm, '/auth/login');
  }
  if (registerForm) {
    handleAuth(registerForm, '/auth/register');
  }
})();
