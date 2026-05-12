/**
 * ResumeEngine — Handles resuming Claude's generation.
 *
 * Uses the user's custom command from storage (set via the input popup).
 *
 * Strategy:
 *  1. Wait for page DOM to be ready
 *  2. Try clicking "Continue generating" button (native Claude feature)
 *  3. Fallback: type the user's custom command and submit
 *  4. Monitor for completion
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
     * Reads the custom command from storage.
     * @returns {Promise<'completed'|'limit_hit'|'error'>}
     */
    async execute() {
      console.log('[FlowPilot] ResumeEngine executing…');

      try {
        await StateManager.setStatus(STATES.RESUMING);

        // Get the user's custom command from storage
        const customCommand = (await StateManager.get(StateManager.K.CUSTOM_CMD)) || 'continue';
        console.log('[FlowPilot] Custom command:', customCommand);

        // 1. Wait for page to fully load + React hydration
        console.log('[FlowPilot] Waiting for page readiness…');
        await Helpers.sleep(3000, 2000);

        // 2. Primary: try clicking "Continue generating" button
        const continued = await this._tryContinueButton();

        if (!continued) {
          // 3. Fallback: type the user's custom command and send
          const sent = await this._trySendMessage(customCommand);
          if (!sent) {
            console.warn('[FlowPilot] Could not find any way to continue');
            return 'error';
          }
        }

        // 4. Monitor for completion
        console.log('[FlowPilot] Monitoring generation…');
        await Helpers.sleep(2000, 1000);
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
      const variations = [
        'continue generating',
        'resume',
        'try again',
      ];

      for (const text of variations) {
        const btn = Helpers.findButtonByText(text);
        if (btn) {
          console.log(`[FlowPilot] Found button: "${text}"`);
          await Helpers.sleep(500, 500);
          btn.click();
          await Helpers.sleep(1000, 500);
          return true;
        }
      }

      console.log('[FlowPilot] No continue button found, using custom command…');
      return false;
    }

    /**
     * Type the user's custom command into the textarea and submit.
     * @param {string} message — the command to send
     */
    async _trySendMessage(message) {
      const textarea = Helpers.findTextarea();
      if (!textarea) {
        console.warn('[FlowPilot] No textarea found');
        return false;
      }

      console.log(`[FlowPilot] Typing: "${message}"`);
      await Helpers.typeText(textarea, message);
      await Helpers.sleep(500, 300);

      // Try to find and click the send button
      const sendBtn =
        Helpers.findButtonByText('send') ||
        document.querySelector('button[aria-label*="send" i]') ||
        document.querySelector('button[type="submit"]');

      if (sendBtn) {
        console.log('[FlowPilot] Clicking send button');
        sendBtn.click();
      } else {
        console.log('[FlowPilot] No send button, pressing Enter');
        Helpers.pressEnter(textarea);
      }

      await Helpers.sleep(1000, 500);
      return true;
    }

    abort() {
      this.completionDetector.stop();
    }
  }

  window.CAR.ResumeEngine = ResumeEngine;
})();
