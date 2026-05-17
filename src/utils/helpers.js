/**
 * Helpers — DOM utilities, delays, and safe query helpers.
 */
(function () {
  'use strict';

  window.CAR = window.CAR || {};

  const Helpers = {
    /**
     * Sleep with randomised jitter to mimic human timing.
     * @param {number} base — base delay in ms
     * @param {number} jitter — max random jitter in ms
     */
    sleep(base, jitter = 0) {
      const delay = base + Math.floor(Math.random() * jitter);
      return new Promise((resolve) => setTimeout(resolve, delay));
    },

    /**
     * Wait for an element matching a predicate to appear in the DOM.
     * Polls rather than using MutationObserver so we can set a timeout.
     * @param {Function} predicate — receives no args, should return Element|null
     * @param {number} timeout — max wait in ms (default 30 s)
     * @param {number} interval — poll interval in ms
     * @returns {Promise<Element|null>}
     */
    async waitForElement(predicate, timeout = 30000, interval = 500) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const el = predicate();
        if (el) return el;
        await this.sleep(interval);
      }
      return null;
    },

    /**
     * Find a button whose visible text includes `text` (case-insensitive).
     * Searches <button>, [role="button"], and clickable elements.
     */
    findButtonByText(text) {
      const lower = text.toLowerCase();
      const candidates = document.querySelectorAll(
        'button, [role="button"], [tabindex="0"]'
      );
      for (const el of candidates) {
        const content = (el.textContent || el.innerText || '').trim().toLowerCase();
        if (content.includes(lower)) return el;
      }
      return null;
    },

    /**
     * Find the Claude chat textarea / contenteditable input.
     */
    findTextarea() {
      // ProseMirror contenteditable (Claude's editor)
      const prosemirror = document.querySelector(
        '[contenteditable="true"].ProseMirror, div[contenteditable="true"][data-placeholder]'
      );
      if (prosemirror) return prosemirror;

      // Fallback: plain textarea
      const textarea = document.querySelector(
        'textarea[placeholder], div[contenteditable="true"]'
      );
      return textarea || null;
    },

    /**
     * Simulate human-like typing into a contenteditable or textarea.
     */
    async typeText(element, text) {
      element.focus();
      await this.sleep(200, 100);

      if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        // Native input
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeSetter) nativeSetter.call(element, text);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        // Contenteditable (ProseMirror)
        element.textContent = '';
        await this.sleep(50);
        // Use insertText command for React compatibility
        document.execCommand('insertText', false, text);
      }

      await this.sleep(300, 200);
    },

    /**
     * Simulate pressing Enter to submit.
     */
    pressEnter(element) {
      const opts = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true };
      element.dispatchEvent(new KeyboardEvent('keydown', opts));
      element.dispatchEvent(new KeyboardEvent('keypress', opts));
      element.dispatchEvent(new KeyboardEvent('keyup', opts));
    },

    /**
     * Scan all text nodes in the document for a substring.
     * More reliable than selector-based approaches for React apps.
     * @returns {Element|null} the closest parent element containing the text
     */
    findElementByText(searchText) {
      const lower = searchText.toLowerCase();
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.toLowerCase().includes(lower)) {
          return node.parentElement;
        }
      }
      return null;
    },

    /** Generate a unique element ID */
    uid() {
      return 'car-' + Math.random().toString(36).slice(2, 9);
    },

    /**
     * Extract the Chat UUID from a Claude URL.
     * Format: https://claude.ai/chat/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
     * @param {string} url
     * @returns {string|null}
     */
    extractChatId(url) {
      if (!url) return null;
      const match = url.match(/\/chat\/([a-f0-9-]{36})/i);
      return match ? match[1] : null;
    },
  };

  window.CAR.Helpers = Helpers;
})();
