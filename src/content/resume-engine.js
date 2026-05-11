/**
 * ResumeEngine — Handles the actual automation of resuming Claude's generation.
 *
 * Strategy:
 *  1. Wait for page DOM to be ready
 *  2. Try clicking "Continue generating" button
 *  3. Fallback: type "continue" and submit
 *  4. Monitor completion
 */
(function () {
  'use strict';

  window.CAR = window.CAR || {};

  const { Helpers, StateManager, STATES } = window.CAR;

  class ResumeEngine {
    constructor() {
      this.completionDetector = new window.CAR.CompletionDetector();
    }

    /**
     * Execute the resume sequence.
     * @returns {Promise<'completed'|'limit_hit'|'error'>}
     */
    async execute() {
      console.log('[FlowPilot] ResumeEngine executing…');

      try {
        await StateManager.setStatus(STATES.RESUMING);

        // 1. Wait for the page to fully load
        console.log('[FlowPilot] Waiting for page readiness…');
        await Helpers.sleep(3000, 2000); // 3-5s for React hydration

        // 2. Attempt primary action: click "Continue generating"
        const continued = await this._tryContinueButton();

        if (!continued) {
          // 3. Fallback: type and send "continue"
          const sent = await this._trySendContinue();
          if (!sent) {
            console.warn('[FlowPilot] Could not find any way to continue');
            return 'error';
          }
        }

        // 4. Monitor for completion
        console.log('[FlowPilot] Monitoring generation…');
        await Helpers.sleep(2000, 1000); // let streaming begin
        const isComplete = await this.completionDetector.waitForCompletion();

        if (isComplete) {
          console.log('[FlowPilot] ✅ Generation completed!');
          return 'completed';
        } else {
          console.log('[FlowPilot] ⏰ Limit hit again during generation');
          return 'limit_hit';
        }
      } catch (err) {
        console.error('[FlowPilot] ResumeEngine error:', err);
        return 'error';
      }
    }

    /**
     * Try to find and click the "Continue generating" button.
     */
    async _tryContinueButton() {
      // Try several text variations
      const variations = [
        'continue generating',
        'continue',
        'resume',
        'try again',
      ];

      for (const text of variations) {
        const btn = Helpers.findButtonByText(text);
        if (btn) {
          console.log(`[FlowPilot] Found button: "${text}"`);
          await Helpers.sleep(500, 500); // human-like pause
          btn.click();
          await Helpers.sleep(1000, 500);
          return true;
        }
      }

      console.log('[FlowPilot] No continue button found, trying fallback…');
      return false;
    }

    /**
     * Fallback: Type "continue" into the textarea and submit.
     */
    async _trySendContinue() {
      const textarea = Helpers.findTextarea();
      if (!textarea) {
        console.warn('[FlowPilot] No textarea found');
        return false;
      }

      console.log('[FlowPilot] Typing "continue" into textarea');
      await Helpers.typeText(textarea, 'continue');
      await Helpers.sleep(500, 300);

      // Try to find and click the send/submit button
      const sendBtn =
        Helpers.findButtonByText('send') ||
        document.querySelector('button[aria-label*="send" i]') ||
        document.querySelector('button[type="submit"]');

      if (sendBtn) {
        console.log('[FlowPilot] Clicking send button');
        sendBtn.click();
      } else {
        // Fallback: press Enter
        console.log('[FlowPilot] No send button, pressing Enter');
        Helpers.pressEnter(textarea);
      }

      await Helpers.sleep(1000, 500);
      return true;
    }

    /** Abort any running detection */
    abort() {
      this.completionDetector.stop();
    }
  }

  window.CAR.ResumeEngine = ResumeEngine;
})();
