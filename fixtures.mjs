// Fixture corpus.
//
// Each fixture is a curl command written against BASE. The oracle rewrites
// BASE to a local echo server and records what curl ACTUALLY puts on the
// wire. Adapters parse the same command. Divergence = adapter != wire.
//
// `note` records the intent of the fixture. It is documentation only and is
// NEVER used as the expected value -- curl is the only oracle. An early
// version of this file carried an `expect` field holding a human guess about
// curl's behaviour, and one of those guesses (F04) was wrong. Do not
// reintroduce that field.

export const BASE = 'https://api.example.com';

export const fixtures = [
  {
    id: 'F01-preencoded-query',
    curl: `curl '${BASE}/search?q=a%2Bb&r=100%25'`,
    note: 'percent-encoded query values must not be decoded or re-encoded'
  },
  {
    id: 'F02-basic-auth-colon-in-password',
    curl: `curl -u 'admin:pa:ss:word' ${BASE}/v1/me`,
    note: 'curl splits -u on the FIRST colon only'
  },
  {
    id: 'F03-duplicate-header',
    curl: `curl -H 'X-Tag: alpha' -H 'X-Tag: beta' ${BASE}/v1/items`,
    note: 'repeated header names are legal and both are sent'
  },
  {
    id: 'F04-header-removal-syntax',
    curl: `curl -H 'X-Empty:' -H 'Authorization: Bearer tok' ${BASE}/v1/items`,
    note: 'trailing colon with no value is curl REMOVAL syntax, not empty value'
  },
  {
    id: 'F05-empty-header-value',
    curl: `curl -H 'X-Empty;' -H 'Authorization: Bearer tok' ${BASE}/v1/items`,
    note: 'semicolon form is how curl sends a genuinely empty header value'
  },
  {
    id: 'F06-data-raw-ampersand-json',
    curl: `curl --data-raw '{"q":"b=c&d=e","z":"1"}' -H 'content-type: application/json' ${BASE}/v1/search`,
    note: 'raw JSON body must not be split on & into form fields'
  },
  {
    id: 'F07-get-with-data-G',
    curl: `curl -G --data-urlencode 'q=hello world' --data-urlencode 'tag=a+b' ${BASE}/v1/search`,
    note: '-G moves data to the query string; no body is sent'
  },
  {
    id: 'F08-authorization-and-cookie',
    curl: `curl -H 'authorization: Bearer secret' -H 'Cookie: a=1; b=2' ${BASE}/v1/me`,
    note: 'explicit auth header must survive; cookie header must survive'
  },
  {
    id: 'F09-multiline-continuation',
    curl: `curl '${BASE}/v1/users' \\
  -X POST \\
  -H 'content-type: application/json' \\
  --data-raw '{"name":"Maverick"}'`,
    note: 'backslash continuation parsing'
  },
  {
    id: 'F10-data-binary-newlines',
    curl: `curl --data-binary $'line1\nline2\n' -H 'content-type: text/plain' ${BASE}/v1/log`,
    note: 'literal newlines preserved in body bytes'
  },
  {
    id: 'F11-url-fragment',
    curl: `curl '${BASE}/v1/items?a=1#frag'`,
    note: 'fragment is client-side only and is never sent'
  },
  {
    id: 'F12-repeated-data-joined',
    curl: `curl -d 'a=1' -d 'b=2' ${BASE}/v1/form`,
    note: 'repeated -d flags are joined with & into one body'
  },
  {
    id: 'F13-explicit-method-override',
    curl: `curl -X DELETE -d 'x=1' ${BASE}/v1/items/9`,
    note: '-X overrides the method implied by -d'
  },
  {
    id: 'F14-header-with-colon-in-value',
    curl: `curl -H 'X-Range: bytes: 0-99' ${BASE}/v1/blob`,
    note: 'header value may itself contain colons'
  },
  {
    id: 'F15-unicode-body',
    curl: `curl --data-raw '{"name":"Ash \\u00e9\\u00e7"}' -H 'content-type: application/json' ${BASE}/v1/users`,
    note: 'non-ASCII body bytes preserved'
  }
];
