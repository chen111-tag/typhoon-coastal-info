import { dataHealth, timelineFor } from './data-state.mjs';

const $ = id => document.getElementById(id);
const cities = { wenzhou: { name: '温州市', lon: 120.7, lat: 28 }, ningbo: { name: '宁波市', lon: 121.55, lat: 29.87 }, fuzhou: { name: '福州市', lon: 119.3, lat: 26.1 }, shanghai: { name: '上海市', lon: 121.47, lat: 31.23 } };
const levels = { blue: [24, 6, 8], yellow: [24, 8, 10], orange: [12, 10, 12], red: [6, 12, 14] };
const timeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
let snapshot = null, syncStatus = null, requestFailed = false, activeId = '', activeCity = 'wenzhou', timeStep = 0, timer = null, loading = false;
let bounds = { west: 109, east: 142, south: 15, north: 38 };
try { const saved = localStorage.getItem('guanfeng-city'); if (cities[saved]) activeCity = saved; } catch {}
$('city').value = activeCity;
const formatTime = value => value && Number.isFinite(Date.parse(value)) ? timeFormat.format(new Date(value)) : '暂无数据';
const value = input => input === null || input === undefined || input === '' ? '—' : String(input);
const escape = input => String(input).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const selectedStorm = () => snapshot?.storms.find(storm => storm.id === activeId) || null;
const project = ([lon, lat]) => [(lon - bounds.west) * 900 / (bounds.east - bounds.west), (bounds.north - lat) * 590 / (bounds.north - bounds.south)];
const points = coordinates => coordinates.map(point => project(point).map(number => number.toFixed(1)).join(',')).join(' ');
const svgText = (x, y, text, className = 'map-place', extra = '') => `<text x="${x}" y="${y}" class="${className}" ${extra}>${escape(text)}</text>`;
const at = (lon, lat, text, className, extra = '') => { const [x, y] = project([lon, lat]); return svgText(x, y, text, className, extra); };

function setBounds(storm) {
  const coordinates = storm ? [...storm.history, ...timelineFor(storm)] : [];
  bounds = { west: Math.max(-180, Math.min(109, ...coordinates.map(point => point.lon - 3))),
    east: Math.min(180, Math.max(136, ...coordinates.map(point => point.lon + 3))),
    south: Math.max(-90, Math.min(15, ...coordinates.map(point => point.lat - 3))),
    north: Math.min(90, Math.max(36, ...coordinates.map(point => point.lat + 3))) };
}

function geography() {
  const mainland = [[109,36],[120.3,36],[120.1,34.8],[120.6,33.3],[121.2,32.1],[121.8,31.3],[121.9,30.8],[121.2,30.5],[121.1,30.1],[121.8,29.9],[121.7,29.2],[121.2,28.7],[121.1,28.1],[120.6,27.7],[120.2,26.9],[119.7,26.6],[119.9,26],[119.2,25.6],[119,25],[118.3,24.6],[117.5,23.8],[116.5,23.1],[115,22.7],[114,22.4],[112.7,21.8],[111.1,21.5],[110.2,20.8],[109,21.7]];
  const taiwan = [[121.5,25.4],[122,25],[121.9,24],[121.4,22.7],[120.9,21.9],[120.6,22.3],[120.1,23.4],[120.2,24.2],[120.8,25.1]];
  const luzon = [[120.5,18.5],[121.3,18.6],[122.2,18.1],[122.4,17],[121.8,16.2],[121.9,15],[120.7,15],[119.9,16.2],[120.3,17.3]];
  // Deliberately generalized outlines; this is a path diagram, not a basemap.
  let html = [mainland, taiwan, luzon].map(polygon => `<polygon points="${points(polygon)}" class="map-land"/>`).join('');
  html += at(115.3,33.5,'中 国') + at(117.2,29,'浙 江') + at(115.1,26.8,'福 建') + at(112.1,23.8,'广 东') + at(119.5,23.4,'台湾','map-place') + at(129,30,'东 海','map-ocean') + at(129,19,'西 太 平 洋','map-ocean');
  for (let lon = Math.ceil(bounds.west / 6) * 6; lon < bounds.east; lon += 6) html += at(lon, bounds.north - .45, lon + '°E', 'coord-label');
  for (let lat = Math.ceil(bounds.south / 6) * 6; lat < bounds.north - 1; lat += 6) html += at(bounds.east - 1.5, lat, lat + '°N', 'coord-label');
  $('geography').innerHTML = html;
}
function renderCities() {
  $('cities').innerHTML = Object.entries(cities).map(([key, city]) => {
    const [x, y] = project([city.lon, city.lat]), selected = key === activeCity;
    return `<circle cx="${x}" cy="${y}" r="${selected ? 6 : 3}" fill="${selected ? '#173d45' : '#8b9d8c'}" stroke="white" stroke-width="2"/>${svgText(x - 12, y + 4, city.name.replace('市', ''), 'map-city', 'text-anchor="end"')}${selected ? svgText(x + 12, y + 4, '关注地区', 'map-city', 'style="font-size:9px"') : ''}`;
  }).join('');
  $('warning-city').textContent = cities[activeCity].name + ' · 本地预警';
}

