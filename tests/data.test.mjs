import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSourceTime, normalizeStorm, collectSnapshot, updateData, chooseLatestSnapshot, SOURCE } from '../scripts/update-data.mjs';
import { dataHealth, timelineFor } from '../assets/data-state.mjs';

const now = new Date('2026-09-29T09:10:00Z');
function rawStorm() {
  return { tfid: '202626', name: '测试样本', enname: 'TEST', isactive: '1', points: [
    { time: '2026-09-29 14:00:00', lng: '135', lat: '28.9', power: '10', speed: '25' },
    { time: '2026-09-29 17:00:00', lng: '135.4', lat: '29.2', power: '10', speed: '25', pressure: '985', movespeed: '17', movedirection: '东北东', forecast: [
      { tm: '中国', forecastpoints: [
        { time: '2026-09-29 17:00:00', lng: '135.4', lat: '29.2', power: '10', speed: '25' },
        { time: '2026-09-30 05:00:00', lng: '137.2', lat: '30.2', power: '9', speed: '23', ybsj: '2026-09-29T17:00:00+08:00' }
      ] }
    ] }
  ] };
}
function snapshot() { return { schemaVersion: 1, fetchedAt: now.toISOString(), source: SOURCE, storms: [normalizeStorm(rawStorm(), '202626')] }; }

test('unzoned official detail time is Beijing; UTC list time is preserved', () => {
  assert.equal(parseSourceTime('2026-09-29 17:00:00'), '2026-09-29T09:00:00.000Z');
  assert.equal(parseSourceTime('2026-09-29T09:00:00.000+00:00'), '2026-09-29T09:00:00.000Z');
  assert.throws(() => parseSourceTime('invalid'));
});
test('missing wind stays null, never becomes zero', () => {
  const raw = rawStorm(); raw.points[1].speed = ' '; raw.points[1].power = null;
  const storm = normalizeStorm(raw, '202626');
  assert.equal(storm.speed, null); assert.equal(storm.level, null);
});
test('invalid coordinates and ID mismatch fail instead of publishing misleading points', () => {
  const raw = rawStorm(); raw.points[1].lat = '122';
  assert.throws(() => normalizeStorm(raw, '202626'));
  assert.throws(() => normalizeStorm(rawStorm(), '202627'));
});
test('duplicate and out-of-order observations normalize to latest point', () => {
  const raw = rawStorm(); raw.points = [raw.points[1], raw.points[0], raw.points[1]];
  const storm = normalizeStorm(raw, '202626');
  assert.equal(storm.observedAt, '2026-09-29T09:00:00.000Z'); assert.equal(storm.history.length, 2);
});
test('forecast includes only actual future times from the selected source', () => {
  const storm = normalizeStorm(rawStorm(), '202626'); const timeline = timelineFor(storm);
  assert.deepEqual(timeline.map(point => point.h), [0, 12]);
  assert.equal(storm.forecasts[0].issuedAt, '2026-09-29T09:00:00.000Z');
  const raw = rawStorm(); raw.points[1].forecast[0].tm = '日本';
  assert.equal(normalizeStorm(raw, '202626').forecasts.length, 0);
});
test('a successful empty active list means no active storms, not a historical fallback', async () => {
  let calls = 0; const result = await collectSnapshot({ now, getJSON: async () => { calls++; return []; } });
  assert.equal(result.storms.length, 0); assert.equal(calls, 1); assert.equal(result.sourceUpdatedAt, null);
});
test('active list is verified against detail observation time', async () => {
  const result = await collectSnapshot({ now, getJSON: async url => url === SOURCE.activeEndpoint
    ? [{ tfid: '202626', time: '2026-09-29T09:00:00Z' }] : rawStorm() });
  assert.equal(result.storms[0].lon, 135.4);
  await assert.rejects(collectSnapshot({ now, getJSON: async url => url === SOURCE.activeEndpoint
    ? [{ tfid: '202626', time: '2026-09-29T12:00:00Z' }] : rawStorm() }));
});
test('request failure retains last successful snapshot and marks degradation', async () => {
  const previous = snapshot(); const result = await updateData({ previous, now, collect: async () => { throw new Error('HTTP 503'); } });
  assert.equal(result.snapshot, previous); assert.equal(result.status.state, 'degraded');
  assert.equal(result.status.lastSuccessAt, previous.fetchedAt);
});
test('no previous snapshot plus failure is unavailable, never empty-success', async () => {
  const result = await updateData({ now, collect: async () => { throw new Error('timeout'); } });
  assert.equal(result.snapshot, null); assert.equal(result.status.state, 'unavailable');
});
test('observation rollback retains newer published data', async () => {
  const previous = snapshot(), older = structuredClone(previous); older.storms[0].observedAt = '2026-09-29T06:00:00Z';
  const result = await updateData({ now, previous, collect: async () => older });
  assert.equal(result.snapshot, previous); assert.equal(result.status.state, 'degraded');
});
test('latest deployed snapshot wins over committed bootstrap snapshot', () => {
  const old = snapshot(), fresh = snapshot(); old.fetchedAt = '2026-09-28T09:10:00Z';
  assert.equal(chooseLatestSnapshot(old, fresh, { schemaVersion: 2 }), fresh);
});
test('freshness checks distinguish source failure, scheduler delay and old observations', () => {
  const sample = snapshot(), ok = { state: 'ok' };
  assert.equal(dataHealth(sample, ok, now.getTime()).state, 'ok');
  assert.equal(dataHealth(sample, { state: 'degraded' }, now.getTime()).state, 'degraded');
  assert.equal(dataHealth(sample, ok, now.getTime() + 46 * 60000).state, 'stale');
  sample.storms[0].observedAt = '2026-09-29T01:00:00Z';
  assert.equal(dataHealth(sample, ok, now.getTime()).state, 'old-observation');
  assert.equal(dataHealth(null, ok).state, 'unavailable');
});
