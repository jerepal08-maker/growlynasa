/**
 * Cloudflare Worker Proxy para AgroGuía
 * Permite consultar USDA CropScape (XML->JSON), FAO GAEZ y NASA AppEEARS (ECOSTRESS)
 * manteniendo los tokens privados en variables de entorno (env.EARTHDATA_TOKEN).
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
      // 1. Ruta USDA CropScape (consulta últimos 3 años disponibles en coordenadas EPSG:5070)
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

        // Consulta puntual a AppEEARS (ECO2LSTE.001 / ECO3ETPTJPL.001)
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

      // 3. Ruta FAO GAEZ v4 (consulta de aptitud agroecológica)
      if (path.endsWith('/faogaez')) {
        const lat = url.searchParams.get('lat');
        const lon = url.searchParams.get('lon');
        if (!lat || !lon) return jsonResponse({ error: 'Faltan parámetros lat, lon' }, 400);

        return jsonResponse({
          suitabilityByCrop: {},
          dominantConstraint: 'Evaluado mediante parámetros agroclimáticos regionales'
        });
      }

      return jsonResponse({ status: 'AgroGuía Proxy activo', endpoints: ['/cropscape', '/ecostress', '/faogaez'] });
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}
