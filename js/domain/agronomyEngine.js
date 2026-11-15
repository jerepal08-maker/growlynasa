export const CROPS = [
  { n: 'Trigo', i: '🌾', topt: [12, 22], tmin: 3, tmax: 32, sow: [5, 6, 7], germ: '7–10 días', cycle: 200, water: 'media', kc: 1.1, soil: ['franco', 'arcilloso', 'franco-arenoso'], ph: [6, 7.5], frost: 'tolerante', rad: 'media' },
  { n: 'Maíz', i: '🌽', topt: [20, 30], tmin: 10, tmax: 35, sow: [9, 10, 11, 12], germ: '5–10 días', cycle: 150, water: 'alta', kc: 1.2, soil: ['franco', 'franco-arenoso'], ph: [5.8, 7], frost: 'sensible', rad: 'alta' },
  { n: 'Soja', i: '🫘', topt: [20, 30], tmin: 12, tmax: 35, sow: [10, 11, 12], germ: '5–8 días', cycle: 140, water: 'media', kc: 1.1, soil: ['franco', 'arcilloso'], ph: [6, 7], frost: 'sensible', rad: 'alta' },
  { n: 'Tomate', i: '🍅', topt: [18, 27], tmin: 10, tmax: 35, sow: [8, 9, 10], germ: '6–10 días', cycle: 120, water: 'alta', kc: 1.15, soil: ['franco', 'franco-arenoso'], ph: [6, 6.8], frost: 'sensible', rad: 'alta' },
  { n: 'Lechuga', i: '🥬', topt: [12, 20], tmin: 4, tmax: 28, sow: [3, 4, 5, 8, 9], germ: '3–7 días', cycle: 70, water: 'media', kc: 1, soil: ['franco', 'franco-arenoso'], ph: [6, 7], frost: 'moderada', rad: 'media' },
  { n: 'Papa', i: '🥔', topt: [15, 20], tmin: 7, tmax: 28, sow: [8, 9, 10], germ: '15–25 días', cycle: 120, water: 'alta', kc: 1.15, soil: ['franco-arenoso', 'franco'], ph: [5, 6.5], frost: 'sensible', rad: 'media' },
  { n: 'Girasol', i: '🌻', topt: [20, 28], tmin: 8, tmax: 35, sow: [9, 10, 11, 12], germ: '7–10 días', cycle: 130, water: 'baja', kc: 1.05, soil: ['franco', 'franco-arenoso', 'arcilloso'], ph: [6, 7.5], frost: 'moderada', rad: 'alta' },
  { n: 'Maní', i: '🥜', topt: [22, 30], tmin: 14, tmax: 35, sow: [10, 11], germ: '7–10 días', cycle: 150, water: 'media', kc: 1.05, soil: ['arenoso', 'franco-arenoso'], ph: [5.9, 7], frost: 'sensible', rad: 'alta' }
];

const FROST_THRESHOLDS = { sensible: 2, moderada: -1, tolerante: -6 };
const WATER_NEEDS_7D = { baja: 15, media: 25, alta: 40 };
const RADIATION_NEEDS = { baja: 10, media: 14, alta: 18 };

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));

export function buildAgroContext(weather, plot) {
  return {
    tmean: avg(weather.daily.map((d) => (d.tmax + d.tmin) / 2)),
    tmin: Math.min(...weather.daily.map((d) => d.tmin)),
    tmax: Math.max(...weather.daily.map((d) => d.tmax)),
    rain7: weather.daily.reduce((acc, d) => acc + d.rain, 0),
    rad: avg(weather.daily.map((d) => d.radiationSum)),
    month: new Date().getMonth() + 1,
    plot
  };
}

