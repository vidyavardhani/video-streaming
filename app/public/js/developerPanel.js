import React, { useEffect, useState } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';

const safeJson = async (response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
};

const request = async (url, options = {}) => {
  const config = options;
  if (config.body && !config.headers) {
    config.headers = { 'Content-Type': 'application/json' };
  }
  const response = await fetch(url, config);
  const data = await safeJson(response);
  if (!response.ok) {
    const message = data.message || 'Request failed';
    throw new Error(message);
  }
  return data;
};

const formatStatus = (status) => {
  if (status === 'live') return 'Live';
  if (status === 'ended') return 'Ended';
  return 'Scheduled';
};

const ClassCard = ({ klass, onStart, onPurchase, purchaseState, onChangePurchase, busy }) => {
  const roster = Array.isArray(klass.autoJoinRoster) ? klass.autoJoinRoster : [];
  const inProgress = busy === klass.classId;
  return (
    React.createElement('section', { className: 'developer-class-card' },
      React.createElement('header', { className: 'developer-class-head' },
        React.createElement('div', null,
          React.createElement('h3', null, klass.title),
          React.createElement('p', { className: 'developer-class-meta' }, `${formatStatus(klass.status)} · ${klass.classCode}`)
        ),
        React.createElement('button', {
          type: 'button',
          className: 'primary',
          disabled: inProgress,
          onClick: () => onStart(klass)
        }, inProgress ? 'Starting…' : 'Start class')
      ),
      React.createElement('div', { className: 'developer-class-body' },
        React.createElement('p', { className: 'developer-class-link' },
          React.createElement('span', null, klass.meetingLink),
          React.createElement('button', {
            type: 'button',
            className: 'ghost',
            onClick: () => navigator.clipboard?.writeText(klass.meetingLink)
          }, 'Copy link')
        ),
        React.createElement('div', { className: 'developer-class-auto' },
          React.createElement('h4', null, 'Auto-join roster'),
          roster.length === 0
            ? React.createElement('p', { className: 'developer-muted' }, 'No students enrolled yet.')
            : React.createElement('ul', null, roster.map((entry) => (
              React.createElement('li', { key: entry.studentId },
                React.createElement('span', null, entry.displayName),
                React.createElement('span', { className: 'developer-muted' }, entry.studentId)
              )
            )))
        ),
        React.createElement('form', {
          className: 'developer-purchase-form',
          onSubmit: (event) => {
            event.preventDefault();
            onPurchase(klass);
          }
        },
        React.createElement('div', { className: 'developer-form-grid' },
          React.createElement('label', null,
            React.createElement('span', null, 'Student ID'),
            React.createElement('input', {
              type: 'text',
              required: true,
              value: purchaseState.studentId || '',
              onChange: (event) => onChangePurchase(klass.classId, {
                studentId: event.target.value,
                displayName: purchaseState.displayName || ''
              })
            })
          ),
          React.createElement('label', null,
            React.createElement('span', null, 'Display name'),
            React.createElement('input', {
              type: 'text',
              value: purchaseState.displayName || '',
              onChange: (event) => onChangePurchase(klass.classId, {
                studentId: purchaseState.studentId || '',
                displayName: event.target.value
              })
            })
          ),
          React.createElement('button', {
            type: 'submit',
            className: 'ghost',
            disabled: inProgress || !purchaseState.studentId
          }, inProgress ? 'Saving…' : 'Add student')
        ))
      )
    )
  );
};

