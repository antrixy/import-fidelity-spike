// Adapters. Each one parses a curl command with a third-party importer and
// normalises the result into the same shape the oracle produces:
//   { target, method, headers: [[k,v],...], body }
//
// Normalisation is deliberately generous: it resolves auth objects into the
// Authorization header the tool would actually send, so that a divergence
// reflects real behaviour rather than a difference in data modelling.

import { createRequire } from 'module';
import { BASE } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const postmanConverter = require('curl-to-postmanv2');
const curlconverter = require('curlconverter');

const IGNORED = new Set(['host', 'user-agent', 'accept', 'content-length']);

function sortHeaders(list) {
  return list
    .filter(([k]) => !IGNORED.has(k.toLowerCase()))
    .map(([k, v]) => [k.toLowerCase(), v])
    .sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
}

function targetOf(url) {
  const s = String(url);
  const stripped = s.startsWith(BASE) ? s.slice(BASE.length) : s.replace(/^https?:\/\/[^/]+/, '');
  return stripped || '/';
}

function basic(user, pass) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

export const adapters = {
  'curl-to-postmanv2': (curl) =>
    new Promise((resolve) => {
      postmanConverter.convert({ type: 'string', data: curl }, (err, res) => {
        if (err || !res?.result) return resolve({ error: String(err || res?.reason) });
        const d = res.output?.[0]?.data;
        if (!d) return resolve({ error: 'no output' });

        const headers = (d.header || []).map((h) => [h.key, h.value]);
        if (d.auth?.type === 'basic') {
          const kv = Object.fromEntries(d.auth.basic.map((x) => [x.key, x.value]));
          headers.push(['authorization', basic(kv.username, kv.password)]);
        }

        let body = '';
        if (d.body?.mode === 'raw') body = d.body.raw ?? '';
        else if (d.body?.mode === 'urlencoded') {
          body = (d.body.urlencoded || [])
            .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
            .join('&');
        }

        resolve({
          target: targetOf(d.url),
          method: d.method,
          headers: sortHeaders(headers),
          body
        });
      });
    }),

  curlconverter: async (curl) => {
    let r;
    try {
      r = curlconverter.toJsonObject(curl);
    } catch (e) {
      return { error: String(e).slice(0, 160) };
    }
    const headers = Object.entries(r.headers || {});
    if (r.auth?.user !== undefined) {
      headers.push(['authorization', basic(r.auth.user, r.auth.password ?? '')]);
    }
    let body = '';
    if (typeof r.data === 'string') body = r.data;
    else if (r.data && typeof r.data === 'object') body = JSON.stringify(r.data);

    return {
      target: targetOf(r.raw_url || r.url),
      method: String(r.method || 'GET').toUpperCase(),
      headers: sortHeaders(headers),
      body
    };
  }
};
