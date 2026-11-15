import { CONFIG, MONTH_NAMES, PRESET_REGIONS } from './config.js';
import { searchLocations, fetchWeatherForecast, fetchNasaClimatology } from './services/weatherService.js';
import { fetchEra5History } from './services/era5Service.js';
import { fetchTopography } from './services/topographyService.js';
import { fetchNasaPowerDaily } from './services/nasaPowerDailyService.js';
import { fetchSoilEstimate } from './services/soilService.js';
import { CROPS, buildAgroContext, evaluateCrop, generateAlerts, calculateIrrigation } from './domain/agronomyEngine.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  loc: { ...CONFIG.DEFAULT_LOC },
  wx: null,
  clim: null,
  era5: null,
  topo: null,
  nasaDaily: null,
  soilEst: null,
  charts: {},
  map: null,
  marker: null,
  abortCtrl: null
};

const fmtVal = (val, unit, decimals = 1) => (val == null ? 'sin datos' : `${Number(val).toFixed(decimals)} ${unit}`);
const escHtml = (str) =>
  String(str).replace(/[&<>"]/g, (ch) => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[ch]));
const fmtWindDir = (deg) =>
  deg == null ? 'sin datos' : `${['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8]} (${Math.round(deg)}°)`;

function getPlots() {
  try {
    return JSON.parse(localStorage.getItem('agroguia.plots') || '[]');
  } catch (_) {
    return [];
  }
}

function savePlots(list) {
  try {
    localStorage.setItem('agroguia.plots', JSON.stringify(list));
  } catch (_) {}
}

function getActivePlot() {
  try {
    const activeId = localStorage.getItem('agroguia.active');
    return getPlots().find((p) => p.id === activeId) || null;
  } catch (_) {
    return null;
  }
}

const renderScoreBar = (score) =>
  `<div class="bar"><i style="width:${score}%;background:${score >= 75 ? '#2e8b3d' : score >= 50 ? '#d99a1e' : '#c0392b'}"></i></div>`;

function renderChart(canvasId, config) {
  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }
  config.options = { ...(config.options || {}), maintainAspectRatio: false };
  state.charts[canvasId] = new window.Chart($('#' + canvasId), config);
}

function navigateTo(sectionId) {
  $$('section').forEach((sec) => sec.classList.toggle('on', sec.id === sectionId));
  $$('nav button').forEach((btn) => btn.classList.toggle('on', btn.dataset.s === sectionId));
  if (sectionId === 'loc') initMap();
}

$$('nav button').forEach((btn) => {
  btn.onclick = () => navigateTo(btn.dataset.s);
});

async function loadLocationData() {
  if (state.abortCtrl) {
    state.abortCtrl.abort();
  }
  state.abortCtrl = new AbortController();
  const { signal } = state.abortCtrl;

  $('#where').textContent = `📍 ${state.loc.name}`;
  $('#status').innerHTML = '<div class="load">Cargando datos meteorológicos, climáticos, satelitales y de suelo…</div>';

  try {
    const [wxRes, climRes, era5Res, topoRes, nasaDailyRes, soilRes] = await Promise.allSettled([
      fetchWeatherForecast(state.loc.lat, state.loc.lon, signal),
      fetchNasaClimatology(state.loc.lat, state.loc.lon, signal),
      fetchEra5History(state.loc.lat, state.loc.lon, signal),
      fetchTopography(state.loc.lat, state.loc.lon, signal),
      fetchNasaPowerDaily(state.loc.lat, state.loc.lon, signal),
      fetchSoilEstimate(state.loc.lat, state.loc.lon, signal)
    ]);

    if (signal.aborted) return;

    if (wxRes.status === 'fulfilled') {
      state.wx = wxRes.value;
      $('#status').innerHTML = '';
    } else {
      if (wxRes.reason?.name === 'AbortError') return;
      state.wx = null;
      $('#status').innerHTML = `<div class="err">No se pudo obtener el clima (${escHtml(wxRes.reason.message)}). Verificá tu conexión e intentá de nuevo.</div>`;
    }

    state.clim = climRes.status === 'fulfilled' ? climRes.value : null;
    state.era5 = era5Res.status === 'fulfilled' ? era5Res.value : null;
    state.topo = topoRes.status === 'fulfilled' ? topoRes.value : null;
    state.nasaDaily = nasaDailyRes.status === 'fulfilled' ? nasaDailyRes.value : null;
    state.soilEst = soilRes.status === 'fulfilled' ? soilRes.value : null;

    renderAll();
  } catch (err) {
    if (err.name === 'AbortError') return;
    $('#status').innerHTML = `<div class="err">Error inesperado: ${escHtml(err.message)}</div>`;
  }
}

function ensureWeatherAvailable(container) {
  if (!state.wx) {
    container.innerHTML = '<div class="err">Sin datos meteorológicos disponibles para esta ubicación.</div>';
    return false;
  }
  return true;
}

function renderAll() {
  renderDashboard();
  renderCrops();
  renderCalendar();
  renderIrrigation();
  renderAlerts();
  renderPlots();
}

const renderAlertListHtml = () =>
  generateAlerts(state.wx)
    .map((a) => `<div class="al ${a.l}"><b>${a.t}</b><br>${a.x}</div>`)
    .join('');

function renderDashboard() {
  const el = $('#dashBody');
  if (!ensureWeatherAvailable(el)) return;

  const w = state.wx;
  const c = w.current;
  const d0 = w.daily[0];
  const nd = state.nasaDaily?.summary;
  const soil = state.soilEst;

  const kpi = (title, value, sub) => `<div class="k"><small>${title}</small><b>${value}</b><small>${sub || ''}</small></div>`;
  const cacheBadge = w.fromCache ? ' · (Caché local)' : '';

  el.innerHTML = `
    <p class="note">Fuente: ${w.source}${cacheBadge} · Actualizado: ${w.fetchedAt.toLocaleString('es-AR')} · Observación: ${escHtml(w.obsTime || 's/d')} · ${escHtml(state.loc.name)}</p>
    <div class="grid">
      ${kpi('Temperatura aire (2m)', fmtVal(c.temp, '°C'), 'Dato actual')}
      ${kpi('Temp. superficial (Piel)', nd?.latestSkinTemp != null ? `${nd.latestSkinTemp} °C` : 'sin datos', 'NASA POWER (satelital)')}
      ${kpi('Humedad relativa', fmtVal(c.rh, '%', 0), 'Dato actual')}
      ${kpi('Precipitación actual', fmtVal(c.rain, 'mm'), 'Última hora')}
      ${kpi('Lluvia anual (GPM)', nd ? `${nd.annualRainMm} mm` : 'sin datos', nd ? `Últimos 30d: ${nd.rain30dMm} mm · Racha seca: ${nd.maxDrySpell90d}d` : '')}
      ${kpi('Viento', fmtVal(c.wind, 'km/h', 0), fmtWindDir(c.windDir))}
      ${kpi('Radiación solar', fmtVal(c.radiation, 'W/m²', 0), 'Dato actual')}
      ${kpi('Evapotranspiración (ET0)', fmtVal(d0.et0, 'mm'), 'Estimación de hoy')}
      ${kpi('Humedad suelo (SMAP)', nd?.latestSoilRootPct != null ? `Raíz: ${nd.latestSoilRootPct}%` : 'sin datos', nd ? `Superf: ${nd.latestSoilTopPct}% · Tendencia: ${nd.rootTrend}` : '')}
      ${kpi('Suelo estimado (SoilGrids)', soil?.textureClass ? `${soil.textureClass}` : 'no disponible', soil?.ph != null ? `pH ${soil.ph} · MO ${soil.organicMatterPct}% (Estimado)` : 'Sin datos edáficos')}
      ${kpi('Altitud (SRTM)', state.topo?.elevationMeters != null ? `${state.topo.elevationMeters} m s.n.m.` : 'sin datos', state.topo ? `Pendiente: ${state.topo.slopePercent}% (${state.topo.terrainClass})` : '')}
      ${kpi('Historial ERA5', state.era5 ? `${state.era5.period.totalDays} días` : 'no disponible', state.era5 ? state.era5.source : '')}
    </div>
    <h3>Pronóstico 7 días</h3>
    <div class="charts">
      <div class="card"><div class="cv"><canvas id="cT"></canvas></div></div>
      <div class="card"><div class="cv"><canvas id="cR"></canvas></div></div>
    </div>
    <div class="card tw">
      <table>
        <tr><th>Día</th><th>Mín</th><th>Máx</th><th>Lluvia</th><th>ET0</th><th>Viento máx</th></tr>
        ${w.daily
          .map(
            (d) =>
              `<tr><td>${d.date}</td><td>${fmtVal(d.tmin, '°C')}</td><td>${fmtVal(d.tmax, '°C')}</td><td>${fmtVal(d.rain, 'mm')}</td><td>${fmtVal(d.et0, 'mm')}</td><td>${fmtVal(d.windMax, 'km/h', 0)}</td></tr>`
          )
          .join('')}
      </table>
    </div>
    <h3>Alertas</h3>
    ${renderAlertListHtml()}
    <h3>Promedios históricos</h3>
    ${
      state.clim
        ? `<div class="card"><div class="cv"><canvas id="cH"></canvas></div></div><p class="note">Fuente: ${state.clim.source}. Son promedios históricos, no datos actuales.</p>`
        : '<p class="note">Climatología NASA POWER no disponible por el momento.</p>'
    }
  `;

  const labels = w.daily.map((d) => d.date.slice(5));
  renderChart('cT', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Máx °C', data: w.daily.map((d) => d.tmax), borderColor: '#c0392b' },
        { label: 'Mín °C', data: w.daily.map((d) => d.tmin), borderColor: '#2c6fbb' }
      ]
    },
    options: { plugins: { title: { display: true, text: 'Temperatura (pronóstico)' } } }
  });

  renderChart('cR', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Lluvia mm', data: w.daily.map((d) => d.rain), backgroundColor: '#4c8b3f' },
        { label: 'ET0 mm', data: w.daily.map((d) => d.et0), backgroundColor: '#d9b45a' }
      ]
    },
    options: { plugins: { title: { display: true, text: 'Precipitación y ET0 (pronóstico)' } } }
  });

  if (state.clim) {
    renderChart('cH', {
      type: 'bar',
      data: {
        labels: MONTH_NAMES,
        datasets: [
          { type: 'line', label: 'Temp. media °C', data: state.clim.t2m, borderColor: '#c0392b', yAxisID: 'y' },
          { label: 'Lluvia mm/día', data: state.clim.rain, backgroundColor: '#4c8b3f88', yAxisID: 'y1' }
        ]
      },
      options: { scales: { y1: { position: 'right', grid: { drawOnChartArea: false } } } }
    });
  }
}

