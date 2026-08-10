# ABCD/CISIS Compatibility

Default profile identifier: `abcd-cisis / milestone 4`

This profile targets the CISIS formatting language used by ABCD. It does not
target J-ISIS extensions or WinISIS presentation commands when their behavior
differs from CISIS.

## PFT behavior

- Outside a repeatable group, an unqualified selector reads occurrence 1.
- An explicit `[n]` selector is one-based and overrides group iteration.
- A missing field, occurrence, or subfield emits an empty string.
- A repeatable group runs up to the largest occurrence count among its
  unqualified field selectors.
- Single-quoted literals are classified as unconditional.
- Double-quoted literals are classified as CISIS conditional literals.
- Pipe-delimited literals are classified as CISIS repeatable conditional
  literals.
- Conditional literals are suppressed when their adjacent associated field is
  absent. Double-quoted literals emit only for group occurrence 1; pipe literals
  emit for every present occurrence. Leading/trailing `+` modifiers suppress a
  repeatable literal after the last or before the first group occurrence.
- `/` emits a newline only when output is not already at the beginning of a line.
- `#` emits an unconditional newline and `%` removes trailing blank lines.
- `xN` inserts N spaces. `cN` advances to one-based column N or starts a new
  line when that column has already passed.
- Multiline `/* ... */` CISIS comments are ignored during evaluation and
  retained in the AST when used in a format sequence.
- `mfn` and `mfn(width)` emit the current master file number. A width pads with
  leading zeroes.
- `iocc` emits the current repeatable-group occurrence, or zero outside a group.
- `nocc(field)` counts field occurrences; a subfield selector counts occurrences
  containing that subfield.
- IF conditions support `=`, `==`, `<>`, `!=`, `<`, `<=`, `>`, `>=`, numeric
  arithmetic, parentheses, and short-circuit `and`, `or`, and `not`.
- Pure expression functions include `p()`, `a()`, `size()`, `instr()`, `val()`,
  `left()`, `right()`, `mid()`, `replace()`, and `f()`.
- `break` stops the current repeatable group and `continue` advances to its next
  occurrence. Outside a group either command stops the current format.
- `mpl/mpu`, `mhl/mhu`, and `mdl/mdu` maintain persistent proof, heading, and
  data display state with optional Unicode uppercase conversion.
- `lw(N)` sets active output width. Field indentation `(first,next)` aligns and
  wraps field output; `*offset.length` extracts Unicode character ranges.
- Field selectors accept `[n..m]`, `[n..LAST]`, `[n..]`, and `[LAST]`. Nested
  repeatable groups execute independently and deterministically.
- Dummy selectors `dN` and `nN` associate conditional literals with field
  presence or absence. Prefix/suffix `+` suppresses a repeatable literal on the
  first or last group occurrence.
- `s()` concatenates expression values. `date`, `date(DATEONLY)`, and
  `date(DATETIME)` expose local browser time. `rsum()`, `rmin()`, `rmax()`, and
  `ravr()` aggregate numeric values found in a string.
- `f(value)` and `f(value,width)` use scientific notation;
  `f(value,width,decimals)` uses fixed decimals.
- `select/case/elsecase/endsel` provides typed multi-branch control.
- WinISIS-compatible `e0..e9`, `s0..s9`, assignments, and
  `while condition (format)` are supported. WHILE is capped at 1,000 iterations.
- `proc(format)` evaluates its argument as PFT and applies the generated `D`,
  `A`, and `H` field-update commands to a format-local copy of the current
  record. Later expressions in that evaluation see the updates; source and
  imported records are never persisted or mutated.
- PROC supports `d*`, `d<tag>`, `d<tag>/<occurrence>`,
  `a<tag><delimiter><value><delimiter>`, and `h<tag> <utf8-bytes> <value>`.
  All deletes must precede additions. The complete command stream is validated
  before it is applied, so a malformed update produces `PFT_PROC` with no
  partial field changes.
- `p(field)` is true when the selected value is non-empty.
- `a(field)` is the inverse of `p(field)`.
- Commas and unquoted whitespace separate expressions and do not emit text.

## FST behavior

- Technique 0 extracts non-empty output lines and technique 1 extracts generated
  subfields or lines.
- Techniques 2 and 3 extract phrases inside angle and slash delimiters.
- Technique 4 extracts Unicode letters and numbers. An internal ASCII apostrophe
  or hyphen remains part of a word.
- Techniques 5 through 8 consume a delimiter-wrapped prefix and apply it to the
  terms produced by techniques 1 through 4 respectively.
- Word techniques uppercase terms and all techniques remove duplicates within
  each FST row.
- Duplicate terms emitted by different rows are retained with their row and
  target-tag provenance.

## Explicitly unsupported

- External mode/character conversion tables and byte-oriented slicing semantics
- File and database operations including `@include`, `ref()`, `l()`, `cat()`,
  `system()`, environment functions, and PROC extensions that read other
  records, files, or databases
- Format-valued `s()` arguments containing arbitrary nested PFT control blocks;
  this milestone accepts expression values and nested pure functions
- Unbounded WHILE execution and Pascal format exits
- WXIS IsisScript (`.xis`) elements such as `<pft>`, `<display>`, and `<htmlpft>`
- Stop-word tables, configurable alphabet/uppercase tables, posting data, and
  Lucene integration
- MST/XRF persistence and non-ASCII MARC-8 decoding

Unsupported syntax is an error rather than a compatibility approximation.

## Reference baseline

- [ABCD documentation: CISIS formatting language](https://abcd-community.github.io/en/abcd-technology/cisis-formatting/)
- [ABCD documentation: technology overview](https://abcd-community.github.io/en/abcd-technology/)
- [ABCD documentation: IsisScript](https://abcd-community.github.io/en/abcd-technology/isis-script/)
