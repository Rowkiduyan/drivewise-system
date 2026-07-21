import { listMuncities, listProvinces } from '@jobuntux/psgc'

// Every current PSGC "province" entry (as of the 2025-2Q dataset, verified
// at build time) has its own provCode — including NCR, which is split into
// its 16 constituent cities (e.g. "City of Makati") rather than one lumped
// "Metro Manila" entry. The munCityCode fallback below is defensive in case
// a future PSGC release reintroduces province-less entries.
const PROVINCES = listProvinces()
  .map((province) => ({
    code: province.provCode || province.munCityCode,
    name: province.provName
  }))
  .filter((province) => province.code)
  .sort((a, b) => a.name.localeCompare(b.name))

export function getProvinceNames() {
  return PROVINCES.map((province) => province.name)
}

export function getCityNamesForProvince(provinceName) {
  const province = PROVINCES.find((entry) => entry.name === provinceName)
  if (!province) {
    return []
  }

  const cities = listMuncities(province.code)
  if (cities.length > 0) {
    return cities.map((city) => city.munCityName).sort((a, b) => a.localeCompare(b))
  }

  // NCR HUC "province" entries have no separate muncities list — the
  // province itself is the only selectable city.
  return [province.name]
}