function renderAlerts() {
  const el = $('#alertBody');
  if (ensureWeatherAvailable(el)) {
    el.innerHTML =
      renderAlertListHtml() +
      '<p class="note">Orientativas, basadas en el pronóstico de Open-Meteo. Consultá el servicio meteorológico oficial de tu país para avisos oficiales.</p>';
  }
}

function renderCrops() {
  const el = $('#cropsBody');
  if (!ensureWeatherAvailable(el)) return;

  const activePlot = getActivePlot();
  const ctx = buildAgroContext(state.wx, activePlot);
  const ranked = CROPS.map((c) => ({ c, e: evaluateCrop(c, ctx) })).sort((a, b) => b.e.score - a.e.score);

  el.innerHTML = `
    <p class="note">${
      activePlot ? `Considerando el terreno «${escHtml(activePlot.name)}».` : 'Sin terreno activo: no se evalúan suelo ni pH.'
    } Orientativo; sin garantía de rendimiento.</p>
    <div class="grid big">
      ${ranked
        .map(
          ({ c, e }) => `
        <div class="card">
          <h3>${c.i} ${c.n}</h3>
          <span class="tag ${e.cls[1]}">${e.cls[0]}</span> <b>${e.score}/100</b>
          ${renderScoreBar(e.score)}
          ${e.capped ? '<p class="note">⚠ Un factor crítico limita el índice.</p>' : ''}
          <ul>${e.f.map((f) => `<li><b>${f.k}</b> (${f.s}): ${f.m}</li>`).join('')}</ul>
          <small class="note">Óptimo ${c.topt.join('–')} °C · mín ${c.tmin} / máx ${c.tmax} °C · germinación ${c.germ} · ciclo ${c.cycle} d · agua ${c.water} · suelo ${c.soil.join('/')} · pH ${c.ph.join('–')} · heladas ${c.frost} · radiación ${c.rad}</small>
        </div>`
        )
        .join('')}
    </div>
  `;
}