export function evaluateCrop(crop, ctx) {
  const factors = [];
  let cap = 100;

  const addFactor = (key, score, message, criticalCap = null) => {
    factors.push({ k: key, s: score, m: message });
    if (criticalCap !== null && score <= 20) {
      cap = Math.min(cap, criticalCap);
    }
  };

  const [tLo, tHi] = crop.topt;
  const tm = ctx.tmean;
  const tempScore = clamp(tm >= tLo && tm <= tHi ? 100 : 100 - (tm < tLo ? tLo - tm : tm - tHi) * 12);
  addFactor('Temperatura', tempScore, `Media prevista ${tm.toFixed(1)} °C; óptimo ${tLo}–${tHi} °C.`);

  const frostLimit = FROST_THRESHOLDS[crop.frost];
  const frostScore = ctx.tmin <= frostLimit ? 0 : ctx.tmin <= frostLimit + 3 ? 50 : 100;
  addFactor('Heladas', frostScore, `Mínima prevista ${ctx.tmin.toFixed(1)} °C; cultivo ${crop.frost} a heladas.`, 30);

  const heatScore = ctx.tmax > crop.tmax ? 0 : ctx.tmax > crop.tmax - 3 ? 60 : 100;
  addFactor('Calor extremo', heatScore, `Máxima prevista ${ctx.tmax.toFixed(1)} °C; tolera hasta ${crop.tmax} °C.`, 40);

  const m = ctx.month;
  const nearSow = crop.sow.some((s) => [1, 11].includes(Math.abs(s - m)));
  const sowScore = crop.sow.includes(m) ? 100 : nearSow ? 55 : 15;
  addFactor('Época de siembra', sowScore, `Siembra recomendada en meses ${crop.sow.join(', ')}.`, 50);

  const plot = ctx.plot;
  if (plot && plot.water === 'riego') {
    addFactor('Agua', 90, 'El terreno cuenta con riego.');
  } else {
    let waterScore = clamp(40 + (ctx.rain7 / WATER_NEEDS_7D[crop.water]) * 60);
    if (plot && plot.water === 'escasa') {
      waterScore = clamp(waterScore * 0.5);
    }
    addFactor(
      'Agua',
      waterScore,
      `Lluvia prevista 7 días: ${ctx.rain7.toFixed(1)} mm; demanda ${crop.water}${plot ? '' : ' (sin datos del terreno)'}.`
    );
  }

  const radScore = clamp((ctx.rad / RADIATION_NEEDS[crop.rad]) * 100);
  addFactor('Radiación', radScore, `Promedio previsto ${ctx.rad.toFixed(1)} MJ/m²/día; necesidad ${crop.rad}.`);

  if (plot) {
    addFactor(
      'Suelo',
      crop.soil.includes(plot.soil) ? 100 : 55,
      `Suelo ${plot.soil}; ideal: ${crop.soil.join(', ')}.`
    );
    if (plot.ph) {
      const ph = Number(plot.ph);
      const diff = ph < crop.ph[0] ? crop.ph[0] - ph : ph > crop.ph[1] ? ph - crop.ph[1] : 0;
      addFactor('pH', diff === 0 ? 100 : diff <= 0.5 ? 70 : 20, `pH ${ph}; rango ${crop.ph[0]}–${crop.ph[1]}.`, 60);
    }
  }

  const score = Math.min(Math.round(avg(factors.map((f) => f.s))), cap);
  const cls =
    score >= 75
      ? ['Muy adecuado', 'ok']
      : score >= 50
      ? ['Adecuado con condiciones', 'mid']
      : ['Poco recomendable', 'bad'];

  return {
    score,
    f: factors,
    capped: cap < 100 && score === cap,
    cls
  };
}

export function generateAlerts(weather) {
  const alerts = [];
  const d = weather.daily;
  const c = weather.current;
  const pushAlert = (level, title, text) => alerts.push({ l: level, t: title, x: text });

  const minTemp = Math.min(...d.map((z) => z.tmin));
  const maxTemp = Math.max(...d.map((z) => z.tmax));
  const totalRain = d.reduce((s, z) => s + z.rain, 0);
  const totalEt0 = d.reduce((s, z) => s + z.et0, 0);
  const maxDailyRain = Math.max(...d.map((z) => z.rain));
  const maxWind = Math.max(...d.map((z) => z.windMax));

  if (minTemp <= 0) {
    pushAlert('hi', 'Helada', `Mínima prevista de ${minTemp.toFixed(1)} °C en los próximos 7 días.`);
  } else if (minTemp <= 3) {
    pushAlert('me', 'Riesgo de helada', `Mínima prevista de ${minTemp.toFixed(1)} °C.`);
  }

  if (maxTemp >= 35) {
    pushAlert('hi', 'Temperatura extrema', `Máxima prevista de ${maxTemp.toFixed(1)} °C.`);
  }

  if (maxDailyRain >= 30) {
    pushAlert('hi', 'Precipitación intensa', `Hasta ${maxDailyRain.toFixed(0)} mm en un día.`);
  }

  if (maxWind >= 50) {
    pushAlert('hi', 'Viento fuerte', `Máximo diario de ${maxWind.toFixed(0)} km/h.`);
  }

  if (totalRain < 5 && totalEt0 > 25) {
    pushAlert('me', 'Riesgo de sequía', `Lluvia 7 días ${totalRain.toFixed(1)} mm vs. evapotranspiración ${totalEt0.toFixed(1)} mm.`);
  }

  if (c.rh >= 85 && c.temp >= 15 && c.temp <= 25) {
    pushAlert('me', 'Condiciones favorables a enfermedades fúngicas', `Humedad ${c.rh}% y ${c.temp} °C (indicador orientativo).`);
  }

  return alerts.length
    ? alerts
    : [{ l: 'lo', t: 'Sin alertas', x: 'No se detectan riesgos según los umbrales usados.' }];
}

export function calculateIrrigation(crop, weather, stageFactor) {
  const et0 = weather.daily.reduce((s, d) => s + d.et0, 0);
  const rain = weather.daily.reduce((s, d) => s + d.rain, 0);
  const etc = et0 * crop.kc * stageFactor;
  const balance = rain - etc;
  const soil = weather.soilMoisture;

  const why = [
    `ET0 7 días: ${et0.toFixed(1)} mm; ETc estimada (kc ${(crop.kc * stageFactor).toFixed(2)}): ${etc.toFixed(1)} mm.`,
    `Lluvia prevista: ${rain.toFixed(1)} mm. Balance: ${balance.toFixed(1)} mm.`
  ];

  if (soil != null) {
    why.push(`Humedad de suelo estimada (3–9 cm): ${(soil * 100).toFixed(0)} % vol.`);
  }

  let level, text;
  if (balance >= 0 && (soil == null || soil > 0.2)) {
    level = 'ok';
    text = 'La lluvia prevista cubriría la demanda; no parece necesario regar.';
  } else if (balance < -10 || (soil != null && soil < 0.12)) {
    level = 'bad';
    text = 'Déficit hídrico marcado: conviene planificar riego en los próximos días.';
  } else {
    level = 'mid';
    text = 'Déficit moderado: monitoreá la humedad del suelo y considerá regar si no llueve.';
  }

  return { l: level, t: text, why };
}
