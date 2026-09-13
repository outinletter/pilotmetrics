import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';

const bundled = await build({ entryPoints: ['src/services/official_event_parsers.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { upsertEventRecord, collectNtsbRange } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const validation = await build({ entryPoints: ['src/services/ingest_validation.ts'], bundle: true, write: false, format: 'esm' });
const { validateIngestRecord } = await import('data:text/javascript;base64,' + Buffer.from(validation.outputFiles[0].text).toString('base64'));
const appBundle = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(appBundle.outputFiles[0].text).toString('base64'));

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('schema.sql', 'utf8'));
  const db = { prepare(query) { return { bind(...args) {
    return { async first() { return sql.prepare(query).get(...args) ?? null; },
      async run() { return sql.prepare(query).run(...args); } };
  } }; } };
  return { sql, db };
}
const row = { id: 'TEST-1', source_name: 'Official', source_url: 'https://example.org/1',
  event_date: '2022-11-27', published_date: '2025-12-15', airport_icao: 'RKSI', summary: 'Test', severity: 3, tags: ['official'], confidence_score: 0 };

test('same airport and date do not merge distinct official IDs', async () => {
  const { db, sql } = database();
  await upsertEventRecord(db, row);
  await upsertEventRecord(db, { ...row, id: 'TEST-2', source_url: 'https://example.org/2' });
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM events').get().n, 2);
  sql.close();
});
test('retry preserves record identity, publication date, zero confidence and unique tags', async () => {
  const { db, sql } = database();
  assert.equal(await upsertEventRecord(db, row), true);
  assert.equal(await upsertEventRecord(db, row), false);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM event_tags').get().n, 1);
  const saved = sql.prepare('SELECT * FROM events').get();
  assert.equal(saved.published_date, '2025-12-15');
  assert.equal(saved.confidence_score, 0);
  sql.close();
});
test('validation rejects malformed dates, missing identity, and unknown severity', () => {
  assert.equal(validateIngestRecord(row), null);
  for (const bad of [null, { ...row, event_date: '2025-02-30' }, { ...row, event_date: '1999-01-01' },
    { ...row, id: '' }, { ...row, severity: 0 }, { ...row, tags: 'official' }]) {
    assert.notEqual(validateIngestRecord(bad), null);
  }
});
test('ingest route acknowledges partial success and rejects null/oversized batches', async () => {
  const { db, sql } = database();
  const post = body => worker.fetch(new Request('https://test/api/ops-intel/ingest-events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }), { DB: db });
  const response = await post({ records: [row, { ...row, id: '' }] });
  assert.equal(response.status, 207);
  const result = await response.json();
  assert.deepEqual(result.accepted_ids, ['TEST-1']);
  assert.equal(result.failed, 1);
  assert.equal(result.created, 1);
  assert.equal((await post(null)).status, 400);
  assert.equal((await post({ records: Array(51).fill(row) })).status, 400);
  sql.close();
});
test('retry can fill an empty field without replacing a richer narrative', async () => {
  const { db, sql } = database();
  await upsertEventRecord(db, { ...row, summary: 'An original detailed narrative' });
  sql.exec("UPDATE events SET aircraft_type=''");
  await upsertEventRecord(db, { ...row, aircraft_type: 'B737' });
  const saved = sql.prepare('SELECT * FROM events').get();
  assert.equal(saved.aircraft_type, 'B737');
  assert.equal(saved.summary, 'An original detailed narrative');
  sql.close();
});
test('general aviation survives collection without invented jet, Part 121, UTC or single-pilot values', async () => {
  const { db, sql } = database();
  const originalFetch = globalThis.fetch;
  const caseData = [{ cm_ntsbNum: 'GA1', cm_eventDate: '2000-01-02T12:30:00',
    cm_vehicles: [{ regulationFlightConductedUnder: '91', cm_make: 'Cessna', cm_model: '172', cm_events: [{ cicttPhaseSOEGroup: 'takeoff' }] }] }];
  globalThis.fetch = async () => new Response(zipSync({ 'cases.json': strToU8(JSON.stringify(caseData)) }));
  try {
    const result = await collectNtsbRange(db, '2000-01-01', '2000-01-31');
    assert.equal(result.created, 1);
    const saved = sql.prepare('SELECT * FROM events').get();
    assert.equal(saved.operation_type, 'Part 91');
    assert.equal(saved.aircraft_category, null);
    assert.equal(saved.event_time, null);
    assert.equal(saved.flight_phase, 'TAKEOFF');
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM event_tags WHERE tag_value='SINGLE_PILOT'").get().n, 0);
  } finally { globalThis.fetch = originalFetch; sql.close(); }
});