const cropOptionsHtml = CROPS.map((c, idx) => `<option value="${idx}">${c.i} ${c.n}</option>`).join('');
$('#calCrop').innerHTML = cropOptionsHtml;
$('#irrCrop').innerHTML = cropOptionsHtml;
['#calCrop', '#irrCrop', '#irrStage'].forEach((sel) => {
  $(sel).onchange = () => {
    renderCalendar();
    renderIrrigation();
  };
});

function renderCalendar() {
  const crop = CROPS[$('#calCrop').value];
  const cells = Array(12).fill('');
  const s0 = crop.sow[0] - 1;
  const durationMonths = Math.ceil(crop.cycle / 30);
  const labels = { S: 'Siembra', C: 'Crecimiento', H: 'Cosecha' };

  for (let i = 0; i <= durationMonths; i++) {
    cells[(s0 + i) % 12] = i === durationMonths ? 'H' : 'C';
  }
  crop.sow.forEach((m) => {
    cells[m - 1] = 'S';
  });

  $('#calBody').innerHTML = `
    <div class="card tw">
      <table>
        <tr>${MONTH_NAMES.map((m) => `<th>${m}</th>`).join('')}</tr>
        <tr>${cells.map((code) => `<td class="${code}">${code ? labels[code] : ''}</td>`).join('')}</tr>
      </table>
      <p>Germinación estimada: ${crop.germ}. Ciclo aprox.: ${crop.cycle} días. Fertilización: en crecimiento inicial según análisis de suelo. Riego: ver sección Riego.</p>
      <p class="note">Fechas orientativas para hemisferio sur.</p>
    </div>
  `;
}

