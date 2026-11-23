'use strict';

const { getJson, distanceKm, boundingBox } = require('./geo');

const BASE_URL = 'https://api.anwb.nl/routing/points-of-interest/v3/all';
const CACHE_MS = 60 * 1000;

const cache = new Map();

function normalize(raw, lat, lon) {
  const prices = {};
  const fuelNames = {};
  (raw.prices || []).forEach(p => {
    // The API reports 0 for fuels a station does not sell.
    if (typeof p.value === 'number' && p.value > 0) {
      prices[p.fuelType] = p.value;
      fuelNames[p.fuelType] = p.fuelName;
    }
  });
  const address = raw.address || {};
  return {
    id: raw.id,
    title: raw.title,
    address: [address.streetAddress, address.city].filter(Boolean).join(', '),
    city: address.city || '',
    lat: raw.coordinates.latitude,
    lon: raw.coordinates.longitude,
    distanceKm: distanceKm(lat, lon, raw.coordinates.latitude, raw.coordinates.longitude),
    prices,
    fuelNames,
    openingHours: raw.openingHours || null,
  };
}

// Fuel stations within radiusKm of (lat, lon), nearest first.
// Identical requests within CACHE_MS share one API call (several devices poll together).
function fetchStations({ lat, lon, radiusKm, fuelType }) {
  const box = boundingBox(lat, lon, radiusKm).map(n => n.toFixed(6)).join(',');
  let url = `${BASE_URL}?type-filter=FUEL_STATION&bounding-box-filter=${encodeURIComponent(box)}`;
  if (fuelType) url += `&fuel-type-filter=${encodeURIComponent(fuelType)}`;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;

  const promise = getJson(url).then(json => (json.value || [])
    .filter(raw => raw.coordinates)
    .map(raw => normalize(raw, lat, lon))
    .filter(s => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm));
  cache.set(url, { at: Date.now(), promise });
  promise.catch(() => cache.delete(url));
  return promise;
}

module.exports = { fetchStations };
