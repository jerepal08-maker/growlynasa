/**
 * Física Agroclimática:
 * A. Horas de luz y fotoperíodo astronómico vs. observado (ERA5)
 * B. Ciclos de congelación y descongelamiento (Freeze-Thaw)
 * C. Riesgo de heladas (diferenciando temperatura del aire a 2m vs. temperatura superficial)
 */

const MONTH_MID_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Ecuación astronómica CBM (Forsythe et al., 1995) para duración del día en horas
 */
export function calculateAstronomicalDaylight(latDeg, dayOfYear) {
  const latRad = (Number(latDeg) * Math.PI) / 180;
  const theta = 0.2163108 + 2 * Math.atan(0.9671396 * Math.tan(0.0086 * (dayOfYear - 186)));
  const phi = Math.asin(0.39795 * Math.cos(theta));
  const p = 0.8333; // Corrección por refracción atmosférica en el horizonte
  const num = Math.sin((p * Math.PI) / 180) + Math.sin(latRad) * Math.sin(phi);
  const den = Math.cos(latRad) * Math.cos(phi);
  const ratio = Math.max(-1, Math.min(1, num / den));
  const hours = 24 - (24 / Math.PI) * Math.acos(ratio);
  return Number(hours.toFixed(2));
}

function getDayOfYear(dateObj = new Date()) {
  const start = new Date(dateObj.getFullYear(), 0, 0);
  const diff = dateObj - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function analyzePhotoperiod(lat, era5Monthly = null) {
  const todayDoy = getDayOfYear(new Date());
  const currentDaylightHours = calculateAstronomicalDaylight(lat, todayDoy);

  const monthlyDaylight = MONTH_MID_DOY.map((doy, idx) => {
    const astro = calculateAstronomicalDaylight(lat, doy);
    const era5Val = era5Monthly?.[idx]?.daylightHoursAvg;
    return {
      month: idx + 1,
      label: MONTH_LABELS[idx],
      hours: era5Val != null ? Number(era5Val.toFixed(2)) : astro,
      source: era5Val != null ? 'ERA5' : 'Astronómico'
    };
  });

  const hoursArr = monthlyDaylight.map((m) => m.hours);
  const maxHours = Math.max(...hoursArr);
  const minHours = Math.min(...hoursArr);
  const seasonalAmplitude = Number((maxHours - minHours).toFixed(1));

  let regime = 'Estacionalidad lumínica moderada';
  if (seasonalAmplitude < 1.5) regime = 'Régimen ecuatorial/tropical (fotoperíodo casi constante)';
  else if (seasonalAmplitude > 4.5) regime = 'Alta amplitud estacional (fuerte contraste verano/invierno)';

  return {
    currentDaylightHours,
    maxDaylightHours: maxHours,
    minDaylightHours: minHours,
    seasonalAmplitude,
    regime,
    monthlyDaylight
  };
}

export function analyzeFreezeThaw(era5 = null) {
  if (!era5 || !Array.isArray(era5.records) || !era5.records.length) {
    return {
      available: false,
      annualFreezeThawCycles: null,
      annualSubZeroDays: null,
      maxSubZeroSpellDays: null,
      soilImpact: 'Sin serie histórica suficiente para evaluar ciclos de congelación-descongelación.'
    };
  }

  const years = era5.period?.years || 10;
  let totalCycles = 0;
  let totalSubZeroDays = 0;
  let maxSubZeroSpell = 0;
  let currentSubZeroSpell = 0;

  for (const r of era5.records) {
    if (r.tmin != null && r.tmin < 0) {
      totalSubZeroDays += 1;
      currentSubZeroSpell += 1;
      if (currentSubZeroSpell > maxSubZeroSpell) maxSubZeroSpell = currentSubZeroSpell;

      if (r.tmax != null && r.tmax > 0) {
        totalCycles += 1;
      }
    } else {
      currentSubZeroSpell = 0;
    }
  }

  const annualFreezeThawCycles = Number((totalCycles / years).toFixed(1));
  const annualSubZeroDays = Number((totalSubZeroDays / years).toFixed(1));

  let soilImpact = 'Sin episodios relevantes de congelación del suelo.';
  if (annualFreezeThawCycles >= 25) {
    soilImpact =
      'Alta frecuencia de ciclos hielo-deshielo: riesgo elevado de descalce radicular (frost heaving) en cultivos invernales y alteración estructural en suelos húmedos.';
  } else if (annualFreezeThawCycles >= 5) {
    soilImpact =
      'Ciclos moderados de congelación-descongelación: favorece la friabilidad superficial en barbecho, pero exige precaución en plántulas recién emergidas.';
  } else if (annualSubZeroDays > 0) {
    soilImpact = 'Episodios aislados bajo cero con bajo impacto estructural en el suelo.';
  }

  return {
    available: true,
    annualFreezeThawCycles,
    annualSubZeroDays,
    maxSubZeroSpellDays: maxSubZeroSpell,
    soilImpact,
    monthlyCycles: (era5.monthlySummary || []).map((m) => ({
      month: m.month,
      label: MONTH_LABELS[m.month - 1],
      cyclesAvg: Number((m.freezeThawDaysAvg || 0).toFixed(1))
    }))
  };
}

export function analyzeFrostRisk({ lat, wx, era5, nasaDaily, ecostress }) {
  const forecastMinAirTemp = wx?.daily?.length
    ? Math.min(...wx.daily.map((d) => d.tmin))
    : null;

  // Diferenciación explícita: temperatura del aire (2m) vs temperatura superficial de piel/dosel
  const airTemp2m = wx?.current?.temp ?? null;
  const surfaceTemp =
    ecostress?.available && ecostress.lstCelsius != null
      ? { value: ecostress.lstCelsius, source: 'NASA ECOSTRESS (dosel 70m)' }
      : nasaDaily?.summary?.latestSkinTemp != null
      ? { value: nasaDaily.summary.latestSkinTemp, source: 'NASA POWER TS (superficie terrestre)' }
      : null;

  const monthlyFrost = (era5?.monthlySummary || []).map((m) => ({
    month: m.month,
    label: MONTH_LABELS[m.month - 1],
    frostDaysAvg: Number((m.frostDaysAvg || 0).toFixed(1)),
    tminAbs: m.tminAbs
  }));

  const annualFrostDays = monthlyFrost.reduce((acc, m) => acc + m.frostDaysAvg, 0);
  const peakMonths = monthlyFrost
    .filter((m) => m.frostDaysAvg >= 1.5)
    .sort((a, b) => b.frostDaysAvg - a.frostDaysAvg)
    .slice(0, 3)
    .map((m) => `${m.label} (${m.frostDaysAvg} d/mes)`);

  // Riesgo inmediato (7 días) considerando que la superficie puede enfriarse ~2.5°C más que el aire a 2m
  let immediateLevel = 'bajo';
  let immediateNote = 'Sin riesgo de heladas en los próximos 7 días.';
  if (forecastMinAirTemp != null) {
    if (forecastMinAirTemp <= 0) {
      immediateLevel = 'alto';
      immediateNote = `Helada meteorológica prevista (${forecastMinAirTemp.toFixed(1)} °C en aire a 2m).`;
    } else if (forecastMinAirTemp <= 3) {
      immediateLevel = 'moderado';
      immediateNote = `Riesgo de helada agronómica/radiativa: aire previsto en ${forecastMinAirTemp.toFixed(1)} °C (a nivel de suelo puede descender bajo 0 °C).`;
    }
  }

  return {
    airTemp2m,
    surfaceTemp,
    forecastMinAirTemp,
    immediateLevel,
    immediateNote,
    annualFrostDays: Number(annualFrostDays.toFixed(1)),
    peakFrostMonths: peakMonths,
    monthlyFrost,
    hemisphere: Number(lat) >= 0 ? 'north' : 'south'
  };
}
