'use strict';

const Homey = require('homey');
const { fetchStations } = require('../../lib/anwb');
const { handleAddressStep } = require('../../lib/pairing');
const { label, subId } = require('../../lib/fuels');

module.exports = class StationDriver extends Homey.Driver {

  async onInit() {
    const fuelOptions = async (query, { device }) => (device.getStore().fuels || [])
      .map(f => ({ name: f.label, id: f.type }))
      .filter(f => f.name.toLowerCase().includes(query.toLowerCase()));

    const condition = this.homey.flow.getConditionCard('station_price_below');
    condition.registerArgumentAutocompleteListener('fuel', fuelOptions);
    condition.registerRunListener(({ device, fuel, price }) => {
      const current = device.getCapabilityValue(`measure_fuel_price.${subId(fuel.id)}`);
      if (current == null) throw new Error(this.homey.__('error.no_price'));
      return current < price;
    });

    this.homey.flow.getActionCard('station_refresh')
      .registerRunListener(({ device }) => device.refresh({ throwOnError: true }));

    const changed = this.homey.flow.getDeviceTriggerCard('station_price_changed');
    changed.registerArgumentAutocompleteListener('fuel', fuelOptions);
    changed.registerRunListener(({ fuel }, state) => fuel.id === state.fuelType);

    const trigger = this.homey.flow.getDeviceTriggerCard('station_price_drops_below');
    trigger.registerArgumentAutocompleteListener('fuel', fuelOptions);
    trigger.registerRunListener(({ fuel, price }, state) => fuel.id === state.fuelType
      && state.previous >= price && state.current < price);
  }

  async onPair(session) {
    const getLocation = handleAddressStep(session, this.homey);

    session.setHandler('list_devices', async () => {
      const { lat, lon, radiusKm } = getLocation();
      const stations = (await fetchStations({ lat, lon, radiusKm }))
        .filter(s => Object.keys(s.prices).length > 0);
      if (stations.length === 0) throw new Error(this.homey.__('pair.no_stations'));

      return stations.map(s => {
        const fuels = Object.keys(s.prices).map(type => ({ type, label: label(type, s.fuelNames[type]) }));
        // Prices first so the first fuel becomes the main capability.
        const capabilities = fuels.map(f => `measure_fuel_price.${subId(f.type)}`);
        const capabilitiesOptions = {};
        fuels.forEach(f => {
          const sub = subId(f.type);
          capabilities.push(`fuel_price_lowest_ever.${sub}`, `fuel_price_highest_ever.${sub}`);
          capabilitiesOptions[`measure_fuel_price.${sub}`] = { title: { en: f.label, nl: f.label } };
          capabilitiesOptions[`fuel_price_lowest_ever.${sub}`] = {
            title: { en: `${f.label} lowest ever`, nl: `${f.label} laagste ooit` },
          };
          capabilitiesOptions[`fuel_price_highest_ever.${sub}`] = {
            title: { en: `${f.label} highest ever`, nl: `${f.label} hoogste ooit` },
          };
        });
        capabilities.push('fuel_station_address', 'fuel_last_update');
        return {
          name: `${s.title} (${s.city}, ${s.distanceKm.toFixed(1)} km)`,
          data: { id: s.id },
          store: { lat: s.lat, lon: s.lon, fuels },
          settings: { address: s.address },
          capabilities,
          capabilitiesOptions,
        };
      });
    });
  }

};
