const USGS_ENDPOINT = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const MAX_EVENTS = 20000;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', ...extraHeaders }
  });
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
  return {
    usgs_id: feature.id,
    occurred_at: new Date(props.time).toISOString(),
    magnitude: props.mag,
    place: props.place,
    longitude,
    latitude,
    depth_km: depth,
    event_url: props.url,
    event_type: props.type,
    updated_at: new Date(props.updated || props.time).toISOString()
  };
}

async function supabaseRequest(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...options.headers }
  });
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
  return response;
}

async function readCachedYear(year) {
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;
  const markerQuery = new URLSearchParams({ select: 'year', year: `eq.${year}`, minimum_magnitude: 'eq.2.5', limit: '1' });
  const markerResponse = await supabaseRequest(`catalog_years?${markerQuery}`);
  if (!markerResponse) return null;
  const marker = await markerResponse.json();
  if (!marker.length) return null;
  const pageSize = 1000;
  const pages = await Promise.all(Array.from({ length: Math.ceil(MAX_EVENTS / pageSize) }, async (_, page) => {
    const offset = page * pageSize;
    const query = new URLSearchParams({ select: 'usgs_id,occurred_at,magnitude,place,longitude,latitude,depth_km,event_url,event_type', occurred_at: `gte.${start}`, and: `(occurred_at.lt.${end},magnitude.gte.2.5)`, order: 'occurred_at.asc', limit: String(pageSize), offset: String(offset) });
    const response = await supabaseRequest(`earthquakes?${query}`);
    if (!response) return null;
    return response.json();
  }));
  if (pages.some((page) => page === null)) return null;
  return pages.flat();
}

async function storeCatalog(features, year, minMagnitude) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const rows = features.map(toRow).filter((row) => row.magnitude !== null && row.magnitude >= minMagnitude);
  const batches = Array.from({ length: Math.ceil(rows.length / 1000) }, (_, index) => rows.slice(index * 1000, (index + 1) * 1000));
  for (let start = 0; start < batches.length; start += 5) {
    await Promise.all(batches.slice(start, start + 5).map((batch) => supabaseRequest('earthquakes?on_conflict=usgs_id', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch)
    })));
  }
  await supabaseRequest('catalog_years?on_conflict=year', {
    method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ year, minimum_magnitude: minMagnitude, event_count: rows.length, loaded_at: new Date().toISOString() })
  });
}

function fromRows(rows, year, minMagnitude) {
  const features = rows.filter((row) => Number(row.magnitude) >= minMagnitude).map((row) => ({ type: 'Feature', id: row.usgs_id, properties: { mag: row.magnitude, place: row.place, time: Date.parse(row.occurred_at), updated: Date.parse(row.occurred_at), url: row.event_url, type: row.event_type }, geometry: { type: 'Point', coordinates: [row.longitude, row.latitude, row.depth_km] } }));
  return {
    type: 'FeatureCollection', metadata: { generated: Date.now(), title: `USGS Earthquakes, ${year}`, count: features.length, year, minmagnitude: minMagnitude },
    source: 'supabase', features
  };
}

export default async function handler(request, res) {
  if (request.method === 'OPTIONS') return send(res, json({}, 204));
  if (request.method !== 'GET') return send(res, json({ error: '只支持 GET 请求' }, 405));
  const requestUrl = new URL(request.url, `https://${request.headers?.host || 'localhost'}`);
  const params = requestUrl.searchParams;
  const year = Number(params.get('year'));
  const minMagnitude = Number(params.get('minmagnitude') || 2.5);
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > thisYear) return send(res, json({ error: `年份须在 1900 至 ${thisYear} 之间` }, 400));
  if (!Number.isFinite(minMagnitude) || minMagnitude < 0 || minMagnitude > 9) return send(res, json({ error: '震级筛选范围无效' }, 400));
  const refresh = params.get('refresh') === '1';
  const cacheControl = refresh ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400';
  try {
    if (!refresh && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const rows = await readCachedYear(year);
      if (rows) return send(res, json(fromRows(rows, year, minMagnitude), 200, { 'cache-control': cacheControl }));
    }
    const search = new URLSearchParams({ format: 'geojson', starttime: `${year}-01-01`, endtime: `${year + 1}-01-01`, minmagnitude: '2.5', orderby: 'time-asc', limit: String(MAX_EVENTS) });
    const upstream = await fetch(`${USGS_ENDPOINT}?${search}`, { headers: { accept: 'application/geo+json' } });
    if (!upstream.ok) return send(res, json({ error: `USGS 目录暂不可用（${upstream.status}）` }, 502, { 'cache-control': 'no-store' }));
    const catalog = await upstream.json();
    const catalogFeatures = catalog.features || [];
    const wasCapped = (catalog.metadata?.count ?? catalogFeatures.length) >= MAX_EVENTS;
    try { await storeCatalog(catalogFeatures, year, 2.5); } catch (error) { console.error('Supabase catalog cache write failed:', error.message); }
    catalog.source = 'usgs';
    catalog.features = catalogFeatures.filter((feature) => Number(feature.properties.mag) >= minMagnitude);
    catalog.metadata = { ...catalog.metadata, year, minmagnitude: minMagnitude, capped: wasCapped };
    return send(res, json(catalog, 200, { 'cache-control': cacheControl }));
  } catch (error) {
    console.error('Earthquake catalog request failed:', error);
    return send(res, json({ error: '读取地震目录失败，请稍后重试。' }, 502, { 'cache-control': 'no-store' }));
  }
}
