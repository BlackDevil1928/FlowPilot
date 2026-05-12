/**
 * Content Script — Main orchestrator for FlowPilot
 *
 * NEW FLOW (manual activation only):
 *   1. Extension watches for limit messages passively
 *   2. When limit detected → icon pulses amber
 *   3. User clicks icon → input popup appears → user types command
 *   4. User submits → extension schedules alarm + stores command
 *   5. At retry time → sends the stored command
 *   6. If limit again + autoMode → auto-re-schedules (same command)
 *   7. Done when generation completes
 */
(function () {
  'use strict';

  const { StateManager, STATES, TimeParser, Helpers, LimitDetector, ResumeEngine, ButtonInjector } = window.CAR;

  class FlowPilotController {
    constructor() {
      this.limitDetector = new LimitDetector();
      this.resumeEngine = new ResumeEngine();
      this.button = new ButtonInjector();
      this._initialized = false;
    }

    async init() {
      if (this._initialized) return;
      this._initialized = true;
      console.log('[FlowPilot] Initializing on', window.location.href);

      // Inject the floating icon button
      this.button.inject(() => this._onButtonClick());

      // Start watching for limit messages
      this.limitDetector.start((text) => this._onLimitDetected(text));

      // Listen for messages from background service worker
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        this._onMessage(msg, sender, sendResponse);
        return true;
      });

      // Check if we should resume (page opened by alarm)
      await this._checkResumeState();

      // Sync button with stored state
      await this._syncButtonState();

      console.log('[FlowPilot] Ready ✓');
    }

    /* ── Event Handlers ──────────────────────────────────── */

    /**
     * Limit message detected by MutationObserver.
     * Updates state, pulses the icon, but does NOT auto-schedule
     * UNLESS autoMode is already active (user clicked before).
     */
    async _onLimitDetected(limitText) {
      const parsed = TimeParser.parse(limitText);
      const status = await StateManager.getStatus();

      // Don't re-detect if already handling
      if (status === STATES.SCHEDULED || status === STATES.RESUMING) return;

      console.log('[FlowPilot] Limit detected, parsed:', parsed);

      if (parsed) {
        await StateManager.set({
          [StateManager.K.STATE]: STATES.LIMIT_DETECTED,
          [StateManager.K.RETRY_TIME]: parsed.timestamp,
          [StateManager.K.RETRY_DISPLAY]: parsed.timeStr,
          [StateManager.K.CHAT_URL]: window.location.href,
        });

        this.button.setState('limit_detected', parsed.timeStr, parsed.timestamp);

        // Only auto-schedule if user already activated (re-hit scenario)
        const autoMode = await StateManager.isAutoMode();
        if (autoMode) {
          console.log('[FlowPilot] Auto-mode active, re-scheduling with same command');
          await this._scheduleResume(parsed.timestamp, parsed.timeStr);
        }
      } else {
        await StateManager.setStatus(STATES.LIMIT_DETECTED);
        this.button.setState('limit_detected', '');
      }
    }

    /**
     * User clicks the floating icon.
     */
    async _onButtonClick() {
      const status = await StateManager.getStatus();

      switch (status) {
        case STATES.IDLE:
        case STATES.COMPLETED:
          // No limit detected yet — do nothing
          console.log('[FlowPilot] No limit detected. Waiting.');
          break;

        case STATES.LIMIT_DETECTED: {
          // Show input popup so user can type their command
          if (this.button.isPopupOpen()) {
            this.button.hideInputPopup();
            return;
          }
          const data = await StateManager.getAll();
          const retryDisplay = data[StateManager.K.RETRY_DISPLAY] || '';
          this.button.showInputPopup(retryDisplay, (command) => this._onCommandSubmit(command));
          break;
        }

        case STATES.SCHEDULED:
          // Click while scheduled → cancel
          console.log('[FlowPilot] Cancelling scheduled resume');
          await this._cancelResume();
          break;

        case STATES.RESUMING:
          // Do nothing while actively resuming
          break;
      }
    }

    /**
     * User submitted their command from the input popup.
     */
    async _onCommandSubmit(command) {
      console.log('[FlowPilot] Command set:', command);

      // Store the command and enable auto-mode
      await StateManager.set({ [StateManager.K.CUSTOM_CMD]: command });
      await StateManager.setAutoMode(true);

      const data = await StateManager.getAll();
      const retryTime = data[StateManager.K.RETRY_TIME];
      const retryDisplay = data[StateManager.K.RETRY_DISPLAY];

      if (retryTime) {
        await this._scheduleResume(retryTime, retryDisplay);
      } else {
        console.warn('[FlowPilot] Retry time not available');
      }
    }

    /**
     * Handle messages from background service worker.
     */
    async _onMessage(msg) {
      console.log('[FlowPilot] Message received:', msg.type);

      switch (msg.type) {
        case 'TRIGGER_RESUME':
          await this._executeResume();
          break;

        case 'GET_STATUS': {
          const status = await StateManager.getStatus();
          return { status };
        }
      }
    }

    /* ── Core Logic ──────────────────────────────────────── */

    async _scheduleResume(retryTimestamp, retryDisplay) {
      console.log('[FlowPilot] Scheduling resume for', retryDisplay);

      await StateManager.scheduleResume(retryTimestamp, retryDisplay, window.location.href);
      await StateManager.incrementRetryCount();

      chrome.runtime.sendMessage({
        type: 'SCHEDULE_ALARM',
        retryTime: retryTimestamp,
        chatUrl: window.location.href,
      });

      this.button.setState('scheduled', retryDisplay, retryTimestamp);
    }

    async _cancelResume() {
      chrome.runtime.sendMessage({ type: 'CANCEL_ALARM' });
      await StateManager.setAutoMode(false);
      await StateManager.reset();
      this.limitDetector.resetDetection();
      this.button.hideInputPopup();
      this.button.setState('idle');
    }

    async _executeResume() {
      console.log('[FlowPilot] ▶ Executing resume sequence');
      this.button.setState('resuming');

      const result = await this.resumeEngine.execute();

      switch (result) {
        case 'completed':
          console.log('[FlowPilot] ✅ All done!');
          await StateManager.setStatus(STATES.COMPLETED);
          await StateManager.setAutoMode(false);
          this.button.setState('completed');
          // Reset to idle after 30s
          setTimeout(() => {
            this.button.setState('idle');
            StateManager.reset();
          }, 30000);
          break;

        case 'limit_hit':
          console.log('[FlowPilot] ⏰ Limit hit again, auto-mode will re-schedule');
          // LimitDetector will detect the new message and
          // auto-schedule because autoMode is still true
          this.limitDetector.resetDetection();
          await StateManager.setStatus(STATES.LIMIT_DETECTED);
          this.button.setState('limit_detected');
          break;

        case 'error':
          console.warn('[FlowPilot] ❌ Resume failed, retrying in 60s');
          const retryIn = Date.now() + 60000;
          await this._scheduleResume(retryIn, 'retry');
          break;
      }
    }

    async _checkResumeState() {
      const status = await StateManager.getStatus();
      console.log('[FlowPilot] Current state on load:', status);

      if (status === STATES.RESUMING) {
        console.log('[FlowPilot] Resuming from stored state…');
        await Helpers.sleep(2000, 1000);
        await this._executeResume();
      }
    }

    async _syncButtonState() {
      const data = await StateManager.getAll();
      const status = data[StateManager.K.STATE] || STATES.IDLE;
      const retryDisplay = data[StateManager.K.RETRY_DISPLAY] || '';
      const retryTime = data[StateManager.K.RETRY_TIME] || 0;
      this.button.setState(status, retryDisplay, retryTime);
    }
  }

  /* ── Bootstrap ─────────────────────────────────────────── */
  const controller = new FlowPilotController();
  controller.init().catch((err) =>
    console.error('[FlowPilot] Init failed:', err)
  );
})();
