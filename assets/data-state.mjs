export function dataHealth(snapshot, status, now = Date.now()) {
  if (!snapshot?.fetchedAt || !Array.isArray(snapshot.storms)) return { state: 'unavailable', label: '暂无法获取数据' };
  if (status?.state !== 'ok') return { state: 'degraded', label: '同步异常 · 保留最近数据' };
  if (now - Date.parse(snapshot.fetchedAt) > 45 * 60000) return { state: 'stale', label: '同步超过45分钟 · 请核对官方信息' };
  if (snapshot.storms.some(storm => now - Date.parse(storm.observedAt) > 6 * 3600000)) return { state: 'old-observation', label: '部分观测超过6小时 · 请核对官方信息' };
  return { state: 'ok', label: '已同步官方源数据' };
}

export function timelineFor(storm) {
  if (!storm) return [];
  return [{ time: storm.observedAt, lat: storm.lat, lon: storm.lon, speed: storm.speed, level: storm.level, h: 0 },
    ...(storm.forecasts?.[0]?.points || []).filter(point => Date.parse(point.time) > Date.parse(storm.observedAt))
      .map(point => ({ ...point, h: (Date.parse(point.time) - Date.parse(storm.observedAt)) / 3600000 }))];
}