function renderIrrigation() {
  const el = $('#irrBody');
  if (!ensureWeatherAvailable(el)) return;
  const res = calculateIrrigation(CROPS[$('#irrCrop').value], state.wx, Number($('#irrStage').value));
  el.innerHTML = `
    <div class="card">
      <span class="tag ${res.l}">${res.t}</span>
      <ul>${res.why.map((line) => `<li>${line}</li>`).join('')}</ul>
      <p class="note">No se indican láminas de riego: faltan datos de suelo, sistema y eficiencia.</p>
    </div>
  `;
}

function renderPlots() {
  const list = getPlots();
  const activeId = localStorage.getItem('agroguia.active');
  $('#plotList').innerHTML = list.length
    ? list
        .map(
          (p) => `
      <div class="card">
        <h3>${escHtml(p.name)}</h3>
        <small>
          ${escHtml(p.place)} · ${escHtml(p.area)} ha<br>
          Suelo ${escHtml(p.soil)} · pH ${escHtml(p.ph || 's/d')} · MO ${escHtml(p.om || 's/d')}% · Humedad ${escHtml(p.moist || 's/d')}%<br>
          Agua: ${escHtml(p.water)}<br>
          Anteriores: ${escHtml(p.prev || 's/d')}
        </small>
        <div class="row" style="margin-top:8px">
          <button data-a="${p.id}">${p.id === activeId ? '✔ Activo' : 'Usar en evaluación'}</button>
          <button data-d="${p.id}" style="background:#c0392b">Borrar</button>
        </div>
      </div>`
        )
        .join('')
    : '<p class="note">Aún no guardaste terrenos.</p>';

  $$('[data-a]').forEach((btn) => {
    btn.onclick = () => {
      localStorage.setItem('agroguia.active', btn.dataset.a);
      renderPlots();
      if (state.wx) renderCrops();
    };
  });

  $$('[data-d]').forEach((btn) => {
    btn.onclick = () => {
      savePlots(getPlots().filter((p) => p.id !== btn.dataset.d));
      renderPlots();
      if (state.wx) renderCrops();
    };
  });
}