function renderHealth() {
  const health = dataHealth(snapshot, requestFailed ? { state: 'degraded' } : syncStatus);
  const label = requestFailed ? (snapshot?.fetchedAt ? '网页数据读取失败 · 当前保留最近快照' : '网页数据读取失败 · 请查看官方系统') : health.label;
  $('sync-banner').textContent = `${label} ｜ 来源：浙江省台风路径实时发布系统`;
  $('sync-banner').classList.toggle('unhealthy', health.state !== 'ok');
  $('source-badge').textContent = health.state === 'ok' ? '官方源数据' : '请核对数据时刻';
  $('synced-at').textContent = formatTime(snapshot?.fetchedAt);
  $('attempted-at').textContent = formatTime(syncStatus?.attemptedAt);
  $('data-note').classList.toggle('attention', health.state !== 'ok');
  $('data-note').textContent = health.state === 'ok' ? '来源所报中心风力，不代表本地风力。' : label + '。请以官方最新信息为准。';
  return health;
}

function renderMap() {
  const storm = selectedStorm(), timeline = timelineFor(storm);
  timeStep = Math.min(timeStep, Math.max(0, timeline.length - 1));
  const chosen = timeline[timeStep]; let html = '';
  setBounds(storm); geography(); renderCities();
  if (storm) {
    if ($('show-history').checked) {
      html += `<polyline points="${points(storm.history.map(point => [point.lon, point.lat]))}" fill="none" stroke="#25877c" stroke-width="3" stroke-linejoin="round"/>`;
      // Limit visible dots for readability; the complete path still renders.
      const stride = Math.max(1, Math.ceil(storm.history.length / 24));
      html += storm.history.filter((_, index) => index % stride === 0).map(point => { const [x,y] = project([point.lon,point.lat]); return `<circle cx="${x}" cy="${y}" r="3" fill="white" stroke="#25877c" stroke-width="1.6"/>`; }).join('');
    }
    if ($('show-forecast').checked && timeline.length > 1) {
      html += `<polyline points="${points(timeline.map(point => [point.lon, point.lat]))}" fill="none" stroke="#ac6637" stroke-width="2.5" stroke-dasharray="7 7"/>`;
      html += timeline.slice(1).map((point,index) => { const [x,y] = project([point.lon,point.lat]); return `<g data-step="${index + 1}" role="button" tabindex="0" aria-label="查看未来${point.h}小时预报"><circle cx="${x}" cy="${y}" r="14" fill="transparent"/><circle cx="${x}" cy="${y}" r="5" fill="#fffaf2" stroke="#ac6637" stroke-width="2"/>${svgText(x + 12, y + 3, '+' + point.h + 'h', 'coord-label', 'style="fill:#8a532d"')}</g>`; }).join('');
    }
    const [x,y] = project([storm.lon,storm.lat]);
    html += `<circle cx="${x}" cy="${y}" r="25" fill="#16867b" opacity=".1"/><circle cx="${x}" cy="${y}" r="16" fill="#16867b" opacity=".13"/><circle cx="${x}" cy="${y}" r="9" fill="#14796f" stroke="white" stroke-width="3"/>${svgText(x + 15, y + 24, storm.name, 'map-city', 'style="font-weight:700"')}`;
    if (timeStep > 0 && $('show-forecast').checked) { const [fx,fy] = project([chosen.lon,chosen.lat]); html += `<circle cx="${fx}" cy="${fy}" r="12" fill="none" stroke="#173d45" stroke-width="2"/>`; }
  }
  $('tracks').innerHTML = html;
  $('map-empty').hidden = Boolean(storm);
  const unavailable = !snapshot?.fetchedAt;
  $('map-empty-title').textContent = unavailable ? '暂无法获取路径' : '当前源清单暂无活跃台风';
  $('map-empty-detail').textContent = unavailable ? '请通过官方系统查看最新信息。' : '按最近一次成功同步结果展示，不表示所有地区均无风险。';
  $('map-current-title').textContent = storm ? storm.name + ' · 最新观测中心' : '暂无可显示台风';
  $('map-current-info').textContent = storm ? `${value(storm.level)}级 / ${value(storm.speed)}米每秒 · ${formatTime(storm.observedAt)}` : '来源：浙江省水利厅公开系统';
  $('map-a11y-title').textContent = storm ? storm.name + '台风路径' : '暂无台风路径';
  $('forecast-issued').textContent = storm?.forecasts[0] ? `中国预报 · 起报 ${formatTime(storm.forecasts[0].issuedAt)} · 北京时间` : '暂无中国预报数据 · 不补造未来路径';
  $('forecast-span').textContent = timeline.length > 1 ? `未来 ${timeline.at(-1).h} 小时` : '暂无预报';
  $('forecast-detail').replaceChildren();
  if (chosen) { const title = document.createElement('b'); title.textContent = `${timeStep === 0 ? '最新观测' : '预报 +' + chosen.h + '小时'} · ${formatTime(chosen.time)}`;
    $('forecast-detail').append(title, document.createElement('br'), `${chosen.lat.toFixed(1)}°N / ${chosen.lon.toFixed(1)}°E · ${value(chosen.level)}级 / ${value(chosen.speed)}米每秒`); }
  $('time-slider').max = Math.max(0, timeline.length - 1); $('time-slider').value = timeStep;
  $('time-slider').disabled = timeline.length < 2; $('play').disabled = timeline.length < 2;
  $('time-slider').setAttribute('aria-valuetext', chosen ? `${chosen.h === 0 ? '最新观测' : '未来' + chosen.h + '小时'}，${formatTime(chosen.time)}` : '无时效数据');
  $('time-labels').replaceChildren(...timeline.map((point,index) => { const button = document.createElement('button'); button.dataset.time = index; button.textContent = point.h === 0 ? '观测' : '+' + point.h + 'h'; button.setAttribute('aria-pressed', String(index === timeStep)); return button; }));
  $('time-caption').textContent = !$('show-forecast').checked ? '预报图层已隐藏，文字详情仍可查看' : '按实际提供的预报时效显示';
}

