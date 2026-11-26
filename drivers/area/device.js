'use strict';

const Homey = require('homey');
const { fetchStations } = require('../../lib/anwb');
const { formatStamp } = require('../../lib/time');
const { DAY, WEEK, record, priceAgo, round3 } = require('../../lib/history');

module.exports = class AreaDevice extends Homey.Device {

  async onInit() {
    this.timer = null;
    this.deleted = false;
    if (!this.hasCapability('fuel_last_update')) await this.addCapability('fuel_last_update');
    this.reschedule();
    // Respect auto_refresh=false on app restarts; a newly added device defaults to auto_refresh=true.
    if (this.getSetting('auto_refresh') !== false) {
      // Not awaited: a slow first request must not keep the device (and the pairing screen) waiting.
      this.refresh().catch(this.error);
    }
  }

  reschedule(settings = this.getSettings()) {
    if (this.timer) this.homey.clearInterval(this.timer);
    this.timer = null;
    this.intervalMinutes = null;
    if (settings.auto_refresh === false) return;
    this.intervalMinutes = this.homey.app.effectiveInterval(settings.interval);
    this.timer = this.homey.setInterval(
      () => this.refresh().catch(this.error),
      this.intervalMinutes * 60 * 1000,
    );
  }

  getScheduleInfo() {
    return { name: this.getName(), intervalMinutes: this.intervalMinutes, custom: this.getSetting('interval') > 0 };
  }

  async onSettings({ newSettings, changedKeys }) {
    const interval = Number(newSettings.interval);
    if (interval > 0 && interval < 5) throw new Error(this.homey.__('error.interval'));
    if (changedKeys.includes('interval') || changedKeys.includes('auto_refresh')) {
      // Use newSettings directly so we don't race against Homey persisting settings.
      this.reschedule(newSettings);
    }
    if (changedKeys.includes('radius') && newSettings.auto_refresh !== false) {
      this.refresh({ radius: newSettings.radius }).catch(this.error);
    }
  }

  async onUninit() {
    if (this.timer) this.homey.clearInterval(this.timer);
    this.timer = null;
  }

  async onDeleted() {
    this.deleted = true;
    if (this.timer) this.homey.clearInterval(this.timer);
    this.timer = null;
  }

  // The flow action passes throwOnError so a failed refresh shows up in the flow instead of only as a warning.
  async refresh({ throwOnError = false, radius } = {}) {
    if (this.deleted) return;
    const { fuelType, lat, lon } = this.getStore();
    const radiusKm = radius ?? this.getSetting('radius');
    const started = Date.now();
    try {
      const stations = await fetchStations({
        lat, lon, radiusKm, fuelType,
      });
      if (this.deleted) return;
      const priced = stations.filter(s => typeof s.prices[fuelType] === 'number');
      if (priced.length === 0) {
        await this.setWarning(this.homey.__('error.no_stations'));
        this.homey.app.logRefresh({ device: this.getName(), ok: false, ms: Date.now() - started, detail: 'no stations' });
        return;
      }
      await this.unsetWarning();
      await this.update(priced, fuelType);
      this.homey.app.logRefresh({
        device: this.getName(),
        ok: true,
        ms: Date.now() - started,
        detail: `${priced.length} stations, lowest ${this.getCapabilityValue('measure_fuel_price')}`,
      });
    } catch (err) {
      if (this.deleted) return;
      this.error('Refresh failed:', err.message);
      this.homey.app.logRefresh({ device: this.getName(), ok: false, ms: Date.now() - started, detail: err.message });
      await this.setWarning(err.message).catch(this.error);
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
      this.setCapabilityValue('fuel_last_update', formatStamp(new Date(now), this.homey.clock.getTimezone())),
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
