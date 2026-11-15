const CACHE_PREFIX = 'agroguia.http.';

function pruneExpiredCache() {
  try {
    const now = Date.now();
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!parsed.exp || now > parsed.exp) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_) {
    // Ignorar errores de lectura en modo privado restringido
  }
}

function writeCache(key, data, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return;
  const payload = JSON.stringify({
    exp: Date.now() + ttlMs,
    data
  });
  try {
    localStorage.setItem(key, payload);
  } catch (err) {
    // Si localStorage alcanzó su cuota (~5MB), limpiamos caché expirada y reintentamos una vez
    pruneExpiredCache();
    try {
      localStorage.setItem(key, payload);
    } catch (_) {
      // Si sigue lleno, continuamos sin cachear en disco
    }
  }
}

export async function fetchJson(url, { ttlMs = 0, signal = null, timeoutMs = 15000 } = {}) {
  const cacheKey = CACHE_PREFIX + url;

  if (ttlMs > 0) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry.exp && Date.now() < entry.exp) {
          return { data: entry.data, fromCache: true };
        }
        localStorage.removeItem(cacheKey);
      }
    } catch (_) {
      // Si el JSON guardado estaba corrupto, lo ignoramos y pedimos dato fresco
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Tiempo de espera agotado al consultar el servidor.'));
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Consulta cancelada', 'AbortError');
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch (_) {
        host = 'servidor externo';
      }
      throw new Error(`HTTP ${response.status} en ${host}`);
    }
    const data = await response.json();
    writeCache(cacheKey, data, ttlMs);
    return { data, fromCache: false };
  } finally {
    clearTimeout(timeoutId);
  }
}
