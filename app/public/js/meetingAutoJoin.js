import React, { useEffect, useState } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';

const AutoJoinPanel = () => {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    const cached = window.__autoJoinState;
    if (cached && Array.isArray(cached.entries)) {
      setEntries(cached.entries);
    }
    const handleUpdate = (event) => {
      const data = event.detail || {};
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    };
    window.addEventListener('auto-join:update', handleUpdate);
    return () => window.removeEventListener('auto-join:update', handleUpdate);
  }, []);

  if (!entries.length) {
    return React.createElement('div', { className: 'auto-join-empty' }, 'No auto-joined students yet.');
  }

  return (
    React.createElement('div', null,
      React.createElement('h4', null, `Auto-joined (${entries.length})`),
      React.createElement('ul', null, entries.map((entry) => (
        React.createElement('li', { key: entry.studentId },
          React.createElement('span', null, entry.displayName),
          React.createElement('span', { className: entry.joined ? 'auto-join-status joined' : 'auto-join-status pending' }, entry.joined ? 'Joined' : 'Awaiting')
        )
      )))
    )
  );
};

const mountAutoJoinPanel = () => {
  const node = document.getElementById('auto-join-panel');
  if (!node) {
    return;
  }
  const root = createRoot(node);
  root.render(React.createElement(AutoJoinPanel));
};

mountAutoJoinPanel();