const DeveloperPanel = ({ endpoint }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [forms, setForms] = useState({});

  const loadSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request(endpoint);
      setSummary(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleCopyKey = async () => {
    if (!summary?.developerKey) {
      return;
    }
    await navigator.clipboard?.writeText(summary.developerKey);
    setActionMessage('Developer key copied');
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!summary?.developerKey || !summary?.hostId) {
      return;
    }
    const form = new FormData(event.target);
    const title = form.get('title')?.toString().trim();
    if (!title) {
      setActionMessage('Enter a class title');
      return;
    }
    setBusyId('create');
    setActionMessage('');
    try {
      await request('/api/createClass', {
        method: 'POST',
        body: JSON.stringify({
          developerKey: summary.developerKey,
          hostId: summary.hostId,
          title
        })
      });
      event.target.reset();
      setActionMessage('Class created');
      await loadSummary();
    } catch (err) {
      setActionMessage(err.message);
    } finally {
      setBusyId('');
    }
  };

  const handleStart = async (klass) => {
    if (!summary?.developerKey || !summary?.hostId) {
      return;
    }
    setBusyId(klass.classId);
    setActionMessage('');
    try {
      await request('/api/startClass', {
        method: 'POST',
        body: JSON.stringify({
          developerKey: summary.developerKey,
          hostId: summary.hostId,
          classId: klass.classId
        })
      });
      setActionMessage('Class started');
      await loadSummary();
    } catch (err) {
      setActionMessage(err.message);
    } finally {
      setBusyId('');
    }
  };

  const handlePurchase = async (klass) => {
    if (!summary?.developerKey || !summary?.hostId) {
      return;
    }
    const form = forms[klass.classId] || {};
    if (!form.studentId) {
      setActionMessage('Student ID required');
      return;
    }
    setBusyId(klass.classId);
    setActionMessage('');
    try {
      await request('/api/purchaseCourse', {
        method: 'POST',
        body: JSON.stringify({
          classId: klass.classId,
          studentId: form.studentId,
          displayName: form.displayName || '',
          developerKey: summary.developerKey
        })
      });
      setForms((prev) => ({
        ...prev,
        [klass.classId]: { studentId: '', displayName: '' }
      }));
      setActionMessage('Student added');
      await loadSummary();
    } catch (err) {
      setActionMessage(err.message);
    } finally {
      setBusyId('');
    }
  };

  const updateForm = (classId, next) => {
    setForms((prev) => ({
      ...prev,
      [classId]: next
    }));
  };

  if (loading) {
    return React.createElement('div', { className: 'developer-empty' }, 'Loading developer tools…');
  }

  if (error) {
    return React.createElement('div', { className: 'developer-empty error' }, error);
  }

  if (!summary) {
    return React.createElement('div', { className: 'developer-empty' }, 'No developer summary available.');
  }

  const classes = Array.isArray(summary.classes) ? summary.classes : [];

  return (
    React.createElement(React.Fragment, null,
      React.createElement('section', { className: 'developer-key-card' },
        React.createElement('header', null,
          React.createElement('h3', null, 'Developer key'),
          React.createElement('button', {
            type: 'button',
            className: 'ghost',
            onClick: handleCopyKey,
            disabled: !summary.developerKey
          }, 'Copy key')
        ),
        React.createElement('p', { className: 'developer-key-value' }, summary.developerKey || 'No key available'),
        React.createElement('p', { className: 'developer-muted' }, 'Use this key when integrating your own apps.')
      ),
      React.createElement('section', { className: 'developer-create-card' },
        React.createElement('h3', null, 'Create a class'),
        React.createElement('form', { onSubmit: handleCreate },
          React.createElement('label', null,
            React.createElement('span', null, 'Title'),
            React.createElement('input', { type: 'text', name: 'title', required: true, placeholder: 'Morning batch' })
          ),
          React.createElement('button', { type: 'submit', className: 'primary', disabled: busyId === 'create' }, busyId === 'create' ? 'Creating…' : 'Create class')
        )
      ),
      actionMessage
        ? React.createElement('div', { className: 'developer-message' }, actionMessage)
        : null,
      classes.length === 0
        ? React.createElement('p', { className: 'developer-empty' }, 'No classes yet.')
        : classes.map((klass) => React.createElement(ClassCard, {
            key: klass.classId,
            klass,
            onStart: handleStart,
            onPurchase: handlePurchase,
            purchaseState: forms[klass.classId] || { studentId: '', displayName: '' },
            onChangePurchase: updateForm,
            busy: busyId
          }))
    )
  );
};

const mountPanel = () => {
  const container = document.getElementById('developer-panel-root');
  if (!container) {
    return;
  }
  const endpoint = container.dataset.summaryEndpoint || '/api/developer/summary';
  const root = createRoot(container);
  root.render(React.createElement(DeveloperPanel, { endpoint }));
};

mountPanel();
