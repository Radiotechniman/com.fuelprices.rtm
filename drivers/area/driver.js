'use strict';

const Homey = require('homey');
const { fetchStations } = require('../../lib/anwb');
const { handleAddressStep } = require('../../lib/pairing');
const { label } = require('../../lib/fuels');

module.exports = class AreaDriver extends Homey.Driver {

  async onInit() {
    this.homey.flow.getConditionCard('area_price_below')
      .registerRunListener(({ device, price }) => {
        const current = device.getCapabilityValue('measure_fuel_price');
        return current != null && current < price;
      });

    this.homey.flow.getActionCard('area_refresh')
      .registerRunListener(({ device }) => device.refresh({ throwOnError: true }));

    // Fires only when the price crosses the threshold, not on every update below it.
    this.homey.flow.getDeviceTriggerCard('area_price_drops_below')
      .registerRunListener(({ price }, { previous, current }) => previous >= price && current < price);
  }

  async onPair(session) {
    const getLocation = handleAddressStep(session, this.homey);

    session.setHandler('list_devices', async () => {
      const { lat, lon, radiusKm, label: place } = getLocation();
      this.log('[pair-debug] list_devices start', place, radiusKm);
      const stations = await fetchStations({ lat, lon, radiusKm });
      this.log('[pair-debug] list_devices stations', stations.length);

      const fuels = new Map();
      stations.forEach(s => {
        Object.keys(s.prices).forEach(type => {
          if (!fuels.has(type)) fuels.set(type, s.fuelNames[type]);
        });
      });
      if (fuels.size === 0) throw new Error(this.homey.__('pair.no_stations'));

      return [...fuels].map(([fuelType, apiName]) => ({
        name: `${label(fuelType, apiName)} · ${place}`,
        data: { id: `${fuelType}:${lat.toFixed(5)}:${lon.toFixed(5)}` },
        store: { fuelType, lat, lon },
        settings: { address: place, radius: radiusKm },
      }));
    });
  }

};