function render() {
  renderHealth(); const storms = snapshot?.storms || [];
  if (!storms.some(storm => storm.id === activeId)) { activeId = storms[0]?.id || ''; timeStep = 0; }
  const storm = selectedStorm();
  $('storm').replaceChildren(...(storms.length ? storms.map(row => new Option(row.name, row.id)) : [new Option(snapshot?.fetchedAt ? '暂无台风' : '暂无数据', '')]));
  $('storm').value = activeId; $('storm').disabled = !storm;
  $('storm-content').hidden = !storm; $('empty-storm').hidden = Boolean(storm);
  $('empty-title').textContent = snapshot?.fetchedAt ? '当前源清单暂无活跃台风' : '暂无法获取台风数据';
  $('empty-detail').textContent = snapshot?.fetchedAt ? '以最近成功同步的结果为准，请留意当地官方预警。' : '请检查网络，或打开官方系统核对。';
  $('storm-code').textContent = storm ? `${storm.english || '未提供英文名'} · ${storm.id}` : '未显示历史台风替代实况';
  $('storm-strength').textContent = storm?.strength || '暂无强度';
  $('observed-at').textContent = formatTime(storm?.observedAt);
  if (storm) {
    $('wind-level').textContent = value(storm.level); $('wind-speed').textContent = value(storm.speed);
    $('wind-bar').style.width = storm.level === null ? '0%' : Math.max(0, Math.min(100, (storm.level - 5) / 13 * 100)) + '%';
    $('location').textContent = `${storm.lat.toFixed(1)}°N / ${storm.lon.toFixed(1)}°E`;
    $('position-text').textContent = storm.position || '来源未提供文字位置描述';
    $('direction').textContent = storm.direction || '暂无数据'; $('move-speed').textContent = value(storm.move);
    $('storm-trend').textContent = storm.trend || '';
  }
  renderMap();
}

