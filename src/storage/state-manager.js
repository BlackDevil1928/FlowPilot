/**
 * StateManager — Persistent state via chrome.storage.local
 * All extension state survives restarts, refreshes, and SW suspension.
 */
(function () {
  'use strict';

  window.CAR = window.CAR || {};

  /** Storage key constants */
  const K = {
    STATE: 'car_state',
    AUTO_MODE: 'car_autoMode',
    RETRY_TIME: 'car_retryTime',
    RETRY_DISPLAY: 'car_retryTimeDisplay',
    CHAT_URL: 'car_chatUrl',
    RETRY_COUNT: 'car_retryCount',
  };

  /** Possible extension states */
  const STATES = Object.freeze({
    IDLE: 'idle',
    LIMIT_DETECTED: 'limit_detected',
    SCHEDULED: 'scheduled',
    RESUMING: 'resuming',
    COMPLETED: 'completed',
  });

  const StateManager = {
    STATES,
    K,

    /** Retrieve all stored values */
    async getAll() {
      return chrome.storage.local.get(Object.values(K));
    },

    /** Get a single stored value */
    async get(key) {
      const result = await chrome.storage.local.get(key);
      return result[key];
    },

    /** Set one or more stored values */
    async set(updates) {
      return chrome.storage.local.set(updates);
    },

    /** Current extension status */
    async getStatus() {
      return (await this.get(K.STATE)) || STATES.IDLE;
    },

    async setStatus(status) {
      console.log('[FlowPilot] State →', status);
      return this.set({ [K.STATE]: status });
    },

    /** Auto-mode flag — stays true after first user click until completion */
    async isAutoMode() {
      return (await this.get(K.AUTO_MODE)) || false;
    },

    async setAutoMode(enabled) {
      return this.set({ [K.AUTO_MODE]: enabled });
    },

    /** Retry counter */
    async getRetryCount() {
      return (await this.get(K.RETRY_COUNT)) || 0;
    },

    async incrementRetryCount() {
      const count = await this.getRetryCount();
      return this.set({ [K.RETRY_COUNT]: count + 1 });
    },

    /** Persist a scheduled resume */
    async scheduleResume(retryTime, retryTimeDisplay, chatUrl) {
      return this.set({
        [K.STATE]: STATES.SCHEDULED,
        [K.RETRY_TIME]: retryTime,
        [K.RETRY_DISPLAY]: retryTimeDisplay,
        [K.CHAT_URL]: chatUrl,
      });
    },

    /** Full reset back to idle */
    async reset() {
      console.log('[FlowPilot] State reset');
      return chrome.storage.local.remove(Object.values(K));
    },
  };

  window.CAR.StateManager = StateManager;
  window.CAR.STATES = STATES;
})();
