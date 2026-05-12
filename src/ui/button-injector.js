/**
 * ButtonInjector — Icon-only floating button + command input popup.
 *
 * Flow:
 *   Idle → icon only (no action on click, waits for limit)
 *   Limit detected → icon pulses amber. Click shows input popup.
 *   User enters command → popup closes → schedules resume.
 *   Scheduled → countdown ring. Click cancels.
 *   Resuming → spinning icon.
 *   Completed → green check badge.
 */
(function () {
  'use strict';

  window.CAR = window.CAR || {};

  const BTN_ID = 'flowpilot-floating-btn';
  const POPUP_ID = 'flowpilot-input-popup';

  const TOOLTIPS = {
    idle: 'FlowPilot — Watching for limits',
    limit_detected: 'Limit hit! Click to set up auto-resume',
    scheduled: 'Auto-resume scheduled. Click to cancel.',
    resuming: 'Resuming your conversation…',
    completed: 'Done! Generation complete.',
  };

  class ButtonInjector {
    constructor() {
      this._observer = null;
      this._currentState = 'idle';
      this._retryTimestamp = 0;
      this._retryTimeDisplay = '';
      this._onClick = null;
      this._countdownInterval = null;
      this._totalDuration = 0;
    }

    /** Inject the floating icon button */
    inject(onClick) {
      this._onClick = onClick;
      this._createButton();
      this._watchForRemoval();
      console.log('[FlowPilot] Button injected');
    }

    /** Update visual state */
    setState(state, retryTimeDisplay = '', retryTimestamp = 0) {
      this._currentState = state;
      this._retryTimeDisplay = retryTimeDisplay;
      this._retryTimestamp = retryTimestamp;
      this._totalDuration = 0; // reset for new countdown
      this._updateButton();
      this._manageCountdown();
    }

    destroy() {
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.remove();
      this.hideInputPopup();
      this._stopCountdown();
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
    }

    /* ── Input Popup ─────────────────────────────────────── */

    /**
     * Show the command input popup above the button.
     * @param {string} retryTimeDisplay — e.g. "2:50 AM"
     * @param {Function} onSubmit — called with (command: string)
     */
    showInputPopup(retryTimeDisplay, onSubmit) {
      this.hideInputPopup();

      const popup = document.createElement('div');
      popup.id = POPUP_ID;
      popup.className = 'car-input-popup';
      popup.innerHTML = `
        <div class="car-input-title">What should I send?</div>
        <div class="car-input-hint">
          Will be sent when tokens reset${retryTimeDisplay ? ' at <strong>' + retryTimeDisplay + '</strong>' : ''}
        </div>
        <input
          type="text"
          class="car-input-field"
          id="car-cmd-input"
          placeholder='e.g., continue generating the code...'
          value="continue"
          spellcheck="false"
          autocomplete="off"
        />
        <div class="car-input-actions">
          <button class="car-input-btn car-input-cancel-btn" id="car-cmd-cancel">Cancel</button>
          <button class="car-input-btn car-input-submit-btn" id="car-cmd-submit">Schedule →</button>
        </div>
      `;

      document.body.appendChild(popup);

      // Focus and select the default text
      const input = document.getElementById('car-cmd-input');
      setTimeout(() => { input.focus(); input.select(); }, 100);

      // Submit handler
      const submit = () => {
        const cmd = input.value.trim();
        if (cmd) {
          this.hideInputPopup();
          onSubmit(cmd);
        }
      };

      document.getElementById('car-cmd-submit').addEventListener('click', submit);

      // Enter to submit, Escape to cancel
      input.addEventListener('keydown', (e) => {
        e.stopPropagation(); // don't let Claude intercept keys
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') this.hideInputPopup();
      });

      // Prevent all key events from reaching Claude's editor
      popup.addEventListener('keydown', (e) => e.stopPropagation());
      popup.addEventListener('keyup', (e) => e.stopPropagation());
      popup.addEventListener('keypress', (e) => e.stopPropagation());

      // Cancel
      document.getElementById('car-cmd-cancel').addEventListener('click', () => {
        this.hideInputPopup();
      });

      // Click outside to close
      const outsideHandler = (e) => {
        if (!popup.contains(e.target) && e.target.id !== BTN_ID) {
          this.hideInputPopup();
          document.removeEventListener('click', outsideHandler, true);
        }
      };
      setTimeout(() => document.addEventListener('click', outsideHandler, true), 200);
    }

    /** Hide the input popup */
    hideInputPopup() {
      const popup = document.getElementById(POPUP_ID);
      if (popup) popup.remove();
    }

    /** Is the input popup currently visible? */
    isPopupOpen() {
      return !!document.getElementById(POPUP_ID);
    }

    /* ── Button rendering ────────────────────────────────── */

    _getIconUrl() {
      return chrome.runtime.getURL('icons/icon128.png');
    }

    _createButton() {
      if (document.getElementById(BTN_ID)) {
        this._updateButton();
        return;
      }

      const btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.className = 'car-fab car-state-idle';
      btn.innerHTML = this._buildHTML();
      btn.setAttribute('aria-label', 'FlowPilot Auto Resume');
      btn.setAttribute('title', TOOLTIPS.idle);

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._onClick) this._onClick();
      });

      document.body.appendChild(btn);
    }

    _updateButton() {
      const btn = document.getElementById(BTN_ID);
      if (!btn) { this._createButton(); return; }

      btn.className = `car-fab car-state-${this._currentState}`;
      btn.innerHTML = this._buildHTML();

      let tooltip = TOOLTIPS[this._currentState] || TOOLTIPS.idle;
      btn.setAttribute('title', tooltip);

      btn.style.cursor = this._currentState === 'resuming' ? 'default' : 'pointer';
    }

    _buildHTML() {
      const iconUrl = this._getIconUrl();
      const state = this._currentState;

      // SVG countdown ring (scheduled state)
      const ring = state === 'scheduled'
        ? `<svg class="car-countdown-ring" viewBox="0 0 56 56">
             <circle class="car-ring-track" cx="28" cy="28" r="25" />
             <circle class="car-ring-progress" cx="28" cy="28" r="25" id="car-ring-arc" />
           </svg>`
        : '';

      // Countdown badge (scheduled state)
      const badge = state === 'scheduled'
        ? '<span class="car-time-badge" id="car-countdown-badge"></span>'
        : '';

      // Green check (completed state)
      const check = state === 'completed'
        ? '<span class="car-check-badge">✓</span>'
        : '';

      // Amber alert dot (limit_detected state)
      const alert = state === 'limit_detected'
        ? '<span class="car-alert-dot"></span>'
        : '';

      return `
        <img src="${iconUrl}" class="car-fab-icon" alt="FlowPilot" draggable="false" />
        ${ring}${badge}${check}${alert}
      `;
    }

    /* ── Countdown ───────────────────────────────────────── */

    _manageCountdown() {
      this._stopCountdown();
      if (this._currentState === 'scheduled' && this._retryTimestamp > 0) {
        this._startCountdown();
      }
    }

    _startCountdown() {
      this._tickCountdown();
      this._countdownInterval = setInterval(() => this._tickCountdown(), 1000);
    }

    _stopCountdown() {
      if (this._countdownInterval) {
        clearInterval(this._countdownInterval);
        this._countdownInterval = null;
      }
    }

    _tickCountdown() {
      const now = Date.now();
      const remaining = Math.max(0, this._retryTimestamp - now);

      if (remaining <= 0) { this._stopCountdown(); return; }

      // Update badge (mm:ss)
      const totalSec = Math.ceil(remaining / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      const badge = document.getElementById('car-countdown-badge');
      if (badge) badge.textContent = `${min}:${sec.toString().padStart(2, '0')}`;

      // Update ring arc
      const arc = document.getElementById('car-ring-arc');
      if (arc) {
        const circumference = 2 * Math.PI * 25;
        if (!this._totalDuration) this._totalDuration = remaining;
        const progress = 1 - (remaining / this._totalDuration);
        const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));
        arc.style.strokeDasharray = `${circumference}`;
        arc.style.strokeDashoffset = `${offset}`;
      }
    }

    /* ── Re-injection watcher ────────────────────────────── */

    _watchForRemoval() {
      if (this._observer) return;
      this._observer = new MutationObserver(() => {
        if (!document.getElementById(BTN_ID)) {
          console.log('[FlowPilot] Button removed, re-injecting…');
          this._createButton();
        }
      });
      this._observer.observe(document.body, { childList: true, subtree: false });
    }
  }

  window.CAR.ButtonInjector = ButtonInjector;
})();
