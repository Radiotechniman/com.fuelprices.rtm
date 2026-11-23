'use strict';

const Homey = require('homey');
const { fetchStations } = require('../../lib/anwb');
const { label, subId } = require('../../lib/fuels');
const { isOpenNow } = require('../../lib/hours');
const { formatStamp } = require('../../lib/time');
const { round3 } = require('../../lib/history');

// A station is looked up by its coordinates; the box only needs to be a bit larger than the station itself.
const LOOKUP_RADIUS_KM = 0.15;

module.exports = class StationDevice extends Homey.Device {

  async onAdded() {
    this.log('[pair-debug] onAdded', this.getName());
  }

  async onInit() {
    this.log('[pair-debug] onInit', this.getName());
    this.timer = null;
    this.reschedule();
    // Not awaited: a slow first request must not keep the device (and the pairing screen) waiting.
    this.refresh().catch(this.error);
  }

  reschedule() {
    if (this.timer) this.homey.clearInterval(this.timer);
    this.timer = null;
    this.intervalMinutes = null;
    if (this.getSetting('auto_refresh') === false) return;
    this.intervalMinutes = this.homey.app.effectiveInterval(this.getSetting('interval'));
    this.timer = this.homey.setInterval(() => this.refresh(), this.intervalMinutes * 60 * 1000);
  }

  getScheduleInfo() {
    return { name: this.getName(), intervalMinutes: this.intervalMinutes, custom: this.getSetting('interval') > 0 };
  }

  async onSettings({ newSettings, changedKeys }) {
    const interval = newSettings.interval;
    if (interval > 0 && interval < 5) throw new Error(this.homey.__('error.interval'));
    if (changedKeys.includes('interval') || changedKeys.includes('auto_refresh')) {
      // The new values are only readable through getSetting after this handler returns.
      this.homey.setTimeout(() => this.reschedule(), 0);
    }
  }

  async onDeleted() {
    if (this.timer) this.homey.clearInterval(this.timer);
  }

  async ensureCapability(id, options) {
    if (!this.hasCapability(id)) await this.addCapability(id);
    if (options) await this.setCapabilityOptions(id, options);
  }

  // The flow action passes throwOnError so a failed refresh shows up in the flow instead of only as a warning.
  async refresh({ throwOnError = false } = {}) {
    const { lat, lon } = this.getStore();
    const { id } = this.getData();
    const started = Date.now();
    try {
      const stations = await fetchStations({ lat, lon, radiusKm: LOOKUP_RADIUS_KM });
      const station = stations.find(s => s.id === id);
      if (!station) throw new Error('Station not found in ANWB data');
      await this.unsetWarning();
      await this.update(station);
      this.homey.app.logRefresh({
        device: this.getName(),
        ok: true,
        ms: Date.now() - started,
        detail: `${Object.keys(station.prices).length} fuel prices`,
      });
    } catch (err) {
      this.error('Refresh failed:', err.message);
      this.homey.app.logRefresh({ device: this.getName(), ok: false, ms: Date.now() - started, detail: err.message });
      await this.setWarning(err.message);
      if (throwOnError) throw err;
    }
  }

  async update(station) {
    const known = this.getStore().fuels || [];
    const fuels = Object.keys(station.prices).map(type => ({ type, label: label(type, station.fuelNames[type]) }));

    // The station may start selling a fuel it did not offer at pairing time.
    const added = fuels.filter(f => !known.some(k => k.type === f.type));
    if (added.length > 0) await this.setStoreValue('fuels', [...known, ...added]);

    const extremes = this.getStoreValue('extremes') || {};
    for (const f of fuels) {
      const sub = subId(f.type);
      const cap = `measure_fuel_price.${sub}`;
      const lowestCap = `fuel_price_lowest_ever.${sub}`;
      const highestCap = `fuel_price_highest_ever.${sub}`;
      const price = station.prices[f.type];
      const previous = this.hasCapability(cap) ? this.getCapabilityValue(cap) : null;

      const seen = extremes[f.type] || { low: price, high: price };
      extremes[f.type] = { low: Math.min(seen.low, price), high: Math.max(seen.high, price) };

      await this.ensureCapability(cap, { title: { en: f.label, nl: f.label } });
      await this.ensureCapability(lowestCap, {
        title: { en: `${f.label} lowest ever`, nl: `${f.label} laagste ooit` },
      });
      await this.ensureCapability(highestCap, {
        title: { en: `${f.label} highest ever`, nl: `${f.label} hoogste ooit` },
      });
      await this.setCapabilityValue(cap, price);
      await this.setCapabilityValue(lowestCap, extremes[f.type].low);
      await this.setCapabilityValue(highestCap, extremes[f.type].high);

      if (previous != null && price !== previous) {
        await this.homey.flow.getDeviceTriggerCard('station_price_changed')
          .trigger(this, {
            price, previous_price: previous, change: round3(price - previous), fuel: f.label,
          }, { fuelType: f.type })
          .catch(this.error);
      }

      if (previous != null && price < previous) {
        await this.homey.flow.getDeviceTriggerCard('station_price_drops_below')
          .trigger(this, { price, fuel: f.label }, { fuelType: f.type, previous, current: price })
          .catch(this.error);
      }
    }
    await this.setStoreValue('extremes', extremes);
    // Fuels the station stopped selling show no value.
    for (const f of known.filter(k => !(k.type in station.prices))) {
      await this.setCapabilityValue(`measure_fuel_price.${subId(f.type)}`, null).catch(this.error);
    }

    await this.setCapabilityValue('fuel_station_address', station.address);
    await this.ensureCapability('fuel_last_update');
    await this.setCapabilityValue('fuel_last_update', formatStamp(new Date(), this.homey.clock.getTimezone()));

    const open = isOpenNow(station.openingHours, this.homey.clock.getTimezone());
    if (open !== null) {
      await this.ensureCapability('fuel_station_open');
      await this.setCapabilityValue('fuel_station_open', open);
    }
  }

};
