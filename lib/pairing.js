'use strict';

const { geocode } = require('./geo');

const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 25;

async function resolveLocation(homey, query) {
  if (!query) {
    const lat = homey.geolocation.getLatitude();
    const lon = homey.geolocation.getLongitude();
    if (typeof lat !== 'number' || typeof lon !== 'number') throw new Error(homey.__('pair.no_home'));
    return { lat, lon, label: homey.__('pair.home_location') };
  }
  const hit = await geocode(query);
  if (!hit) throw new Error(homey.__('pair.not_found'));
  return hit;
}

// Registers the 'geocode' handler of the custom address view; returns a getter for the chosen location.
function handleAddressStep(session, homey) {
  let location = null;
  session.setHandler('geocode', async ({ query, radius }) => {
    const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(0.5, Number(radius) || DEFAULT_RADIUS_KM));
    console.log('[pair-debug] geocode', query, radiusKm);
    location = { ...(await resolveLocation(homey, (query || '').trim())), radiusKm };
    console.log('[pair-debug] geocode done', location.label);
    return { label: location.label };
  });
  return () => {
    if (!location) throw new Error(homey.__('pair.no_location'));
    return location;
  };
}

module.exports = { handleAddressStep };
