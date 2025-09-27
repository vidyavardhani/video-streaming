(function () {
  const apiKey = document.currentScript?.getAttribute('data-key');
  if (!apiKey) {
    console.error('[KalpOrg] Missing data-key attribute');
    return;
  }
  const container = document.createElement('div');
  container.id = 'kalporg-support-widget';
  container.style.position = 'fixed';
  container.style.bottom = '24px';
  container.style.right = '24px';
  container.style.zIndex = '2147483647';
  container.style.fontFamily = 'Inter, sans-serif';

  const button = document.createElement('button');
  button.textContent = 'Support';
  button.style.background = '#4f46e5';
  button.style.color = '#fff';
  button.style.border = 'none';
  button.style.borderRadius = '9999px';
  button.style.padding = '12px 20px';
  button.style.boxShadow = '0 8px 20px rgba(79,70,229,0.35)';

  const iframe = document.createElement('iframe');
  iframe.style.width = '360px';
  iframe.style.height = '520px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '16px';
  iframe.style.marginTop = '12px';
  iframe.style.boxShadow = '0 20px 48px rgba(15,23,42,0.2)';
  iframe.style.display = 'none';
  iframe.src = `https://support.kalporg.com/widget?key=${apiKey}`;

  button.addEventListener('click', () => {
    const visible = iframe.style.display === 'block';
    iframe.style.display = visible ? 'none' : 'block';
  });

  container.appendChild(button);
  container.appendChild(iframe);
  document.body.appendChild(container);
})();
