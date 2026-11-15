/**
 * Módulo de análisis estadístico agroclimático.
 * - Calcula distribuciones Gaussianas (Normal) para variables térmicas continuas (Tmean, Tmax, Tmin).
 * - Calcula estadísticos no paramétricos (percentiles, mediana, IQR) para variables asimétricas como la lluvia.
 */

export function computeThermalStats(values) {
  const clean = values.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  const n = clean.length;
  if (n < 5) return null;

  const mean = clean.reduce((acc, v) => acc + v, 0) / n;
  const variance = clean.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  const percentile = (p) => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return clean[lo];
    return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo);
  };

  return {
    n,
    mean: Number(mean.toFixed(1)),
    std: Number(std.toFixed(1)),
    min: Number(clean[0].toFixed(1)),
    max: Number(clean[n - 1].toFixed(1)),
    p05: Number(percentile(5).toFixed(1)),
    median: Number(percentile(50).toFixed(1)),
    p95: Number(percentile(95).toFixed(1)),
    minus1Sigma: Number((mean - std).toFixed(1)),
    plus1Sigma: Number((mean + std).toFixed(1))
  };
}

/**
 * Función de densidad de probabilidad Normal (Campana de Gauss)
 */
export function gaussianPdf(x, mean, std) {
  if (!std || std <= 0) return 0;
  const exponent = -0.5 * ((x - mean) / std) ** 2;
  return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
}

/**
 * Genera el eje X común, las curvas Gaussianas y el histograma empírico normalizado
 * para visualizar distribución, dispersión y comparación entre períodos.
 */
export function buildGaussianComparisonData(records, mode = 'all_curves') {
  if (!Array.isArray(records) || records.length < 30) return null;

  // Rango térmico global con margen de seguridad
  const allTemps = records
    .flatMap((r) => [r.tmin, r.tmax])
    .filter((v) => v != null && !Number.isNaN(v));

  const xMin = Math.floor(Math.min(...allTemps) - 3);
  const xMax = Math.ceil(Math.max(...allTemps) + 3);
  const step = 0.5;
  const xGrid = [];
  for (let x = xMin; x <= xMax; x += step) {
    xGrid.push(Number(x.toFixed(1)));
  }

  // Histograma empírico de Tmean en intervalos de 2 °C (normalizado como densidad)
  const binWidth = 2;
  const tmeanVals = records.map((r) => r.tmean).filter((v) => v != null);
  const histogramDensity = xGrid.map((x) => {
    const binStart = Math.floor(x / binWidth) * binWidth;
    const binEnd = binStart + binWidth;
    const count = tmeanVals.filter((v) => v >= binStart && v < binEnd).length;
    return Number((count / (tmeanVals.length * binWidth)).toFixed(4));
  });

  if (mode === 'compare_periods') {
    const years = [...new Set(records.map((r) => r.year))].sort();
    const midIdx = Math.floor(years.length / 2);
    const earlyYears = years.slice(0, midIdx);
    const recentYears = years.slice(midIdx);

    const earlyRecords = records.filter((r) => earlyYears.includes(r.year));
    const recentRecords = records.filter((r) => recentYears.includes(r.year));

    const statsEarly = computeThermalStats(earlyRecords.map((r) => r.tmean));
    const statsRecent = computeThermalStats(recentRecords.map((r) => r.tmean));

    return {
      mode,
      xGrid,
      histogramDensity,
      curves: [
        {
          label: `Período ${earlyYears[0]}–${earlyYears[earlyYears.length - 1]} (T media)`,
          stats: statsEarly,
          color: '#2563eb',
          data: xGrid.map((x) => Number(gaussianPdf(x, statsEarly.mean, statsEarly.std).toFixed(4)))
        },
        {
          label: `Período ${recentYears[0]}–${recentYears[recentYears.length - 1]} (T media)`,
          stats: statsRecent,
          color: '#dc2626',
          data: xGrid.map((x) => Number(gaussianPdf(x, statsRecent.mean, statsRecent.std).toFixed(4)))
        }
      ]
    };
  }

  if (mode === 'seasonal') {
    const warmMonths = [10, 11, 12, 1, 2, 3];
    const coldMonths = [4, 5, 6, 7, 8, 9];
    const statsWarm = computeThermalStats(
      records.filter((r) => warmMonths.includes(r.month)).map((r) => r.tmean)
    );
    const statsCold = computeThermalStats(
      records.filter((r) => coldMonths.includes(r.month)).map((r) => r.tmean)
    );

    return {
      mode,
      xGrid,
      histogramDensity,
      curves: [
        {
          label: 'Semestre cálido (Oct–Mar)',
          stats: statsWarm,
          color: '#ea580c',
          data: xGrid.map((x) => Number(gaussianPdf(x, statsWarm.mean, statsWarm.std).toFixed(4)))
        },
        {
          label: 'Semestre frío (Abr–Sep)',
          stats: statsCold,
          color: '#0284c7',
          data: xGrid.map((x) => Number(gaussianPdf(x, statsCold.mean, statsCold.std).toFixed(4)))
        }
      ]
    };
  }

  // Modo por defecto: 3 curvas Gaussianas completas (Tmin, Tmean, Tmax)
  const statsTmin = computeThermalStats(records.map((r) => r.tmin));
  const statsTmean = computeThermalStats(records.map((r) => r.tmean));
  const statsTmax = computeThermalStats(records.map((r) => r.tmax));

  return {
    mode: 'all_curves',
    xGrid,
    histogramDensity,
    curves: [
      {
        label: 'Temp. Mínima diaria (Tmin)',
        stats: statsTmin,
        color: '#2563eb',
        data: xGrid.map((x) => Number(gaussianPdf(x, statsTmin.mean, statsTmin.std).toFixed(4)))
      },
      {
        label: 'Temp. Media diaria (Tmean)',
        stats: statsTmean,
        color: '#1f4d2b',
        data: xGrid.map((x) => Number(gaussianPdf(x, statsTmean.mean, statsTmean.std).toFixed(4)))
      },
      {
        label: 'Temp. Máxima diaria (Tmax)',
        stats: statsTmax,
        color: '#dc2626',
        data: xGrid.map((x) => Number(gaussianPdf(x, statsTmax.mean, statsTmax.std).toFixed(4)))
      }
    ]
  };
}
