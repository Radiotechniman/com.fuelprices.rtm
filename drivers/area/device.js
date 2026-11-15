'use strict';

const Homey = require('homey');
const { fetchStations } = require('../../lib/anwb');
const { DAY, WEEK, record, priceAgo, round3 } = require('../../lib/history');

module.exports = class AreaDevice extends Homey.Device {

  async onAdded() {
    this.log('[pair-debug] onAdded', this.getName());
  }

  async onInit() {
    this.log('[pair-debug] onInit', this.getName());
    this.timer = null;
    this.schedule({ auto_refresh: this.getSetting('auto_refresh'), interval: this.getSetting('interval') });
    // Not awaited: a slow first request must not keep the device (and the pairing screen) waiting.
    this.refresh().catch(this.error);
  }

  schedule({ auto_refresh: auto, interval }) {
    if (this.timer) this.homey.clearInterval(this.timer);
    this.timer = null;
    if (auto === false) return;
    this.timer = this.homey.setInterval(() => this.refresh(), interval * 60 * 1000);
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes('interval') || changedKeys.includes('auto_refresh')) this.schedule(newSettings);
    if (changedKeys.includes('radius')) {
      this.homey.setTimeout(() => this.refresh().catch(this.error), 0);
    }
  }

  async onDeleted() {
    if (this.timer) this.homey.clearInterval(this.timer);
  }

  // The flow action passes throwOnError so a failed refresh shows up in the flow instead of only as a warning.
  async refresh({ throwOnError = false } = {}) {
    const { fuelType, lat, lon } = this.getStore();
    try {
      const stations = await fetchStations({
        lat, lon, radiusKm: this.getSetting('radius'), fuelType,
      });
      const priced = stations.filter(s => typeof s.prices[fuelType] === 'number');
      if (priced.length === 0) {
        await this.setWarning(this.homey.__('error.no_stations'));
        return;
      }
      await this.unsetWarning();
      await this.update(priced, fuelType);
    } catch (err) {
      this.error('Refresh failed:', err.message);
      await this.setWarning(err.message);
      if (throwOnError) throw err;
    }
  }

  async update(priced, fuelType) {
    const now = Date.now();
    // Stations are sorted nearest first, so on a tie the nearest one wins.
    const cheapest = priced.reduce((best, s) => (s.prices[fuelType] < best.prices[fuelType] ? s : best));
    const price = cheapest.prices[fuelType];
    const average = priced.reduce((sum, s) => sum + s.prices[fuelType], 0) / priced.length;

    const history = record(this.getStoreValue('history') || [], now, price);
    await this.setStoreValue('history', history);

    const previousLowest = this.getStoreValue('lowestEver');
    const lowestEver = previousLowest == null ? price : Math.min(previousLowest, price);
    const highestEver = Math.max(this.getStoreValue('highestEver') ?? price, price);
    await this.setStoreValue('lowestEver', lowestEver);
    await this.setStoreValue('highestEver', highestEver);

    const previousPrice = this.getCapabilityValue('measure_fuel_price');
    const dayAgo = priceAgo(history, now, DAY);
    const weekAgo = priceAgo(history, now, WEEK);

    await Promise.all([
      this.setCapabilityValue('measure_fuel_price', price),
      this.setCapabilityValue('fuel_price_average', round3(average)),
      this.setCapabilityValue('fuel_price_lowest_ever', lowestEver),
      this.setCapabilityValue('fuel_price_highest_ever', highestEver),
      this.setCapabilityValue('fuel_price_change_day', dayAgo == null ? null : round3(price - dayAgo)),
      this.setCapabilityValue('fuel_price_change_week', weekAgo == null ? null : round3(price - weekAgo)),
      this.setCapabilityValue('fuel_station_name', cheapest.title),
      this.setCapabilityValue('fuel_station_address', cheapest.address),
      this.setCapabilityValue('fuel_station_distance', Math.round(cheapest.distanceKm * 10) / 10),
      this.setCapabilityValue('fuel_station_count', priced.length),
    ]);

    const previousCheapest = this.getStoreValue('cheapest');
    await this.setStoreValue('cheapest', { id: cheapest.id, title: cheapest.title });
    if (previousCheapest && previousCheapest.id !== cheapest.id) {
      await this.homey.flow.getDeviceTriggerCard('area_cheapest_changed')
        .trigger(this, {
          station: cheapest.title, address: cheapest.address, price, previous_station: previousCheapest.title,
        })
        .catch(this.error);
    }

    if (previousPrice != null && price !== previousPrice) {
      await this.homey.flow.getDeviceTriggerCard('area_price_changed')
        .trigger(this, {
          price, previous_price: previousPrice, change: round3(price - previousPrice), station: cheapest.title,
        })
        .catch(this.error);
    }

    if (previousPrice != null && price < previousPrice) {
      await this.homey.flow.getDeviceTriggerCard('area_price_drops_below')
        .trigger(this, { price, station: cheapest.title }, { previous: previousPrice, current: price })
        .catch(this.error);
    }

    if (previousLowest != null && price < previousLowest) {
      await this.homey.flow.getDeviceTriggerCard('area_new_lowest_ever')
        .trigger(this, { price, station: cheapest.title })
        .catch(this.error);
    }
  }

};
