const USGS_ENDPOINT = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const MAX_EVENTS_PER_QUERY = 20000;
const CATALOG_VERSION = 2;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', ...extraHeaders } });
}
async function send(res, response) {
  if (!res || typeof res.end !== 'function') return response;
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
}
function toRow(feature) {
  const [longitude, latitude, depth] = feature.geometry.coordinates;
  const props = feature.properties;
  return { usgs_id: feature.id, occurred_at: new Date(props.time).toISOString(), magnitude: props.mag, place: props.place, longitude, latitude, depth_km: depth, event_url: props.url, event_type: props.type, updated_at: new Date(props.updated || props.time).toISOString() };
}
async function supabaseRequest(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, { ...options, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
  return response;
}
async function readCachedYear(year, minMagnitude) {
  const markerQuery = new URLSearchParams({ select: 'year,event_count,catalog_version,is_capped', year: `eq.${year}`, minimum_magnitude: 'eq.2.5', catalog_version: `eq.${CATALOG_VERSION}`, limit: '1' });
  const markerResponse = await supabaseRequest(`catalog_years?${markerQuery}`);
  if (!markerResponse) return null;
  const markers = await markerResponse.json();
  if (!markers.length) return null;
  const marker = markers[0];
  const count = Number(marker.event_count) || 0;
  const pageSize = 1000;
  const pages = await Promise.all(Array.from({ length: Math.ceil(count / pageSize) }, async (_, page) => {
    const offset = page * pageSize;
    const query = new URLSearchParams({ select: 'usgs_id,occurred_at,magnitude,place,longitude,latitude,depth_km,event_url,event_type', occurred_at: `gte.${year}-01-01T00:00:00.000Z`, and: `(occurred_at.lt.${year + 1}-01-01T00:00:00.000Z,magnitude.gte.2.5)`, order: 'occurred_at.asc,usgs_id.asc', limit: String(pageSize), offset: String(offset) });
    const response = await supabaseRequest(`earthquakes?${query}`);
    return response ? response.json() : null;
  }));
  if (pages.some((page) => page === null)) return null;
  return { rows: pages.flat(), capped: marker.is_capped };
}
async function storeCatalog(features, year, capped) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const rows = features.map(toRow).filter((row) => row.magnitude !== null && row.magnitude >= 2.5);
  const batches = Array.from({ length: Math.ceil(rows.length / 1000) }, (_, index) => rows.slice(index * 1000, (index + 1) * 1000));
  for (let start = 0; start < batches.length; start += 5) {
    await Promise.all(batches.slice(start, start + 5).map((batch) => supabaseRequest('earthquakes?on_conflict=usgs_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) })));
  }
  await supabaseRequest('catalog_years?on_conflict=year', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ year, minimum_magnitude: 2.5, event_count: rows.length, catalog_version: CATALOG_VERSION, is_capped: capped, loaded_at: new Date().toISOString() }) });
}
function makeResult(features, year, minMagnitude, capped, source, month, compact) {
  const scoped = features.filter((feature) => Number(feature.properties.mag) >= minMagnitude && (!month || new Date(feature.properties.time).getUTCMonth() + 1 === month));
  const renderFeatures = compact && !month && scoped.length > 5000
    ? scoped.filter((_, index) => index % Math.ceil(scoped.length / 5000) === 0)
    : scoped;
  return {
    type: 'FeatureCollection',
    metadata: { generated: Date.now(), title: `USGS Earthquakes, ${year}`, count: scoped.length, renderedCount: renderFeatures.length, year, month, minmagnitude: minMagnitude, capped },
    source,
    features: renderFeatures
  };
}
function fromRows(cache, year, minMagnitude, month, compact) {
  const features = cache.rows.map((row) => ({ type: 'Feature', id: row.usgs_id, properties: { mag: row.magnitude, place: row.place, time: Date.parse(row.occurred_at), updated: Date.parse(row.occurred_at), url: row.event_url, type: row.event_type }, geometry: { type: 'Point', coordinates: [row.longitude, row.latitude, row.depth_km] } }));
  return makeResult(features, year, minMagnitude, cache.capped, 'supabase', month, compact);
}
async function fetchCompleteYear(year) {
  const periods = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(Date.UTC(year, month, 1));
    return { start, end: endDate.toISOString().slice(0, 10) };
  });
  const catalogs = await Promise.all(periods.map(async ({ start, end }) => {
    const query = new URLSearchParams({ format: 'geojson', starttime: start, endtime: end, minmagnitude: '2.5', orderby: 'time-asc', limit: String(MAX_EVENTS_PER_QUERY) });
    const response = await fetch(`${USGS_ENDPOINT}?${query}`, { headers: { accept: 'application/geo+json' } });
    if (!response.ok) throw new Error(`USGS 目录暂不可用（${response.status}）`);
    const catalog = await response.json();
    const features = catalog.features || [];
    return { features, capped: (catalog.metadata?.count ?? features.length) >= MAX_EVENTS_PER_QUERY };
  }));
  const features = catalogs.flatMap((catalog) => catalog.features).sort((a, b) => a.properties.time - b.properties.time);
  return { features, capped: catalogs.some((catalog) => catalog.capped) };
}
export default async function handler(request, res) {
  if (request.method === 'OPTIONS') return send(res, json({}, 204));
  if (request.method !== 'GET') return send(res, json({ error: '只支持 GET 请求' }, 405));
  const requestUrl = new URL(request.url, `https://${request.headers?.host || 'localhost'}`);
  const params = requestUrl.searchParams;
  const year = Number(params.get('year'));
  const minMagnitude = Number(params.get('minmagnitude') || 2.5);
  const month = Number(params.get('month') || 0);
  const compact = params.get('compact') === '1';
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > thisYear) return send(res, json({ error: `年份须在 1900 至 ${thisYear} 之间` }, 400));
  if (!Number.isFinite(minMagnitude) || minMagnitude < 0 || minMagnitude > 9) return send(res, json({ error: '震级筛选范围无效' }, 400));
  if (!Number.isInteger(month) || month < 0 || month > 12) return send(res, json({ error: '月份须为 0（全年）至 12' }, 400));
  const refresh = params.get('refresh') === '1';
  const cacheControl = refresh ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400';
  try {
    if (!refresh && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const cache = await readCachedYear(year, minMagnitude);
      if (cache) return send(res, json(fromRows(cache, year, minMagnitude, month, compact), 200, { 'cache-control': cacheControl }));
    }
    const catalog = await fetchCompleteYear(year);
    try { await storeCatalog(catalog.features, year, catalog.capped); } catch (error) { console.error('Supabase catalog cache write failed:', error.message); }
    const result = makeResult(catalog.features, year, minMagnitude, catalog.capped, 'usgs', month, compact);
    return send(res, json(result, 200, { 'cache-control': cacheControl }));
  } catch (error) {
    console.error('Earthquake catalog request failed:', error);
    return send(res, json({ error: '读取地震目录失败，请稍后重试。' }, 502, { 'cache-control': 'no-store' }));
  }
}

