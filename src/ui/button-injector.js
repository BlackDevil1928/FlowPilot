/**
 * ButtonInjector — Icon-only floating button for FlowPilot.
 *
 * Always displays as a circular icon. No text in any state.
 * States are communicated through:
 *   - Border glow color
 *   - Countdown ring (SVG arc) when scheduled
 *   - Subtle pulse/spin animations
 *
 * User clicks icon once when limit is hit → extension takes over.
 */
(function () {
  'use strict';

  window.CAR = window.CAR || {};

  const BTN_ID = 'flowpilot-floating-btn';

  const TOOLTIPS = {
    idle: 'FlowPilot — Auto resume is ready',
    limit_detected: 'Limit detected! Click to auto-resume',
    scheduled: 'Resuming in {time}…',
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
    }

    inject(onClick) {
      this._onClick = onClick;
      this._createButton();
      this._watchForRemoval();
      console.log('[FlowPilot] Button injected');
    }

    setState(state, retryTimeDisplay = '', retryTimestamp = 0) {
      this._currentState = state;
      this._retryTimeDisplay = retryTimeDisplay;
      this._retryTimestamp = retryTimestamp;
      this._updateButton();
      this._manageCountdown();
    }

    destroy() {
      const btn = document.getElementById(BTN_ID);
      if (btn) btn.remove();
      this._stopCountdown();
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
    }

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
      if (this._retryTimeDisplay) {
        tooltip = tooltip.replace('{time}', this._retryTimeDisplay);
      }
      btn.setAttribute('title', tooltip);

      btn.style.cursor = this._currentState === 'resuming' ? 'default' : 'pointer';
    }

    _buildHTML() {
      const iconUrl = this._getIconUrl();
      const state = this._currentState;

      // SVG countdown ring (shown when scheduled)
      const ring = state === 'scheduled'
        ? `<svg class="car-countdown-ring" viewBox="0 0 56 56">
             <circle class="car-ring-track" cx="28" cy="28" r="25" />
             <circle class="car-ring-progress" cx="28" cy="28" r="25" id="car-ring-arc" />
           </svg>`
        : '';

      // Countdown time badge (shown when scheduled)
      const badge = state === 'scheduled'
        ? `<span class="car-time-badge" id="car-countdown-badge"></span>`
        : '';

      // Green check badge (shown when completed)
      const check = state === 'completed'
        ? `<span class="car-check-badge">✓</span>`
        : '';

      // Alert dot for limit_detected
      const alert = state === 'limit_detected'
        ? `<span class="car-alert-dot"></span>`
        : '';

      return `
        <img src="${iconUrl}" class="car-fab-icon" alt="FlowPilot" draggable="false" />
        ${ring}${badge}${check}${alert}
      `;
    }

    /* ── Countdown timer ────────────────────────────────── */

    _manageCountdown() {
      this._stopCountdown();

      if (this._currentState === 'scheduled' && this._retryTimestamp > 0) {
        this._startCountdown();
      }
    }

    _startCountdown() {
      this._tickCountdown(); // initial tick
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

      if (remaining <= 0) {
        this._stopCountdown();
        return;
      }

      // Update badge text (mm:ss)
      const totalSec = Math.ceil(remaining / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      const badge = document.getElementById('car-countdown-badge');
      if (badge) {
        badge.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
      }

      // Update ring arc progress
      // We need total duration for progress. Estimate from storage or use remaining as 100%.
      const arc = document.getElementById('car-ring-arc');
      if (arc) {
        const circumference = 2 * Math.PI * 25; // r=25
        // Use a 1-hour max as reference (if wait is >1hr, ring fills slowly)
        const maxWait = Math.max(remaining, 3600000);
        const progress = 1 - (remaining / (this._totalDuration || maxWait));
        const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));
        arc.style.strokeDasharray = `${circumference}`;
        arc.style.strokeDashoffset = `${offset}`;

        // Store total on first tick
        if (!this._totalDuration) {
          this._totalDuration = remaining;
        }
      }
    }

    /* ── Re-injection watcher ───────────────────────────── */

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
