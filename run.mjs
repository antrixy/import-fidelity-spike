// Compare every adapter against the curl wire oracle and report divergences.
//
// Exit codes:
//   0  no divergences
//   1  divergences found
//   2  harness failure (oracle could not run)

import { fixtures } from './fixtures.mjs';
import { captureWire } from './oracle.mjs';
import { adapters } from './adapters.mjs';

const asJson = process.argv.includes('--json');

function headerDiff(wire, got) {
  const key = (p) => `${p[0]}: ${p[1]}`;
  const w = wire.map(key);
  const g = got.map(key);
  const missing = w.filter((x) => !g.includes(x));
  const extra = g.filter((x) => !w.includes(x));
  return { missing, extra };
}

function compare(wire, got) {
  const d = [];
  if (got.error) return [{ field: 'adapter', detail: got.error }];
  if (wire.method !== got.method) {
    d.push({ field: 'method', detail: `wire=${wire.method} adapter=${got.method}` });
  }
  if (wire.target !== got.target) {
    d.push({ field: 'target', detail: `wire=${wire.target} adapter=${got.target}` });
  }
  const h = headerDiff(wire.headers, got.headers);
  for (const m of h.missing) d.push({ field: 'header.dropped', detail: m });
  for (const e of h.extra) d.push({ field: 'header.invented', detail: e });
  if ((wire.body || '') !== (got.body || '')) {
    d.push({
      field: 'body',
      detail: `wire=${JSON.stringify(wire.body)} adapter=${JSON.stringify(got.body)}`
    });
  }
  return d;
}

const wire = await captureWire();
const report = [];

for (const f of fixtures) {
  const w = wire[f.id];
  if (!w || w.error) {
    report.push({ id: f.id, oracleError: w?.error ?? 'missing' });
    continue;
  }
  const row = { id: f.id, note: f.note, adapters: {} };
  for (const [name, fn] of Object.entries(adapters)) {
    row.adapters[name] = compare(w, await fn(f.curl));
  }
  report.push(row);
}

if (asJson) {
  console.log(JSON.stringify({ wire, report }, null, 2));
} else {
  let total = 0;
  for (const r of report) {
    if (r.oracleError) {
      console.log(`\n${r.id}\n  ORACLE ERROR: ${r.oracleError}`);
      continue;
    }
    const names = Object.keys(r.adapters);
    const bad = names.filter((n) => r.adapters[n].length);
    const mark = bad.length === 0 ? 'ok' : bad.length === names.length ? 'ALL DIVERGE' : 'DIVERGE';
    console.log(`\n${r.id}  [${mark}]`);
    console.log(`  ${r.note}`);
    for (const n of names) {
      const ds = r.adapters[n];
      if (!ds.length) {
        console.log(`  ${n}: matches wire`);
        continue;
      }
      total += ds.length;
      console.log(`  ${n}:`);
      for (const d of ds) console.log(`    - ${d.field}: ${d.detail}`);
    }
  }
  console.log(`\n---\n${total} divergence(s) across ${fixtures.length} fixtures.`);
}

const anyDiv = report.some(
  (r) => !r.oracleError && Object.values(r.adapters).some((d) => d.length)
);
const anyOracleErr = report.some((r) => r.oracleError);
process.exit(anyOracleErr ? 2 : anyDiv ? 1 : 0);
