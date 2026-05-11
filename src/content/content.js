/**
 * Content Script — Main orchestrator for FlowPilot
 *
 * This is the entry point loaded last in the content script chain.
 * It wires all modules together and manages the lifecycle:
 *
 *   init → detect limits → schedule resume → execute resume → detect completion
 *              ↑                                                    |
 *              └────────────── (if limit hit again) ────────────────┘
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

    /** Bootstrap everything */
    async init() {
      if (this._initialized) return;
      this._initialized = true;
      console.log('[FlowPilot] Initializing on', window.location.href);

      // Inject the floating button
      this.button.inject(() => this._onButtonClick());

      // Start listening for limit messages
      this.limitDetector.start((text) => this._onLimitDetected(text));

      // Listen for messages from background service worker
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        this._onMessage(msg, sender, sendResponse);
        return true; // keep channel open for async
      });

      // Check if we need to resume (e.g., page was just opened by alarm)
      await this._checkResumeState();

      // Sync button state with stored state
      await this._syncButtonState();

      console.log('[FlowPilot] Ready ✓');
    }

    /* ── Event Handlers ──────────────────────────────────────────── */

    /**
     * Called when LimitDetector finds a limit message.
     */
    async _onLimitDetected(limitText) {
      const parsed = TimeParser.parse(limitText);
      const status = await StateManager.getStatus();

      // Don't re-detect if we're already handling it
      if (status === STATES.SCHEDULED || status === STATES.RESUMING) return;

      console.log('[FlowPilot] Limit detected, parsed:', parsed);

      if (parsed) {
        // Store limit info
        await StateManager.set({
          [StateManager.K.STATE]: STATES.LIMIT_DETECTED,
          [StateManager.K.RETRY_TIME]: parsed.timestamp,
          [StateManager.K.RETRY_DISPLAY]: parsed.timeStr,
          [StateManager.K.CHAT_URL]: window.location.href,
        });

        this.button.setState('limit_detected', parsed.timeStr, parsed.timestamp);

        // If auto-mode is ON (user already clicked once), auto-schedule
        const autoMode = await StateManager.isAutoMode();
        if (autoMode) {
          console.log('[FlowPilot] Auto-mode active, scheduling automatically');
          await this._scheduleResume(parsed.timestamp, parsed.timeStr);
        }
      } else {
        // Limit detected but couldn't parse time — show generic state
        await StateManager.setStatus(STATES.LIMIT_DETECTED);
        this.button.setState('limit_detected', '');
      }
    }

    /**
     * Called when user clicks the floating button.
     */
    async _onButtonClick() {
      const status = await StateManager.getStatus();

      switch (status) {
        case STATES.IDLE:
        case STATES.COMPLETED:
          // Nothing to do yet — inform user
          console.log('[FlowPilot] No limit detected yet. Will activate when limit appears.');
          // Pre-enable auto mode so when limit IS detected, we auto-schedule
          await StateManager.setAutoMode(true);
          this.button.setState('idle');
          break;

        case STATES.LIMIT_DETECTED: {
          // User wants to auto-resume — schedule it
          await StateManager.setAutoMode(true);
          const data = await StateManager.getAll();
          const retryTime = data[StateManager.K.RETRY_TIME];
          const retryDisplay = data[StateManager.K.RETRY_DISPLAY];
          if (retryTime) {
            await this._scheduleResume(retryTime, retryDisplay);
          } else {
            console.warn('[FlowPilot] Retry time not available');
          }
          break;
        }

        case STATES.SCHEDULED:
          // Cancel the scheduled resume
          console.log('[FlowPilot] Cancelling scheduled resume');
          await this._cancelResume();
          break;

        case STATES.RESUMING:
          // Do nothing while resuming
          break;
      }
    }

    /**
     * Handle messages from the background service worker.
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

    /* ── Core Logic ──────────────────────────────────────────────── */

    /**
     * Schedule a resume via chrome.alarms through the background SW.
     */
    async _scheduleResume(retryTimestamp, retryDisplay) {
      console.log('[FlowPilot] Scheduling resume for', retryDisplay);

      // Persist the schedule
      await StateManager.scheduleResume(retryTimestamp, retryDisplay, window.location.href);
      await StateManager.incrementRetryCount();

      // Request alarm from background
      chrome.runtime.sendMessage({
        type: 'SCHEDULE_ALARM',
        retryTime: retryTimestamp,
        chatUrl: window.location.href,
      });

      this.button.setState('scheduled', retryDisplay, retryTimestamp);
    }

    /**
     * Cancel a scheduled resume.
     */
    async _cancelResume() {
      chrome.runtime.sendMessage({ type: 'CANCEL_ALARM' });
      await StateManager.setAutoMode(false);
      await StateManager.reset();
      this.limitDetector.resetDetection();
      this.button.setState('idle');
    }

    /**
     * Execute the resume sequence (called after alarm fires).
     */
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
          console.log('[FlowPilot] ⏰ Limit hit again, will re-schedule');
          // LimitDetector will pick up the new limit message
          // and auto-schedule because autoMode is still true
          this.limitDetector.resetDetection();
          await StateManager.setStatus(STATES.LIMIT_DETECTED);
          this.button.setState('limit_detected');
          break;

        case 'error':
          console.warn('[FlowPilot] ❌ Resume failed, retrying in 60s');
          // Schedule a quick retry
          const retryIn = Date.now() + 60000;
          await this._scheduleResume(retryIn, 'retry');
          break;
      }
    }

    /**
     * On page load, check if we're supposed to be resuming.
     * (e.g., background opened this tab after alarm fired)
     */
    async _checkResumeState() {
      const status = await StateManager.getStatus();
      console.log('[FlowPilot] Current state on load:', status);

      if (status === STATES.RESUMING) {
        // We were opened by the alarm — execute resume
        console.log('[FlowPilot] Resuming from stored state…');
        await Helpers.sleep(2000, 1000); // let page settle
        await this._executeResume();
      }
    }

    /**
     * Sync the button's visual state with stored state.
     */
    async _syncButtonState() {
      const data = await StateManager.getAll();
      const status = data[StateManager.K.STATE] || STATES.IDLE;
      const retryDisplay = data[StateManager.K.RETRY_DISPLAY] || '';
      const retryTime = data[StateManager.K.RETRY_TIME] || 0;
      this.button.setState(status, retryDisplay, retryTime);
    }
  }

  /* ── Bootstrap ───────────────────────────────────────────────── */
  const controller = new FlowPilotController();
  controller.init().catch((err) =>
    console.error('[FlowPilot] Init failed:', err)
  );
})();
