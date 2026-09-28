(() => {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const yearSelect = document.querySelector('#year-select');
  const minimumYear = 1900;
  for (let year = currentYear; year >= minimumYear; year -= 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = year === currentYear ? `${year} · 今年` : String(year);
    yearSelect.append(option);
  }
  document.querySelector('#year-range-end').textContent = currentYear;

  const apiBase = (window.EARTHQUAKE_API_URL || 'https://YOUR-VERCEL-PROJECT.vercel.app').replace(/\/$/, '');
  const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false,
    baseLayer: new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })),
    shouldAnimate: true, requestRenderMode: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider()
  });
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1723');
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#07111c');
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(12, 18, 25500000), orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 } });

  let selectedMagnitude = 2.5;
  let selectedMonth = 0;
  let allEvents = [];
  let eventEntities = [];
  let spinning = true;
  let requestId = 0;
  const statusChip = document.querySelector('#status-chip');
  const statusText = document.querySelector('#status-text');
  const eventCard = document.querySelector('#event-card');
  const formatCount = new Intl.NumberFormat('en-US');

  const colorForDepth = (depth) => {
    const km = Math.max(0, Number(depth) || 0);
    if (km < 70) return Cesium.Color.fromCssColorString('#ff765e').withAlpha(0.94);
    if (km < 300) return Cesium.Color.fromCssColorString('#55d2a2').withAlpha(0.94);
    return Cesium.Color.fromCssColorString('#62a8ff').withAlpha(0.94);
  };
  function drawEvents() {
    eventEntities.forEach((entity) => viewer.entities.remove(entity));
    eventEntities = [];
    const events = allEvents.filter((event) => {
      if (Number(event.properties.mag) < selectedMagnitude) return false;
      if (!selectedMonth) return true;
      return new Date(event.properties.time).getUTCMonth() + 1 === selectedMonth;
    });
    for (const event of events) {
      const [longitude, latitude, rawDepth] = event.geometry.coordinates;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
      const magnitude = Number(event.properties.mag) || 0;
      const depth = Math.max(0, Number(rawDepth) || 0);
      const radius = Math.max(2.5, Math.min(12, 2.5 + (magnitude - 2.5) * 1.35));
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(longitude, latitude, Math.max(0, 700 - depth) * 120),
        point: { pixelSize: radius * 2, color: colorForDepth(depth), outlineColor: Cesium.Color.fromCssColorString('#ffe2d5').withAlpha(0.8), outlineWidth: magnitude >= 6 ? 1 : 0, disableDepthTestDistance: 0, scaleByDistance: new Cesium.NearFarScalar(5e6, 1.35, 2e7, 0.55) },
        properties: { event }
      });
      eventEntities.push(entity);
    }
    document.querySelector('#event-count').textContent = formatCount.format(events.length);
  }
  function setStatus(state, message) {
    statusChip.classList.remove('loaded', 'error');
    if (state) statusChip.classList.add(state);
    statusText.textContent = message;
  }
  function updateYearLabels(year) {
    document.querySelector('#eyebrow-year').textContent = year;
    document.querySelector('#timeline-year').textContent = year;
    updateTimelineRange(year);
  }
  function updateTimelineRange(year) {
    const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const dateRange = document.querySelector('#date-range');
    const monthLabel = document.querySelector('#month-label');
    if (!selectedMonth) {
      dateRange.textContent = `JAN 01 — DEC 31, ${year}`;
      monthLabel.textContent = '全年 · 拖动滑块选择月份';
    } else {
      const lastDay = new Date(Date.UTC(year, selectedMonth, 0)).getUTCDate();
      dateRange.textContent = `${monthNames[selectedMonth - 1]} 01 — ${monthNames[selectedMonth - 1]} ${String(lastDay).padStart(2, '0')}, ${year}`;
      monthLabel.textContent = `${year}年${selectedMonth}月`;
    }
    document.querySelector('#track-progress').style.width = `${selectedMonth / 12 * 100}%`;
    document.querySelector('#month-range').value = String(selectedMonth);
  }
  function showEvent(event) {
    const [longitude, latitude, depth] = event.geometry.coordinates;
    const props = event.properties;
    document.querySelector('#event-mag').textContent = `M ${Number(props.mag).toFixed(1)}`;
    document.querySelector('#event-place').textContent = props.place || '位置未注明';
    document.querySelector('#event-time').textContent = new Date(props.time).toLocaleString('zh-CN', { timeZone: 'UTC', hour12: false, timeZoneName: 'short' });
    document.querySelector('#event-depth').textContent = `${Number(depth).toFixed(1)} km 深度 · ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
    const link = document.querySelector('#event-link');
    link.href = props.url || `https://earthquake.usgs.gov/earthquakes/eventpage/${event.id}`;
    eventCard.classList.remove('hidden');
  }
  async function loadYear(year, { force = false } = {}) {
    const id = ++requestId;
    updateYearLabels(year);
    setStatus('', '正在读取地震目录');
    document.querySelector('#event-count').textContent = '…';
    try {
      const url = new URL(`${apiBase}/api/earthquakes`, window.location.href);
      url.searchParams.set('year', year);
      url.searchParams.set('minmagnitude', String(selectedMagnitude));
      if (force) url.searchParams.set('refresh', '1');
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || `目录服务返回 ${response.status}`);
      }
      const payload = await response.json();
      if (id !== requestId) return;
      allEvents = payload.features || [];
      drawEvents();
      const countLabel = payload.metadata?.capped ? `至少 ${formatCount.format(allEvents.length)}` : formatCount.format(allEvents.length);
      setStatus('loaded', `${year} 年目录 · ${countLabel} 条${payload.source === 'supabase' ? ' · 数据库缓存' : ' · USGS'}`);
      const depths = allEvents.map((event) => Number(event.geometry.coordinates[2]) || 0);
      if (depths.length) document.querySelector('#depth-range').textContent = `${Math.min(...depths).toFixed(0)} – ${Math.max(...depths).toFixed(0)} KM`;
    } catch (error) {
      if (id !== requestId) return;
      allEvents = [];
      drawEvents();
      setStatus('error', apiBase.includes('YOUR-VERCEL-PROJECT') ? '请先配置 Vercel API 地址' : error.message);
    }
  }

  viewer.screenSpaceEventHandler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    if (Cesium.defined(picked) && picked.id?.properties?.event) showEvent(picked.id.properties.event.getValue());
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  viewer.clock.onTick.addEventListener((clock) => {
    if (!spinning || viewer.scene.mode !== Cesium.SceneMode.SCENE3D) return;
    const camera = viewer.camera;
    camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.000035 * clock.multiplier);
  });
  yearSelect.addEventListener('change', () => loadYear(Number(yearSelect.value)));
  document.querySelector('#month-range').addEventListener('input', (event) => {
    selectedMonth = Number(event.currentTarget.value);
    updateTimelineRange(Number(yearSelect.value));
    drawEvents();
  });
  document.querySelectorAll('.mag-option').forEach((button) => button.addEventListener('click', () => {
    selectedMagnitude = Number(button.dataset.mag);
    document.querySelectorAll('.mag-option').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelector('#magnitude-label').textContent = `M ${selectedMagnitude.toFixed(1)}+`;
    drawEvents();
  }));
  document.querySelector('#reload-year').addEventListener('click', () => loadYear(Number(yearSelect.value), { force: true }));
  document.querySelector('#reset-view').addEventListener('click', () => viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(12, 18, 25500000), duration: 1.2 }));
  document.querySelector('#zoom-in').addEventListener('click', () => viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.25));
  document.querySelector('#zoom-out').addEventListener('click', () => viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.25));
  document.querySelector('#toggle-spin').addEventListener('click', (event) => {
    spinning = !spinning;
    event.currentTarget.classList.toggle('active', spinning);
  });
  document.querySelector('#event-close').addEventListener('click', () => eventCard.classList.add('hidden'));
  const updateClock = () => { document.querySelector('#utc-clock').textContent = `UTC ${new Date().toISOString().slice(11, 19)}`; };
  updateClock();
  window.setInterval(updateClock, 1000);
  yearSelect.value = String(currentYear);
  loadYear(currentYear);
})();

