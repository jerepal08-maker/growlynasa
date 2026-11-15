/**
 * Cloudflare Worker Proxy para AgroVision
 * Conecta USDA CropScape, NASA AppEEARS (ECOSTRESS), USDA Ag Data Commons
 * y USDA AMS Market News (MARS API v1.2) manteniendo claves privadas en el servidor.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Ruta USDA CropScape (últimos 3 años disponibles en coordenadas EPSG:5070)
      if (path.endsWith('/cropscape')) {
        const x = url.searchParams.get('x');
        const y = url.searchParams.get('y');
        if (!x || !y) return jsonResponse({ error: 'Faltan parámetros x, y' }, 400);

        const currentYear = new Date().getFullYear();
        const years = [currentYear - 2, currentYear - 3, currentYear - 4];
        const history = [];

        for (const yr of years) {
          const cdlUrl = `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=${yr}&x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`;
          const res = await fetch(cdlUrl);
          if (res.ok) {
            const xml = await res.text();
            const match = xml.match(/<Result>(\d+)<\/Result>/i);
            if (match) {
              history.push({ year: yr, code: Number(match[1]) });
            }
          }
        }
        return jsonResponse({ history });
      }

      // 2. Ruta NASA ECOSTRESS (vía NASA AppEEARS Point Sample API)
      if (path.endsWith('/ecostress')) {
        const lat = url.searchParams.get('lat');
        const lon = url.searchParams.get('lon');
        if (!lat || !lon) return jsonResponse({ error: 'Faltan parámetros lat, lon' }, 400);

        if (!env.EARTHDATA_TOKEN) {
          return jsonResponse({ error: 'EARTHDATA_TOKEN no configurado en el Worker.' }, 501);
        }

        const end = new Date().toISOString().slice(0, 10);
        const startObj = new Date();
        startObj.setDate(startObj.getDate() - 30);
        const start = startObj.toISOString().slice(0, 10);

        const sampleUrl = `https://appeears.earthdatacloud.nasa.gov/api/point?product=ECO2LSTE.001&layer=SDS_LST&latitude=${lat}&longitude=${lon}&startDate=${start}&endDate=${end}`;
        const res = await fetch(sampleUrl, {
          headers: { Authorization: `Bearer ${env.EARTHDATA_TOKEN}` }
        });

        if (!res.ok) {
          return jsonResponse({ error: `AppEEARS HTTP ${res.status}` }, res.status);
        }
        const payload = await res.json();
        const latest = Array.isArray(payload) && payload.length ? payload[payload.length - 1] : null;
        const lstCelsius = latest?.SDS_LST != null ? Number((latest.SDS_LST * 0.02 - 273.15).toFixed(1)) : null;

        return jsonResponse({
          obsDate: latest?.Date || null,
          lstCelsius,
          esi: null
        });
      }

      // 3. Ruta USDA AMS Market News (MARS API v1.2 - https://www.ams.usda.gov/market-news)
      if (path.endsWith('/market-demand')) {
        if (!env.USDA_AMS_API_KEY) {
          return jsonResponse({
            reports: [],
            note: 'USDA_AMS_API_KEY no configurada; usando perfiles calibrados USDA AMS.'
          });
        }

        const basicToken = btoa(`${env.USDA_AMS_API_KEY}:`);
        const marsUrl = 'https://marsapi.ams.usda.gov/services/v1.2/reports';
        const res = await fetch(marsUrl, {
          headers: { Authorization: `Basic ${basicToken}` }
        });

        if (!res.ok) {
          return jsonResponse({ error: `USDA AMS MARS HTTP ${res.status}` }, res.status);
        }

        const reports = await res.json();
        const summary = Array.isArray(reports)
          ? reports.slice(0, 15).map((r) => ({
              slugId: r.slug_id,
              title: r.report_title,
              publishedDate: r.published_date,
              marketTypes: r.market_types
            }))
          : [];

        return jsonResponse({ reports: summary });
      }

      // 4. Ruta USDA Ag Data Commons
      if (path.endsWith('/usda')) {
        const q = url.searchParams.get('q') || 'crop yield soil';
        const ckanUrl = `https://data.nal.usda.gov/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=3`;
        const res = await fetch(ckanUrl);
        if (!res.ok) return jsonResponse({ error: `USDA HTTP ${res.status}` }, res.status);
        const data = await res.json();
        const results = data?.result?.results || [];
        return jsonResponse({
          totalMatches: data?.result?.count || 0,
          datasets: results.map((ds) => ({
            title: ds.title,
            name: ds.name,
            url: `https://data.nal.usda.gov/dataset/${ds.name}`
          }))
        });
      }

      return jsonResponse({
        status: 'AgroVision Proxy activo',
        endpoints: ['/cropscape', '/ecostress', '/market-demand', '/usda']
      });
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}
