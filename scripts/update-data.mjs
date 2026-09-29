import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const SOURCE = Object.freeze({
  name: '浙江省台风路径实时发布系统',
  url: 'https://typhoon.slt.zj.gov.cn/',
  owner: '浙江省水利厅',
  activeEndpoint: 'https://typhoon.slt.zj.gov.cn/Api/TyhoonActivity',
  detailEndpoint: 'https://typhoon.slt.zj.gov.cn/Api/TyphoonInfo/'
});

// The official detail endpoint uses unzoned Beijing time; its active-list
// endpoint uses UTC with an explicit offset. Never reinterpret explicit zones.
export function parseSourceTime(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('缺少数据时刻');
  let text = value.trim().replace(' ', 'T');
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += '+08:00';
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) throw new Error('无效数据时刻');
  return new Date(milliseconds).toISOString();
}

function numeric(value, min, max, required = false) {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) throw new Error('缺少经纬度');
    return null;
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new Error('字段数值超出有效范围');
  }
  return result;
}
const text = value => typeof value === 'string' ? value.trim().slice(0, 500) : '';
function normalizePoint(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('路径点格式错误');
  return {
    time: parseSourceTime(raw.time),
    lon: numeric(raw.lng, -180, 180, true), lat: numeric(raw.lat, -90, 90, true),
    level: numeric(raw.power, 0, 30), speed: numeric(raw.speed, 0, 200),
    pressure: numeric(raw.pressure, 700, 1100), strength: text(raw.strong)
  };
}

export function normalizeStorm(raw, expectedId) {
  if (!raw || String(raw.tfid) !== expectedId || !Array.isArray(raw.points) || !raw.points.length) {
    throw new Error('台风详情缺失或编号不匹配');
  }
  if (raw.isactive !== undefined && String(raw.isactive) !== '1') throw new Error('活跃清单与详情状态不一致');
  const sorted = raw.points.map(point => ({ raw: point, point: normalizePoint(point) }))
    .sort((a, b) => Date.parse(a.point.time) - Date.parse(b.point.time));
  const unique = [...new Map(sorted.map(entry => [entry.point.time, entry])).values()];
  const last = unique.at(-1);
  const forecasts = [];
  // Only use forecasts attached to the latest observation. Do not quietly
  // replace a missing current forecast with a previous issue or another agency.
  for (const forecast of Array.isArray(last.raw.forecast) ? last.raw.forecast : []) {
    if (forecast.tm !== '中国' || !Array.isArray(forecast.forecastpoints)) continue;
    const candidates = forecast.forecastpoints.map(point => ({ raw: point, point: normalizePoint(point) }));
    const future = candidates.filter(entry => Date.parse(entry.point.time) > Date.parse(last.point.time));
    if (!future.length) continue;
    const issueTimes = [...new Set(future.map(entry => parseSourceTime(entry.raw.ybsj || last.raw.time)))];
    if (issueTimes.length !== 1) throw new Error('同一预报包含多个起报时次');
    forecasts.push({ source: '中国', issuedAt: issueTimes[0], points: [...new Map(future
      .sort((a, b) => Date.parse(a.point.time) - Date.parse(b.point.time))
      .map(entry => [entry.point.time, entry.point])).values()]
    });
  }
  return {
    id: expectedId, name: text(raw.name) || expectedId, english: text(raw.enname), active: true,
    observedAt: last.point.time, ...last.point,
    move: numeric(last.raw.movespeed, 0, 200), direction: text(last.raw.movedirection),
    position: text(last.raw.ckposition), trend: text(last.raw.jl),
    history: unique.map(entry => entry.point), forecasts
  };
}

export async function fetchJSON(url, { fetchImpl = fetch, attempts = 3, timeout = 20000 } = {}) {
  let failure;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Guanfeng-Coastal-Info/1.0 (15-minute public-data sync)' },
        signal: AbortSignal.timeout(timeout)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 10_000_000) throw new Error('响应过大');
      return JSON.parse(body);
    } catch (error) {
      failure = error;
      if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
  throw new Error(`数据请求失败：${failure?.message || '未知错误'}`);
}

