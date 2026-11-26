'use strict';

const Homey = require('homey');

const DEFAULT_INTERVAL = 60;
const MAX_LOG = 100;

module.exports = class FuelPricesApp extends Homey.App {

  async onInit() {
    this.log('Fuel Prices app started');
    this.refreshLog = [];
    this.homey.settings.on('set', key => {
      if (key === 'defaultInterval') this.rescheduleDevices();
    });
  }

  getDefaultInterval() {
    const value = Number(this.homey.settings.get('defaultInterval'));
    return Number.isFinite(value) && value >= 5 && value <= 1440 ? Math.round(value) : DEFAULT_INTERVAL;
  }

  // A device interval of 0 (or empty) means "follow the app default".
  effectiveInterval(deviceInterval) {
    const value = Number(deviceInterval);
    return Number.isFinite(value) && value >= 5 && value <= 1440 ? Math.round(value) : this.getDefaultInterval();
  }

  rescheduleDevices() {
    Object.values(this.homey.drivers.getDrivers()).forEach(driver => {
      driver.getDevices().forEach(device => device.reschedule());
    });
  }

  // One line per refresh, newest last; kept in memory to avoid flash wear.
  logRefresh({ device, ok, ms, detail }) {
    if (!this.refreshLog) this.refreshLog = [];
    this.refreshLog.push({ t: Date.now(), device, ok, ms, detail });
    if (this.refreshLog.length > MAX_LOG) {
      this.refreshLog = this.refreshLog.slice(-MAX_LOG);
    }
  }

  clearLog() {
    this.refreshLog = [];
  }

  // Current schedule per device and recent refresh log, for the settings page.
  getStatus() {
    const devices = [];
    Object.values(this.homey.drivers.getDrivers()).forEach(driver => {
      driver.getDevices().forEach(device => devices.push(device.getScheduleInfo()));
    });
    return { defaultInterval: this.getDefaultInterval(), devices, log: this.refreshLog || [] };
  }

};
