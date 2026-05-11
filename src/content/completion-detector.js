/**
 * CompletionDetector — Determines when Claude has fully finished generating.
 *
 * Heuristics used:
 *  1. No active generation spinner / stop button visible
 *  2. No "Continue generating" button visible
 *  3. No limit banner detected
 *  4. DOM text content stable for 30+ seconds
 */
(function () {
  'use strict';

  window.CAR = window.CAR || {};

  const STABILITY_THRESHOLD_MS = 30000; // 30 seconds of stable DOM = done
  const CHECK_INTERVAL_MS = 2000;

  class CompletionDetector {
    constructor() {
      this._timer = null;
      this._lastTextSnapshot = '';
      this._stableStartTime = null;
    }

    /**
     * Begin watching for generation completion.
     * @returns {Promise<boolean>} resolves true when complete, false if limit hit
     */
    waitForCompletion() {
      return new Promise((resolve) => {
        this._resolve = resolve;
        this._lastTextSnapshot = this._getConversationText();
        this._stableStartTime = Date.now();

        this._timer = setInterval(() => this._check(), CHECK_INTERVAL_MS);
        console.log('[FlowPilot] CompletionDetector watching…');
      });
    }

    /** Stop watching */
    stop() {
      clearInterval(this._timer);
      this._timer = null;
    }

    /** Core check loop */
    _check() {
      // 1. Is the limit banner showing? → not complete, limit hit again
      if (this._isLimitBannerVisible()) {
        console.log('[FlowPilot] Limit banner reappeared during generation');
        this.stop();
        if (this._resolve) this._resolve(false);
        return;
      }

      // 2. Is there a stop button / spinner? → still generating
      if (this._isGenerating()) {
        this._resetStability();
        return;
      }

      // 3. Is there a "Continue generating" button? → not done yet
      if (this._hasContinueButton()) {
        this._resetStability();
        return;
      }

      // 4. Check text stability
      const currentText = this._getConversationText();
      if (currentText !== this._lastTextSnapshot) {
        this._lastTextSnapshot = currentText;
        this._resetStability();
        return;
      }

      // Text is stable — check if stable long enough
      const stableDuration = Date.now() - this._stableStartTime;
      if (stableDuration >= STABILITY_THRESHOLD_MS) {
        console.log('[FlowPilot] Generation appears complete (stable for 30s)');
        this.stop();
        if (this._resolve) this._resolve(true);
      }
    }

    /** Reset the stability timer */
    _resetStability() {
      this._stableStartTime = Date.now();
      this._lastTextSnapshot = this._getConversationText();
    }

    /** Check if Claude is actively streaming */
    _isGenerating() {
      // Look for stop button by text
      const stopBtn = window.CAR.Helpers.findButtonByText('stop');
      if (stopBtn) return true;

      // Look for a pulsing cursor / streaming indicator
      const cursor = document.querySelector(
        '[class*="cursor"], [class*="blink"], [class*="streaming"]'
      );
      return !!cursor;
    }

    /** Check for the "Continue generating" button */
    _hasContinueButton() {
      return !!window.CAR.Helpers.findButtonByText('continue generating');
    }

    /** Check if a limit banner is visible */
    _isLimitBannerVisible() {
      const text = (document.body.innerText || '').toLowerCase();
      return text.includes('out of free messages until') ||
             text.includes('usage limit reached') ||
             text.includes('message limit');
    }

    /** Snapshot the conversation area text for stability comparison */
    _getConversationText() {
      // Try to find the conversation container
      const container =
        document.querySelector('[class*="conversation"]') ||
        document.querySelector('[class*="thread"]') ||
        document.querySelector('main') ||
        document.body;
      return (container.innerText || '').slice(-2000); // last 2000 chars
    }
  }

  window.CAR.CompletionDetector = CompletionDetector;
})();