$('#pf').onsubmit = (e) => {
  e.preventDefault();
  const entry = Object.fromEntries(new FormData(e.target));
  entry.id = String(Date.now());
  savePlots([...getPlots(), entry]);
  e.target.reset();
  renderPlots();
};

function setLocation(name, lat, lon) {
  state.loc = { name, lat: Number(lat), lon: Number(lon) };
  $('#lat').value = Number(lat).toFixed(4);
  $('#lon').value = Number(lon).toFixed(4);
  if (state.map) {
    state.map.setView([lat, lon], 8);
    state.marker.setLatLng([lat, lon]);
  }
  loadLocationData();
}

function initMap() {
  if (!state.map) {
    state.map = window.L.map('map').setView([state.loc.lat, state.loc.lon], 7);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(state.map);
    state.marker = window.L.marker([state.loc.lat, state.loc.lon]).addTo(state.map);
    state.map.on('click', (e) => {
      setLocation(`Punto ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`, e.latlng.lat, e.latlng.lng);
    });
  }
  setTimeout(() => state.map.invalidateSize(), 50);
}

$('#prov').innerHTML =
  '<option value="">Región de referencia…</option>' +
  Object.keys(PRESET_REGIONS)
    .map((region) => `<option value="${region}">${region}</option>`)
    .join('');

$('#prov').onchange = (e) => {
  const coords = PRESET_REGIONS[e.target.value];
  if (coords) setLocation(e.target.value, coords[0], coords[1]);
};

$('#qb').onclick = async () => {
  const query = $('#q').value.trim();
  if (!query) return;
  $('#res').innerHTML = '<div class="load">Buscando…</div>';
  try {
    const results = await searchLocations(query);
    $('#res').innerHTML = results.length
      ? `<ul class="res">${results.map((p, idx) => `<li data-i="${idx}">📍 ${escHtml(p.name)}</li>`).join('')}</ul>`
      : '<p class="note">Sin resultados.</p>';
    $$('#res li').forEach((li) => {
      li.onclick = () => {
        const chosen = results[li.dataset.i];
        setLocation(chosen.name, chosen.lat, chosen.lon);
        $('#res').innerHTML = '';
      };
    });
  } catch (err) {
    $('#res').innerHTML = `<div class="err">Error de búsqueda: ${escHtml(err.message)}</div>`;
  }
};

$('#q').onkeydown = (e) => {
  if (e.key === 'Enter') $('#qb').click();
};

$('#gps').onclick = () => {
  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocation('Mi ubicación', pos.coords.latitude, pos.coords.longitude),
    () => alert('No se concedió el permiso de ubicación.')
  );
};

$('#go').onclick = () => {
  const lat = parseFloat($('#lat').value);
  const lon = parseFloat($('#lon').value);
  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    alert('Coordenadas inválidas.');
    return;
  }
  setLocation(`Punto ${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon);
};

$('#lat').value = state.loc.lat;
$('#lon').value = state.loc.lon;
renderCalendar();
renderPlots();
loadLocationData();
