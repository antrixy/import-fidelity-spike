# import-fidelity-spike

Do API clients faithfully import cURL commands? A differential harness that
answers it mechanically, using what `curl` actually puts on the wire as the
oracle.

## Status — read this first

**This is a spike, not a finished study.** It exists to answer one question:
*do real divergences exist?* They do — six of them, listed below. That is the
whole result so far.

What has **not** been done, and what the findings below are therefore not ready
for:

- Four further reported divergences are probably **artifacts of this harness**,
  not bugs in the importers. See "Known normalisation artifacts" below.
- Nothing has been confirmed against the **shipping applications** — only
  against the npm importer libraries, which may lag or differ from what the
  products run.
- The fixture corpus is 15 cases picked by intuition, not derived from curl's
  option surface.
- **No issues have been filed upstream, and none should be** until the above
  three are resolved.

Everything here is reproducible in the sense that matters for disagreement:
clone it, run it, and check the reasoning against your own wire capture.

**It is NOT dependency-reproducible, and the distinction is worth stating.**
`package.json` declares caret ranges and `package-lock.json` is gitignored, so a
later `npm install` can resolve different importer versions than the pilot
measured — and a re-run producing different output would be indistinguishable
from a harness change. The versions the 2026-08-07 measurements were taken
against are recorded: `curl-to-postmanv2@1.8.7` and `curlconverter@4.12.0`, with
curl 8.5.0. Those are a record of what was measured, not a constraint on what
resolves. The pilot's full transitive dependency tree was never captured and
cannot now be recovered, so a lockfile generated today would describe today
rather than 2026-08-07 — which is why one is not being added here. Pinning
belongs to the study, not to the record of the spike.

**The harness is frozen at its 2026-08-07 state.** Its measurements are cited
elsewhere as evidence for whether the full study is worth doing, so changing it
invalidates that citation. Editing this harness means the full study has
started — which is a decision to make deliberately, not to drift into.

## Thesis

Every major API client advertises "import from cURL." Import fidelity is
mechanically checkable and appears to be largely unchecked. Where importers
disagree with `curl`, the user silently gets a different request than the one
they copied — and the tool reports success either way.

## Oracle

`curl` itself. Each fixture is executed against a local echo server and the
arriving request line, headers, and body are recorded. Adapters parse the same
command string; a divergence is any difference from the wire capture.

**The body is captured as a UTF-8 string, not as raw bytes** — `oracle.mjs`
decodes the received buffer. Invalid UTF-8 would be replaced silently, so this
harness cannot detect a byte-level divergence in a non-UTF-8 body. A known
limitation of the spike, recorded rather than fixed: fixing it is study work,
and this harness is frozen.

The echo server is a bare Node `http` server sharing no parsing code with any
adapter under test.

**The oracle is never a human expectation.** An earlier draft carried an
`expect` field holding a guess about curl's behaviour, and that guess was wrong
for `F04` — `-H 'X-Empty:'` is curl's header *removal* syntax, not an empty
value. Fixtures now carry a `note` field that is documentation only.

## Running

Requires Node 22+ (see `engines.node`), `curl` on `PATH`, and port 8099 free.

```
npm install
npm run study          # human-readable divergence report
npm run study:json     # machine-readable, includes raw wire captures
```

Exit codes: `0` clean, `1` divergences found, `2` harness failure.

## Layout

| File | What it does |
|---|---|
| `fixtures.mjs` | 15 adversarial cURL commands. `note` fields are documentation only. |
| `oracle.mjs` | Runs each fixture against a local echo server; records the wire bytes. |
| `adapters.mjs` | Feeds the same command to each importer; normalises the result. |
| `run.mjs` | Compares adapters to the wire; prints and classifies divergences. |

## Confirmed divergences

These are differences in what would actually be sent. Reproduced against
`curl 8.5.0`.

### F02 — Basic auth credential truncated at the second colon

`curl -u 'admin:pa:ss:word'` splits on the **first** colon only, sending
`admin:pa:ss:word`. `curl-to-postmanv2` sends `admin:pa`.

