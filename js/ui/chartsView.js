import { buildGaussianComparisonData } from '../domain/statistics.js';
import { t, getMonthNames, getLang } from '../i18n/translations.js';

export function renderGaussianChart(canvasEl, chartStore, era5, mode = 'all_curves') {
  if (!canvasEl || !era5?.records?.length) return null;

  const gaussianData = buildGaussianComparisonData(era5.records, mode);
  if (!gaussianData) return null;

  if (chartStore.gaussian) {
    chartStore.gaussian.destroy();
  }

  const lang = getLang();
  const translateCurveLabel = (rawLabel) => {
    if (lang === 'es') return rawLabel;
    return rawLabel
      .replace('Temp. Mínima diaria (Tmin)', 'Daily Min Temp (Tmin)')
      .replace('Temp. Media diaria (Tmean)', 'Daily Mean Temp (Tmean)')
      .replace('Temp. Máxima diaria (Tmax)', 'Daily Max Temp (Tmax)')
      .replace('Período', 'Period')
      .replace('(T media)', '(Tmean)')
      .replace('Semestre cálido (Oct–Mar)', 'Warm half-year (Oct–Mar)')
      .replace('Semestre frío (Abr–Sep)', 'Cold half-year (Apr–Sep)');
  };

  const datasets = [
    {
      type: 'bar',
      label: t('chartObservedHist'),
      data: gaussianData.histogramDensity,
      backgroundColor: 'rgba(76, 139, 63, 0.16)',
      borderColor: 'rgba(76, 139, 63, 0.35)',
      borderWidth: 1,
      barPercentage: 1.0,
      categoryPercentage: 1.0,
      order: 2
    },
    ...gaussianData.curves.map((curve) => ({
      type: 'line',
      label: `${translateCurveLabel(curve.label)} (μ=${curve.stats.mean}°C, σ=${curve.stats.std}°C)`,
      data: curve.data,
      borderColor: curve.color,
      backgroundColor: curve.color + '22',
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.35,
      fill: mode !== 'all_curves',
      order: 1
    }))
  ];

  chartStore.gaussian = new window.Chart(canvasEl, {
    type: 'line',
    data: {
      labels: gaussianData.xGrid.map((x) => `${x} °C`),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: {
          display: true,
          text: `${t('chartGaussTitle')} · ${era5.source}`
        }
      },
      scales: {
        x: {
          title: { display: true, text: t('chartTempAxis') },
          ticks: { maxTicksLimit: 14 }
        },
        y: {
          title: { display: true, text: t('chartDensityAxis') },
          beginAtZero: true
        }
      }
    }
  });

  return gaussianData;
}

export function renderAnnualHydrologyChart(canvasEl, chartStore, era5, clim) {
  if (!canvasEl) return;
  if (chartStore.hydrology) {
    chartStore.hydrology.destroy();
  }

  const hasEra5 = Boolean(era5?.monthlySummary?.length);
  const rainMonthly = hasEra5
    ? era5.monthlySummary.map((m) => Number((m.rainMonthlyAvg || 0).toFixed(1)))
    : clim?.rain
    ? clim.rain.map((r) => (r != null ? Number((r * 30.4).toFixed(1)) : 0))
    : [];

  const et0Monthly = hasEra5
    ? era5.monthlySummary.map((m) => Number((m.et0MonthlyAvg || 0).toFixed(1)))
    : [];

  const datasets = [
    {
      type: 'bar',
      label: hasEra5 ? t('chartRainEra5') : t('chartRainNasa'),
      data: rainMonthly,
      backgroundColor: '#3b82f6aa',
      borderRadius: 6
    }
  ];

  if (et0Monthly.length) {
    datasets.push({
      type: 'line',
      label: t('chartEt0Line'),
      data: et0Monthly,
      borderColor: '#d97706',
      backgroundColor: '#d9770622',
      borderWidth: 2.5,
      tension: 0.3
    });
  }

  chartStore.hydrology = new window.Chart(canvasEl, {
    type: 'bar',
    data: { labels: getMonthNames(), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: t('chartHydroTitle')
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: t('chartMmAxis') }
        }
      }
    }
  });
}

export function renderAgroPhysicsChart(canvasEl, chartStore, agroPhysics) {
  if (!canvasEl || !agroPhysics?.photoperiod) return;
  if (chartStore.agroPhysics) {
    chartStore.agroPhysics.destroy();
  }

  const daylight = agroPhysics.photoperiod.monthlyDaylight.map((m) => m.hours);
  const frostDays = agroPhysics.frostRisk?.monthlyFrost?.map((m) => m.frostDaysAvg) || Array(12).fill(0);
  const freezeThaw = agroPhysics.freezeThaw?.monthlyCycles?.map((m) => m.cyclesAvg) || Array(12).fill(0);

  chartStore.agroPhysics = new window.Chart(canvasEl, {
    type: 'bar',
    data: {
      labels: getMonthNames(),
      datasets: [
        {
          type: 'line',
          label: t('chartDaylightLine'),
          data: daylight,
          borderColor: '#eab308',
          backgroundColor: '#eab30822',
          borderWidth: 2.5,
          yAxisID: 'yLight',
          tension: 0.35
        },
        {
          type: 'bar',
          label: t('chartFrostBars'),
          data: frostDays,
          backgroundColor: '#0284c7aa',
          yAxisID: 'yDays'
        },
        {
          type: 'bar',
          label: t('chartFreezeThawBars'),
          data: freezeThaw,
          backgroundColor: '#8b5cf6aa',
          yAxisID: 'yDays'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: t('chartPhysicsTitle')
        }
      },
      scales: {
        yLight: {
          type: 'linear',
          position: 'left',
          min: 6,
          max: 18,
          title: { display: true, text: t('chartLightAxis') }
        },
        yDays: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: t('chartDaysAxis') }
        }
      }
    }
  });
}
