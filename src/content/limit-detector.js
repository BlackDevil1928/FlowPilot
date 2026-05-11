/**
 * LimitDetector — Watches Claude's DOM for free-message-limit banners.
 * Uses MutationObserver + text scanning (no brittle selectors).
 */
(function () {
  'use strict';

  window.CAR = window.CAR || {};

  const LIMIT_PHRASES = [
    'out of free messages until',
    'you\'ve reached your free message limit',
    'free messages limit',
    'usage limit reached',
    'limit resets at',
    'message limit',
  ];

  class LimitDetector {
    constructor() {
      this._observer = null;
      this._onDetect = null;         // callback(limitText)
      this._lastDetectedText = null;
      this._debounceTimer = null;
    }

    /**
     * Start observing the page for limit banners.
     * @param {Function} onDetect — called with the full banner text
     */
    start(onDetect) {
      if (this._observer) return; // already running
      this._onDetect = onDetect;

      // Do an initial scan in case the message is already there
      this._scanPage();

      // Observe subtree mutations for dynamic React updates
      this._observer = new MutationObserver(() => this._debouncedScan());
      this._observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      console.log('[FlowPilot] LimitDetector started');
    }

    /** Stop observing */
    stop() {
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
      clearTimeout(this._debounceTimer);
      console.log('[FlowPilot] LimitDetector stopped');
    }

    /** Debounced scan to avoid performance issues with rapid mutations */
    _debouncedScan() {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._scanPage(), 300);
    }

    /** Walk text nodes looking for limit phrases */
    _scanPage() {
      const bodyText = document.body.innerText || '';
      const lower = bodyText.toLowerCase();

      for (const phrase of LIMIT_PHRASES) {
        if (lower.includes(phrase)) {
          // Extract the surrounding sentence for time parsing
          const fullText = this._extractLimitSentence(bodyText, phrase);
          if (fullText && fullText !== this._lastDetectedText) {
            this._lastDetectedText = fullText;
            console.log('[FlowPilot] Limit detected:', fullText);
            if (this._onDetect) this._onDetect(fullText);
          }
          return;
        }
      }
    }

    /**
     * Extract the sentence containing the limit phrase.
     * Grabs up to 200 chars around the match for time parsing.
     */
    _extractLimitSentence(fullBody, phrase) {
      const idx = fullBody.toLowerCase().indexOf(phrase);
      if (idx === -1) return null;
      const start = Math.max(0, idx - 50);
      const end = Math.min(fullBody.length, idx + phrase.length + 150);
      return fullBody.slice(start, end).trim();
    }

    /** Reset so the same message can be detected again */
    resetDetection() {
      this._lastDetectedText = null;
    }
  }

  window.CAR.LimitDetector = LimitDetector;
})();
