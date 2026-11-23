'use strict';

const Homey = require('homey');

const DEFAULT_INTERVAL = 60;
const MAX_LOG = 100;

module.exports = class FuelPricesApp extends Homey.App {

  async onInit() {
    this.log('Fuel Prices app started');
    this.homey.settings.on('set', key => {
      if (key === 'defaultInterval') this.rescheduleDevices();
    });
  }

  getDefaultInterval() {
    const value = Number(this.homey.settings.get('defaultInterval'));
    return value >= 5 ? value : DEFAULT_INTERVAL;
  }

  // A device interval of 0 (or empty) means "follow the app default".
  effectiveInterval(deviceInterval) {
    return deviceInterval > 0 ? deviceInterval : this.getDefaultInterval();
  }

  rescheduleDevices() {
    Object.values(this.homey.drivers.getDrivers()).forEach(driver => {
      driver.getDevices().forEach(device => device.reschedule());
    });
  }

  // One line per refresh, newest last; shown on the settings page.
  logRefresh({ device, ok, ms, detail }) {
    const log = this.homey.settings.get('log') || [];
    log.push({ t: Date.now(), device, ok, ms, detail });
    this.homey.settings.set('log', log.slice(-MAX_LOG));
  }

  // Current schedule per device, for the status block on the settings page.
  getStatus() {
    const devices = [];
    Object.values(this.homey.drivers.getDrivers()).forEach(driver => {
      driver.getDevices().forEach(device => devices.push(device.getScheduleInfo()));
    });
    return { defaultInterval: this.getDefaultInterval(), devices };
  }

};
