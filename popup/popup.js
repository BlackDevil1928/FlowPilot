/**
 * Popup Script — FlowPilot Status Dashboard
 * Displays current state and provides cancel/reset controls.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEYS = [
    'car_state', 'car_autoMode', 'car_retryTime',
    'car_retryTimeDisplay', 'car_chatUrl', 'car_retryCount',
    'car_customCommand',
  ];

  const STATUS_LABELS = {
    idle: 'Monitoring for limits…',
    limit_detected: 'Message limit detected!',
    scheduled: 'Resume scheduled',
    resuming: 'Resuming conversation…',
    completed: 'Generation completed!',
  };

  const BADGE_LABELS = {
    idle: 'Idle',
    limit_detected: 'Limit Hit',
    scheduled: 'Scheduled',
    resuming: 'Resuming',
    completed: 'Done',
  };

  const BADGE_CLASSES = {
    idle: '',
    limit_detected: 'badge-limit',
    scheduled: 'badge-scheduled',
    resuming: 'badge-resuming',
    completed: 'badge-completed',
  };

  /** Load state and update UI */
  async function refresh() {
    const data = await chrome.storage.local.get(STORAGE_KEYS);
    const state = data.car_state || 'idle';

    // Status text
    $('statusText').textContent = STATUS_LABELS[state] || 'Unknown';

    // Badge
    const badge = $('statusBadge');
    badge.textContent = BADGE_LABELS[state] || 'Idle';
    badge.className = `popup-badge ${BADGE_CLASSES[state] || ''}`;

    // Retry time
    const retryRow = $('retryRow');
    if (data.car_retryTimeDisplay && (state === 'scheduled' || state === 'limit_detected')) {
      retryRow.style.display = 'flex';
      $('retryTime').textContent = data.car_retryTimeDisplay;
    } else {
      retryRow.style.display = 'none';
    }

    // Retry count
    $('retryCount').textContent = data.car_retryCount || '0';

    // Chat URL
    const urlRow = $('urlRow');
    if (data.car_chatUrl) {
      urlRow.style.display = 'flex';
      const link = $('chatUrl');
      link.href = data.car_chatUrl;
      
      // Use the stored chatId or extract from URL for display
      const chatId = data.car_chatId || (data.car_chatUrl.match(/\/chat\/([a-f0-9-]{36})/i) || [])[1];
      link.textContent = chatId ? `Chat ${chatId.slice(0, 8)}…` : 'Open Chat →';
    } else {
      urlRow.style.display = 'none';
    }

    // Command
    const cmdRow = $('cmdRow');
    if (data.car_customCommand && state !== 'idle') {
      cmdRow.style.display = 'flex';
      $('cmdText').textContent = data.car_customCommand;
    } else {
      cmdRow.style.display = 'none';
    }

    // Cancel button — enabled only when scheduled or resuming
    $('cancelBtn').disabled = !['scheduled', 'resuming'].includes(state);
  }

  /** Cancel the scheduled resume */
  $('cancelBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CANCEL_ALARM' });
    await chrome.storage.local.remove(STORAGE_KEYS);
    refresh();
  });

  /** Full reset */
  $('resetBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CANCEL_ALARM' });
    await chrome.storage.local.remove(STORAGE_KEYS);
    refresh();
  });

  // Initial load
  refresh();

  // Auto-refresh every 2 seconds while popup is open
  setInterval(refresh, 2000);
})();
