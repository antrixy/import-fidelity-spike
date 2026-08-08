// Oracle: run each fixture's curl command against a local echo server and
// record exactly what arrived. This is the ONLY source of expected values.
//
// Independence note: the echo server is a bare Node http server. It shares no
// parsing code with any adapter under test.

import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fixtures, BASE } from './fixtures.mjs';

const execFileAsync = promisify(execFile);
const PORT = 8099;

// Headers curl always adds itself; not attributable to the fixture.
const CURL_DEFAULTS = new Set(['host', 'user-agent', 'accept', 'content-length']);

function pairs(rawHeaders) {
  const out = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const k = rawHeaders[i].toLowerCase();
    if (CURL_DEFAULTS.has(k)) continue;
    out.push([k, rawHeaders[i + 1]]);
  }
  return out.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
}

export async function captureWire() {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({
        target: req.url,
        method: req.method,
        headers: pairs(req.rawHeaders),
        body: Buffer.concat(chunks).toString('utf8')
      });
      res.writeHead(204);
      res.end();
    });
  });

  await new Promise((r) => server.listen(PORT, r));
  const results = {};

  for (const f of fixtures) {
    const cmd = f.curl.split(BASE).join(`http://127.0.0.1:${PORT}`);
    const before = seen.length;
    try {
      await execFileAsync('bash', ['-c', `${cmd} -s -o /dev/null`], { timeout: 10000 });
    } catch (e) {
      results[f.id] = { error: `curl failed: ${String(e).slice(0, 160)}` };
      continue;
    }
    results[f.id] = seen.length > before
      ? seen[seen.length - 1]
      : { error: 'no request reached the echo server' };
  }

  await new Promise((r) => server.close(r));
  return results;
}
