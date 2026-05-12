/**
 * Background Service Worker — FlowPilot
 *
 * Responsibilities:
 *   - Manage chrome.alarms for scheduled resumes
 *   - Open/focus Claude tabs when alarms fire
 *   - Persist across browser restarts via alarms + storage
 *   - Handle messages from content scripts
 */

const ALARM_NAME = 'flowpilot-resume';

/* ── Alarm Management ─────────────────────────────────────────── */

/**
 * Schedule a chrome.alarm for the given timestamp.
 */
async function scheduleAlarm(retryTimestamp) {
  // chrome.alarms.create takes `when` as a timestamp in ms
  await chrome.alarms.create(ALARM_NAME, { when: retryTimestamp });
  const date = new Date(retryTimestamp);
  console.log(`[FlowPilot BG] Alarm scheduled for ${date.toLocaleTimeString()}`);
}

/**
 * Cancel any pending alarm.
 */
async function cancelAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
  console.log('[FlowPilot BG] Alarm cancelled');
}

/* ── Tab Management ───────────────────────────────────────────── */

/**
 * Open or focus the Claude chat tab at the given URL.
 * If a matching tab exists, reload and focus it.
 * Otherwise, create a new tab.
 */
async function openChatTab(chatUrl) {
  try {
    // Search for existing Claude tabs
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    const existing = tabs.find((t) => t.url && t.url.startsWith(chatUrl.split('?')[0]));

    let tabId;

    if (existing) {
      console.log('[FlowPilot BG] Reusing existing tab', existing.id);
      await chrome.tabs.update(existing.id, { active: true, url: chatUrl });
      await chrome.windows.update(existing.windowId, { focused: true });
      tabId = existing.id;
    } else {
      console.log('[FlowPilot BG] Creating new tab');
      const tab = await chrome.tabs.create({ url: chatUrl, active: true });
      tabId = tab.id;
    }

    // Wait for the tab to finish loading, then send resume trigger
    await waitForTabLoad(tabId);
    await sendResumeMessage(tabId);
  } catch (err) {
    console.error('[FlowPilot BG] Error opening tab:', err);
  }
}

/**
 * Wait for a tab to finish loading.
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Extra delay for React to hydrate
        setTimeout(resolve, 3000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Safety timeout — don't wait forever
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

/**
 * Send a TRIGGER_RESUME message to the content script in the given tab.
 * This is fire-and-forget — we don't need a meaningful response.
 */
async function sendResumeMessage(tabId) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 3000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'TRIGGER_RESUME' });
      console.log('[FlowPilot BG] Resume trigger sent to tab', tabId, response);
      return; // success
    } catch (err) {
      const isChannelError = err.message && err.message.includes('message channel closed');
      const isNoReceiver = err.message && err.message.includes('Receiving end does not exist');

      if (isChannelError) {
        // Content script received the message but the channel closed before
        // sendResponse was called. The message WAS delivered — this is OK.
        console.log('[FlowPilot BG] Message delivered (channel closed — this is fine)');
        return;
      }

      console.warn(`[FlowPilot BG] Attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);

      if (attempt < MAX_RETRIES) {
        // Content script not ready yet — wait and retry
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      } else {
        console.error('[FlowPilot BG] All retries exhausted. Content script may not be loaded.');
      }
    }
  }
}

/* ── Event Listeners ─────────────────────────────────────────── */

/**
 * Handle alarm firing.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  console.log('[FlowPilot BG] ⏰ Alarm fired!');

  // Update state to RESUMING
  await chrome.storage.local.set({ car_state: 'resuming' });

  // Get stored chat URL
  const data = await chrome.storage.local.get('car_chatUrl');
  const chatUrl = data.car_chatUrl;

  if (chatUrl) {
    await openChatTab(chatUrl);
  } else {
    console.error('[FlowPilot BG] No chat URL stored');
  }
});

/**
 * Handle messages from content scripts.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[FlowPilot BG] Message:', message.type);

  switch (message.type) {
    case 'SCHEDULE_ALARM':
      scheduleAlarm(message.retryTime)
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async response

    case 'CANCEL_ALARM':
      cancelAlarm()
        .then(() => chrome.storage.local.remove([
          'car_state', 'car_autoMode', 'car_retryTime',
          'car_retryTimeDisplay', 'car_chatUrl', 'car_retryCount',
          'car_customCommand',
        ]))
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'GET_ALARM_STATUS':
      chrome.alarms.get(ALARM_NAME)
        .then((alarm) => sendResponse({ alarm: alarm || null }))
        .catch(() => sendResponse({ alarm: null }));
      return true;
  }
});

/**
 * On install/update, check if there's a pending alarm we need to recover.
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[FlowPilot BG] Extension installed/updated');
  const data = await chrome.storage.local.get(['car_state', 'car_retryTime']);
  if (data.car_state === 'scheduled' && data.car_retryTime) {
    const now = Date.now();
    if (data.car_retryTime > now) {
      console.log('[FlowPilot BG] Recovering pending alarm');
      await scheduleAlarm(data.car_retryTime);
    } else {
      // Alarm time has passed — trigger immediately
      console.log('[FlowPilot BG] Alarm time passed, triggering now');
      await chrome.storage.local.set({ car_state: 'resuming' });
      const urlData = await chrome.storage.local.get('car_chatUrl');
      if (urlData.car_chatUrl) {
        await openChatTab(urlData.car_chatUrl);
      }
    }
  }
});

/**
 * On browser startup, recover pending alarms.
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[FlowPilot BG] Browser started');
  const data = await chrome.storage.local.get(['car_state', 'car_retryTime', 'car_chatUrl']);
  if (data.car_state === 'scheduled' && data.car_retryTime) {
    if (data.car_retryTime > Date.now()) {
      await scheduleAlarm(data.car_retryTime);
    } else {
      await chrome.storage.local.set({ car_state: 'resuming' });
      if (data.car_chatUrl) {
        await openChatTab(data.car_chatUrl);
      }
    }
  }
});

console.log('[FlowPilot BG] Service worker loaded');
