'use strict';

const https = require('https');

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE = 111.32;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' }, timeout: 15000 }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Returns [minLat, minLon, maxLat, maxLon], the order the ANWB API expects.
function boundingBox(lat, lon, radiusKm) {
  const dLat = radiusKm / KM_PER_DEGREE;
  const dLon = radiusKm / (KM_PER_DEGREE * Math.cos(toRad(lat)));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

// Geocodes a Dutch address / postcode / place name with the PDOK Locatieserver.
async function geocode(query) {
  const url = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free'
    + `?q=${encodeURIComponent(query)}&rows=1&fl=weergavenaam,centroide_ll`;
  const json = await getJson(url);
  const doc = json && json.response && json.response.docs && json.response.docs[0];
  if (!doc) return null;
  const match = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(doc.centroide_ll);
  if (!match) return null;
  return { label: doc.weergavenaam, lat: Number(match[2]), lon: Number(match[1]) };
}

module.exports = { getJson, distanceKm, boundingBox, geocode };