Highest severity in the set. The user imports a working command, receives a
401, and nothing in the resulting request explains why. Colons are legal in
passwords and common in generated tokens.

### F03 — Duplicate header names collapsed, in opposite directions

`curl -H 'X-Tag: alpha' -H 'X-Tag: beta'` sends **both**.

- `curl-to-postmanv2` keeps `alpha`, drops `beta`
- `curlconverter` keeps `beta`, drops `alpha`

Both diverge from curl, and they disagree with each other. Repeated headers are
legal and load-bearing in practice (`Set-Cookie`, `Forwarded`, `Accept`,
vendor trace headers).

### F04 — Header removal syntax becomes an invented header

`-H 'X-Empty:'` instructs curl to *suppress* that header; nothing is sent.
`curl-to-postmanv2` emits `X-Empty:` with an empty value, adding a header to
the request that curl would not send.

(`F05` confirms the contrasting `-H 'X-Empty;'` form is handled correctly by
both — the semicolon form is how curl sends a genuinely empty value.)

### F07 — Phantom request body on a `-G` GET, plus encoding drift

`curl -G --data-urlencode ...` moves the data into the query string and sends
**no body**. `curl-to-postmanv2` produces the query string *and* a urlencoded
body attached to a GET.

Both adapters also normalise space as `%20` where curl emits `+`, and
upper-case the hex in `%2b`. Semantically equivalent for well-behaved servers;
not byte-identical, and signature-based auth schemes care.

### F11 — URL fragment retained

Fragments are client-side only; curl never transmits them. Both adapters carry
`#frag` into the request target.

### F15 — Body re-serialised, changing bytes

A body containing the literal characters `\u00e9` is transmitted verbatim by
curl. `curlconverter` JSON-parses and re-serialises it, emitting decoded
characters. Any importer that round-trips a body through a parser risks
changing the bytes.

## Known normalisation artifacts — NOT yet findings

These appear in the report but are probably harness limitations. **Resolve
before filing anything upstream.**

- **F12/F13, `curl-to-postmanv2`, "content-type dropped."** curl adds
  `application/x-www-form-urlencoded` implicitly for `-d`. The converter
  encodes this as a body *mode* rather than an explicit header; Postman likely
  sets the header at send time. The adapter must model send-time behaviour.
- **F12/F13, `curlconverter`, body shape.** It exposes parsed form data as an
  object; this harness stringifies it as JSON. Its own code generators probably
  emit the correct wire form. Compare against generator output, not the
  intermediate object.

The general rule: an adapter must compare **what the tool would send**, not
what its intermediate representation happens to contain. Every divergence needs
this check before it counts.

## Before filing upstream

1. Resolve the artifacts above.
2. Confirm each divergence against the **shipping application**, not only the
   npm library — the library may lag or differ from what the product runs.
3. Reproduce on a current release and record exact versions.
4. One issue per divergence, each with the fixture, the wire capture, and the
   adapter output.

## Scope

Currently: `curl-to-postmanv2` (Postman), `curlconverter`.

Candidates: `insomnia-importers`, `@usebruno/converters`, `har-to-postman`,
`httpsnippet`, Hurl, Yaak, Thunder Client.

HAR import is a separate and probably richer surface — a known open question is
that Chrome 130+ omits some auth headers from exported HARs, which means HAR
fixtures need their own provenance notes.

## Method limits

- 15 fixtures is a pilot, not coverage. The corpus should be derived
  systematically from curl's option surface rather than from intuition.
- Divergence counts describe this corpus only. They are not defect rates.
- One curl version, one platform. Both should be recorded per run.
- Absence of divergence on a fixture is evidence about that fixture, nothing
  more.

## Contributing

Corrections are welcome, especially "your harness is wrong about F*n*" — that
is the most useful thing anyone can send, and four such cases are already
listed above. Open an issue with the fixture and the wire capture.

Feature work is a different matter: this harness is frozen (see Status). If
you want to extend the corpus or add adapters, fork it — that is the full
study, and it should be its own project rather than drift here.

## Licence

MIT.
