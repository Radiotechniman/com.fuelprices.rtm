'use strict';

const Homey = require('homey');

module.exports = class FuelPricesApp extends Homey.App {

  async onInit() {
    this.log('Fuel Prices app started');
  }

};
