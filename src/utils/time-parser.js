/**
 * TimeParser — Extracts retry timestamps from Claude's limit messages.
 * Handles AM/PM, next-day rollover, and various message formats.
 */
(function () {
  'use strict';

  window.CAR = window.CAR || {};

  const TimeParser = {
    /**
     * Primary patterns for limit messages.
     * Claude can phrase them in multiple ways; we try several.
     */
    PATTERNS: [
      /out of free messages until\s+(\d{1,2}:\d{2}\s*[APap][Mm])/i,
      /limit resets?\s+(?:at\s+)?(\d{1,2}:\d{2}\s*[APap][Mm])/i,
      /try again\s+(?:at\s+)?(\d{1,2}:\d{2}\s*[APap][Mm])/i,
      /available\s+(?:at\s+)?(\d{1,2}:\d{2}\s*[APap][Mm])/i,
      /wait until\s+(\d{1,2}:\d{2}\s*[APap][Mm])/i,
      /(\d{1,2}:\d{2}\s*[APap][Mm])\s*(?:today|tomorrow)?/i,
    ],

    /**
     * Extract a time string from text.
     * @param {string} text — full message body
     * @returns {string|null} e.g. "2:50 AM"
     */
    extractTimeString(text) {
      if (!text) return null;
      for (const pattern of this.PATTERNS) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1].trim();
      }
      return null;
    },

    /**
     * Parse "2:50 AM" → future Date timestamp (ms).
     * Rolls over to next day if the time has already passed.
     * Adds a 90-second buffer so we don't fire too early.
     */
    parseToTimestamp(timeStr) {
      if (!timeStr) return null;

      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*([APap][Mm])/);
      if (!match) return null;

      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const meridiem = match[3].toUpperCase();

      // Convert 12-hour → 24-hour
      if (meridiem === 'AM' && hours === 12) hours = 0;
      if (meridiem === 'PM' && hours !== 12) hours += 12;

      const now = new Date();
      const target = new Date(now);
      target.setHours(hours, minutes, 0, 0);

      // If target is in the past, assume next day
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }

      // Add 90-second safety buffer
      const BUFFER_MS = 90 * 1000;
      return target.getTime() + BUFFER_MS;
    },

    /**
     * Full pipeline: raw text → { timeStr, timestamp }
     */
    parse(text) {
      const timeStr = this.extractTimeString(text);
      if (!timeStr) return null;
      const timestamp = this.parseToTimestamp(timeStr);
      if (!timestamp) return null;
      return { timeStr, timestamp };
    },
  };

  window.CAR.TimeParser = TimeParser;
})();
