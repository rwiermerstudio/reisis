# ABCD/CISIS Language Studio

An in-browser learning and experimentation environment for a deliberately scoped
subset of the CISIS PFT and FST languages used by ABCD.

The default language profile is `abcd-cisis`. Future compatibility work should
follow CISIS behavior where it differs from other ISIS-family implementations.

## Milestone 4

- Typed PFT AST with source positions and diagnostics
- Field, subfield, and occurrence selectors
- Single-, double-, and pipe-delimited literals
- Newline layout operator and repeatable groups
- `p()` and `a()` conditionals with optional `else`
- CISIS literal association and first/repeated occurrence suppression
- Conditional `/`, unconditional `#`, blank-line reset `%`, `xN`, and `cN`
- CISIS comments, `mfn`, `iocc`, and `nocc()`
- Expression conditions with comparison, boolean, and arithmetic operators
- Pure string/numeric functions and `break`/`continue` group control
- PFT modes, line width, selector ranges/slices/indentation, dummy selectors,
  and prefix/suffix literal suppression
- `s()`, date/time, numeric aggregates, and all three `f()` variants
- `select` plus bounded WinISIS-compatible variables and `while`
- FST techniques 0 through 8, including phrase and prefix extraction
- Evaluation traces and FST term provenance
- Editable JSON record data
- 10 synthetic bibliographic records
- 71 executable lessons with local progress across PFT, FST, expressions,
  functions, control flow, and HTML
- Dedicated playground with PFT/FST examples and quick inserts
- In-browser MARCXML and UTF-8 ISO2709 import for up to 10,000 records
- Worker-based import, IndexedDB persistence, dataset switching, and scalable record navigation
- Record-aware code completion and live syntax highlighting
- One-record and all-record execution in Learn and Playground
- Worker-based, compiled batch evaluation with progress and paged results
- Sanitized HTML rendering with raw source and offline validation views
- Bounded, paged HTML previews for all-record execution
- 416 automated behavioral cases, including 10,000-record import, persistence, and PFT runs

This is an educational compatibility implementation. It does not yet claim full
ABCD, CISIS, WXIS, or IsisScript compatibility. Unsupported syntax is rejected
with a source-positioned diagnostic.

## Run

```sh
npm install
npm run dev
```

The development server uses `http://localhost:4173` when that port is available.

## Verify

```sh
npm test
npm run build
```

The normative milestone grammar is in `docs/pft-core.ebnf` and
`docs/fst-core.ebnf`. Runtime behavior that cannot be expressed by grammar is
recorded in `docs/compatibility.md`.

The HTML exercise security model and supported markup are documented in
`docs/html-output.md`.

MARC import formats, limits, and CISIS field mapping are documented in
`docs/marc-import.md`.