export async function collectSnapshot({ getJSON = fetchJSON, now = new Date() } = {}) {
  const active = await getJSON(SOURCE.activeEndpoint);
  if (!Array.isArray(active) || active.length > 30) throw new Error('活跃台风清单格式错误');
  const ids = [...new Set(active.map(row => {
    const id = String(row?.tfid ?? '');
    if (!/^\d{6}$/.test(id)) throw new Error('台风编号格式错误');
    return id;
  }))];
  const storms = [];
  // Small, bounded sequential requests avoid unnecessary load on the source.
  for (const id of ids) {
    const storm = normalizeStorm(await getJSON(SOURCE.detailEndpoint + id), id);
    const listed = active.find(row => String(row.tfid) === id);
    if (listed.time && Date.parse(storm.observedAt) < Date.parse(parseSourceTime(listed.time))) {
      throw new Error('台风详情落后于活跃清单');
    }
    if (Date.parse(storm.observedAt) > now.getTime() + 15 * 60000) throw new Error('观测时刻异常超前');
    storms.push(storm);
  }
  storms.sort((a, b) => b.id.localeCompare(a.id));
  return { schemaVersion: 1, source: SOURCE, fetchedAt: now.toISOString(),
    sourceUpdatedAt: storms.length ? storms.map(storm => storm.observedAt).sort().at(-1) : null,
    storms, warningStatus: 'not-connected' };
}

export function isSnapshot(value) {
  return value?.schemaVersion === 1 && Array.isArray(value.storms)
    && Number.isFinite(Date.parse(value.fetchedAt))
    && value.storms.every(storm => /^\d{6}$/.test(storm.id) && Number.isFinite(Date.parse(storm.observedAt))
      && Number.isFinite(storm.lat) && Number.isFinite(storm.lon) && Array.isArray(storm.history)
      && storm.history.length > 0 && Array.isArray(storm.forecasts));
}

export function chooseLatestSnapshot(...snapshots) {
  return snapshots.filter(isSnapshot).sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0] || null;
}

export async function updateData({ previous = null, collect = collectSnapshot, now = new Date() } = {}) {
  try {
    const snapshot = await collect({ now });
    if (previous && Date.parse(snapshot.fetchedAt) < Date.parse(previous.fetchedAt)) throw new Error('同步时钟倒退');
    for (const storm of snapshot.storms) {
      const old = previous?.storms.find(row => row.id === storm.id);
      if (old && Date.parse(storm.observedAt) < Date.parse(old.observedAt)) throw new Error('上游观测版本倒退');
    }
    return { snapshot, status: { schemaVersion: 1, state: 'ok', attemptedAt: now.toISOString(),
      lastSuccessAt: snapshot.fetchedAt, message: '同步成功', source: SOURCE.url } };
  } catch (error) {
    return { snapshot: previous, status: { schemaVersion: 1, state: previous ? 'degraded' : 'unavailable',
      attemptedAt: now.toISOString(), lastSuccessAt: previous?.fetchedAt || null,
      message: '上游同步失败，当前数据可能不是最新。', detail: String(error.message).slice(0, 250), source: SOURCE.url } };
  }
}

async function main() {
  await mkdir('data', { recursive: true });
  let local = null, deployed = null;
  try { local = JSON.parse(await readFile('data/typhoons.json', 'utf8')); } catch {}
  if (process.env.PREVIOUS_SNAPSHOT_URL) {
    try { deployed = await fetchJSON(process.env.PREVIOUS_SNAPSHOT_URL, { attempts: 1 }); }
    catch { console.warn('未取到上一次已部署快照，使用仓库内最近有效快照。'); }
  }
  const previous = chooseLatestSnapshot(local, deployed);
  const result = await updateData({ previous });
  if (result.snapshot) await writeFile('data/typhoons.json', JSON.stringify(result.snapshot, null, 2) + '\n');
  else await writeFile('data/typhoons.json', JSON.stringify({ schemaVersion: 1, source: SOURCE, fetchedAt: null, storms: [], warningStatus: 'not-connected' }) + '\n');
  await writeFile('data/status.json', JSON.stringify(result.status, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `sync_failed=${result.status.state !== 'ok'}\n`);
  console.log(JSON.stringify({ state: result.status.state, fetchedAt: result.snapshot?.fetchedAt,
    storms: result.snapshot?.storms.map(storm => ({ id: storm.id, name: storm.name, observedAt: storm.observedAt })) || [] }));
  if (result.status.state !== 'ok') console.error(result.status.detail);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
