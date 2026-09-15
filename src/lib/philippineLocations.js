import { listMuncities, listProvinces } from '@jobuntux/psgc'

const NCR_PROVINCE_NAME = 'Metro Manila'

// PSGC has no real "province" entry for Metro Manila -- all 16 NCR cities are
// Highly Urbanized Cities (HUCs) filed as their own province-level records
// (cityClass "HUC", no parent provCode). Grouping them under one synthetic
// "Metro Manila" entry matches how every other PH province dropdown presents
// NCR and keeps them out of the flat province list below.
const NCR_REG_CODE = '13'

// The 17 non-NCR HUCs are, per PSGC, also standalone province-level records
// with no parent province -- but people address mail to them by their real
// surrounding province (e.g. "City of Cebu" -> Cebu), so this maps each one
// back to it for the city/municipality dropdown. Static because HUC status
// changes only by legislation, not by dataset refresh.
const HUC_TO_PROVINCE = {
  'City of Angeles': 'Pampanga',
  'City of Bacolod': 'Negros Occidental',
  'City of Baguio': 'Benguet',
  'City of Butuan': 'Agusan del Norte',
  'City of Cagayan De Oro': 'Misamis Oriental',
  'City of Cebu': 'Cebu',
  'City of Davao': 'Davao del Sur',
  'City of General Santos': 'South Cotabato',
  'City of Iligan': 'Lanao del Norte',
  'City of Iloilo': 'Iloilo',
  'City of Lapu-Lapu': 'Cebu',
  'City of Lucena': 'Quezon',
  'City of Mandaue': 'Cebu',
  'City of Olongapo': 'Zambales',
  'City of Puerto Princesa': 'Palawan',
  'City of Tacloban': 'Leyte',
  'City of Zamboanga': 'Zamboanga del Sur'
}

const ALL_PROVINCE_RECORDS = listProvinces()

// Real provinces only -- excludes every HUC (cityClass set), which PSGC
// files as its own province-level record rather than as part of a province.
const PROVINCES = ALL_PROVINCE_RECORDS.filter((province) => !province.cityClass)
  .map((province) => ({ code: province.provCode, name: province.provName.trim() }))
  .filter((province) => province.code && province.name)

const NCR_CITY_NAMES = ALL_PROVINCE_RECORDS.filter(
  (province) => province.cityClass && province.regCode === NCR_REG_CODE
)
  .map((province) => province.provName.trim())
  .sort((a, b) => a.localeCompare(b))

const PROVINCE_NAMES = [...PROVINCES.map((p) => p.name), NCR_PROVINCE_NAME].sort(
  (a, b) => a.localeCompare(b)
)

// Non-NCR HUCs, keyed by the real province they should appear under in the
// city/municipality dropdown (see HUC_TO_PROVINCE above).
const EXTRA_CITIES_BY_PROVINCE = ALL_PROVINCE_RECORDS.filter(
  (province) => province.cityClass && province.regCode !== NCR_REG_CODE
).reduce((map, province) => {
  const hucName = province.provName.trim()
  const parentProvince = HUC_TO_PROVINCE[hucName]
  if (!parentProvince) {
    return map
  }
  if (!map[parentProvince]) {
    map[parentProvince] = []
  }
  map[parentProvince].push(hucName)
  return map
}, {})

// Before this fix, the Province dropdown listed all 33 HUCs directly, so an
// existing saved record can have e.g. province: "City of Caloocan" -- no
// longer a valid option (it's "Metro Manila" now, or its real province for
// the 17 non-NCR HUCs). Only used to pre-fill the edit form with a value
// that actually matches a current dropdown option; never touches stored
// data.
const LEGACY_PROVINCE_REMAP = ALL_PROVINCE_RECORDS.filter(
  (province) => province.cityClass
).reduce((map, province) => {
  const hucName = province.provName.trim()
  map[hucName] =
    province.regCode === NCR_REG_CODE
      ? NCR_PROVINCE_NAME
      : HUC_TO_PROVINCE[hucName] || hucName
  return map
}, {})

export function normalizeLegacyProvince(provinceName) {
  return LEGACY_PROVINCE_REMAP[provinceName] || provinceName
}

export function getProvinceNames() {
  return PROVINCE_NAMES
}

export function getCityNamesForProvince(provinceName) {
  if (provinceName === NCR_PROVINCE_NAME) {
    return NCR_CITY_NAMES
  }

  const province = PROVINCES.find((entry) => entry.name === provinceName)
  if (!province) {
    return []
  }

  const cities = listMuncities(province.code).map((city) => city.munCityName.trim())
  const extraCities = EXTRA_CITIES_BY_PROVINCE[provinceName] || []

  return [...cities, ...extraCities].sort((a, b) => a.localeCompare(b))
}
