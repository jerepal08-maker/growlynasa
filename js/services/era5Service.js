import { CONFIG } from '../config.js';
import { fetchJson } from '../utils/httpClient.js';

const roundCoord = (val) => Number(val).toFixed(3);

export async function fetchEra5History(lat, lon, signal = null) {
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 9;
  const startDate = `${startYear}-01-01`;
  const endDate = `${endYear}-12-31`;

  const params = new URLSearchParams({
    latitude: roundCoord(lat),
    longitude: roundCoord(lon),
    start_date: startDate,
    end_date: endDate,
    timezone: 'auto',
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'precipitation_sum',
      'relative_humidity_2m_mean',
      'shortwave_radiation_sum',
      'wind_speed_10m_max',
      'et0_fao_evapotranspiration',
      'daylight_duration'
    ].join(',')
  });

  const url = `${CONFIG.ENDPOINTS.OPEN_METEO_HISTORICAL}?${params.toString()}`;
  const { data, fromCache } = await fetchJson(url, {
    ttlMs: CONFIG.CACHE_TTL.CLIMATOLOGY_MS,
    signal,
    timeoutMs: 20000
  });

  const d = data.daily || {};
  const times = d.time || [];

  const records = times.map((date, i) => ({
    date,
    month: Number(date.slice(5, 7)),
    year: Number(date.slice(0, 4)),
    tmax: d.temperature_2m_max?.[i] ?? null,
    tmin: d.temperature_2m_min?.[i] ?? null,
    tmean: d.temperature_2m_mean?.[i] ?? null,
    rain: d.precipitation_sum?.[i] ?? null,
    rh: d.relative_humidity_2m_mean?.[i] ?? null,
    rad: d.shortwave_radiation_sum?.[i] ?? null,
    windMax: d.wind_speed_10m_max?.[i] ?? null,
    et0: d.et0_fao_evapotranspiration?.[i] ?? null,
    daylightHours: d.daylight_duration?.[i] != null ? d.daylight_duration[i] / 3600 : null
  }));

  return {
    source: `Copernicus ERA5 (${startYear}–${endYear})`,
    isHistorical: true,
    fromCache,
    period: { startDate, endDate, years: 10, totalDays: records.length },
    records,
    monthlySummary: buildMonthlySummary(records, 10)
  };
}

function buildMonthlySummary(records, yearsCount) {
  const buckets = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    tmeanList: [],
    tmaxList: [],
    tminList: [],
    rainTotal: 0,
    et0Total: 0,
    rhList: [],
    radList: [],
    daylightList: [],
    frostDays: 0,
    freezeThawDays: 0
  }));

  for (const r of records) {
    const b = buckets[r.month - 1];
    if (!b) continue;
    if (r.tmean != null) b.tmeanList.push(r.tmean);
    if (r.tmax != null) b.tmaxList.push(r.tmax);
    if (r.tmin != null) {
      b.tminList.push(r.tmin);
      if (r.tmin <= 0) b.frostDays += 1;
      if (r.tmin < 0 && r.tmax != null && r.tmax > 0) b.freezeThawDays += 1;
    }
    if (r.rain != null) b.rainTotal += r.rain;
    if (r.et0 != null) b.et0Total += r.et0;
    if (r.rh != null) b.rhList.push(r.rh);
    if (r.rad != null) b.radList.push(r.rad);
    if (r.daylightHours != null) b.daylightList.push(r.daylightHours);
  }

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const stdDev = (arr, avgVal) => {
    if (arr.length < 2 || avgVal == null) return null;
    const variance = arr.reduce((acc, val) => acc + (val - avgVal) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  };

  return buckets.map((b) => {
    const tmeanAvg = mean(b.tmeanList);
    return {
      month: b.month,
      tmeanAvg,
      tmeanStd: stdDev(b.tmeanList, tmeanAvg),
      tmaxAvg: mean(b.tmaxList),
      tminAvg: mean(b.tminList),
      tminAbs: b.tminList.length ? Math.min(...b.tminList) : null,
      tmaxAbs: b.tmaxList.length ? Math.max(...b.tmaxList) : null,
      rainMonthlyAvg: b.rainTotal / yearsCount,
      et0MonthlyAvg: b.et0Total / yearsCount,
      rhAvg: mean(b.rhList),
      radAvg: mean(b.radList),
      daylightHoursAvg: mean(b.daylightList),
      frostDaysAvg: b.frostDays / yearsCount,
      freezeThawDaysAvg: b.freezeThawDays / yearsCount
    };
  });
}
