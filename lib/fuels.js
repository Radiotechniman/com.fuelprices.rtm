'use strict';

const LABELS = {
  EURO95: 'Euro 95 (E10)',
  EURO98: 'Super Plus 98 (E5)',
  DIESEL: 'Diesel (B7)',
  DIESEL_SPECIAL: 'Diesel Special',
  AUTOGAS: 'LPG',
  CNG: 'CNG',
};

function label(fuelType, apiName) {
  return apiName || LABELS[fuelType] || fuelType;
}

// Sub-capability id suffix: "measure_fuel_price.euro95"
function subId(fuelType) {
  return fuelType.toLowerCase().replace(/[^a-z0-9]/g, '');
}

module.exports = { label, subId };
