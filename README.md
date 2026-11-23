# Fuel Prices for Homey

A [Homey](https://homey.app) app (SDK 3, `com.fuelprices.rtm`) that tracks fuel prices at the pump, either for your area or for a specific station.

> **🇳🇱 Netherlands only (for now).** Prices come from a Dutch source and addresses are looked up in the Dutch PDOK Locatieserver, so the app only works for stations and addresses in the Netherlands.

*Nederlandse beschrijving: zie [README.nl.txt](README.nl.txt).*

## Devices

- **Fuel price (area)**: one device per fuel type (e.g. Euro 95 or Diesel) for an address and search radius. Shows the lowest price, the cheapest station with address and distance, the average price, the number of stations, the change over the last day and week, and the lowest and highest price ever seen.
- **Fuel price (station)**: one device per station. Shows the price of every fuel it sells, the lowest and highest price ever seen per fuel, the address and, when known, whether it is open.

Both device types come with Flow cards (price changed, price drops below a value, new lowest price ever, cheapest station changed, refresh data) and a configurable update interval. See [README.txt](README.txt) for the full list.

## Installation from source

Once published, the app can be installed from the Homey App Store. The steps below are only for installing it from this repository.

Requires the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started):

```
npm install -g homey
npm install
homey app run       # run on your Homey for development
homey app install   # install on your Homey
```

## Data

Prices and station information come from the ANWB fuel price service; addresses are looked up with the PDOK Locatieserver. Prices are not guaranteed to be up to date or correct, so check the price at the pump. This app is not made by or affiliated with ANWB.

## Credits

Icons via [svgrepo.com](https://www.svgrepo.com).