function stopPlayback() { clearInterval(timer); timer = null; $('play').setAttribute('aria-pressed', 'false'); $('play').setAttribute('aria-label', '播放预报路径'); $('play').textContent = '▶'; }
function selectTime(index) { stopPlayback(); timeStep = Math.max(0, index); renderMap(); }
async function getJSON(path) {
  const response = await fetch(`${path}?v=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('无法读取已发布数据'); return response.json();
}
async function refresh() {
  if (loading) return; loading = true; $('refresh-data').disabled = true; $('refresh-data').textContent = '正在读取…';
  try {
    const [next, status] = await Promise.all([getJSON('./data/typhoons.json'), getJSON('./data/status.json')]);
    if (next?.schemaVersion !== 1 || !Array.isArray(next.storms) || !status?.state) throw new Error('快照格式错误');
    for (const storm of next.storms) {
      if (!Number.isFinite(storm.lat) || !Number.isFinite(storm.lon) || !Array.isArray(storm.history) || !Array.isArray(storm.forecasts)) throw new Error('台风字段不完整');
    }
    if (next.fetchedAt && status.lastSuccessAt !== next.fetchedAt) throw new Error('同步状态与数据快照时刻不一致');
    if (snapshot?.fetchedAt !== next.fetchedAt) stopPlayback();
    snapshot = next; syncStatus = status; requestFailed = false; render();
  } catch { requestFailed = true; stopPlayback(); render(); }
  finally { loading = false; $('refresh-data').disabled = false; $('refresh-data').textContent = '重新读取数据'; }
}

$('storm').addEventListener('change', event => { activeId = event.target.value; timeStep = 0; stopPlayback(); render(); $('announcement').textContent = '已切换台风：' + selectedStorm().name; });
$('city').addEventListener('change', event => { activeCity = event.target.value; try { localStorage.setItem('guanfeng-city', activeCity); } catch {} renderCities(); });
$('time-slider').addEventListener('input', event => selectTime(Number(event.target.value)));
$('time-labels').addEventListener('click', event => { const button = event.target.closest('[data-time]'); if (button) selectTime(Number(button.dataset.time)); });
$('tracks').addEventListener('click', event => { const point = event.target.closest('[data-step]'); if (point) selectTime(Number(point.dataset.step)); });
$('tracks').addEventListener('keydown', event => { const point = event.target.closest('[data-step]'); if (point && ['Enter',' '].includes(event.key)) { event.preventDefault(); selectTime(Number(point.dataset.step)); } });
for (const id of ['show-history','show-forecast']) $(id).addEventListener('change', renderMap);
$('reset-map').addEventListener('click', () => { timeStep = 0; stopPlayback(); $('show-history').checked = $('show-forecast').checked = true; renderMap(); });
$('play').addEventListener('click', () => {
  if (timer) return stopPlayback(); const count = timelineFor(selectedStorm()).length; if (count < 2) return;
  if (timeStep >= count - 1) timeStep = 0; $('show-forecast').checked = true;
  $('play').setAttribute('aria-pressed', 'true'); $('play').setAttribute('aria-label', '暂停预报路径'); $('play').textContent = 'Ⅱ'; renderMap();
  timer = setInterval(() => { timeStep++; renderMap(); if (timeStep >= count - 1) stopPlayback(); }, 1500);
});
function explainLevel(key) { const [hours, wind, gust] = levels[key]; $('level-description').textContent = `${hours}小时内可能或者已经受热带气旋影响，沿海或者陆地平均风力达${wind}级以上，或者阵风${gust}级以上并可能持续。`; document.querySelectorAll('[data-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.level === key))); }
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => explainLevel(button.dataset.level)));
$('font-toggle').addEventListener('click', () => $('font-toggle').setAttribute('aria-pressed', String(document.body.classList.toggle('large-type'))));
$('refresh-data').addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); else refresh(); });
window.addEventListener('online', refresh);
explainLevel('blue'); render(); refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
