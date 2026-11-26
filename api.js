'use strict';

module.exports = {
  async getStatus({ homey }) {
    return homey.app.getStatus();
  },
  async clearLog({ homey }) {
    homey.app.clearLog();
    return { ok: true };
  },
};
