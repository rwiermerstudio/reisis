# PFT reference

## Contents

1. Composition and selectors
2. Literals and repetition
3. Conditions and expressions
4. Functions and system values
5. Layout and modes
6. Variables and control flow
7. Format-local record updates
8. HTML output
9. Unsupported or uncertain features

## Composition and selectors

Separate expressions with commas or whitespace. Separators do not emit output.

```pft
v100^a, '. ', v245^a, '.'
```

### Field selectors

| Form | Meaning |
|---|---|
| `v245` | First occurrence of field 245 outside a group |
| `v245^a` | Subfield `a` |
| `v650^a[2]` | Second occurrence; occurrence numbers start at 1 |
| `v650^a[LAST]` | Last occurrence |
| `v650^a[2..4]` | Inclusive occurrence range |
| `v650^a[2..LAST]` | From occurrence 2 through the last |
| `v650^a[2..]` | Open-ended range |
| `v245^a*4.4` | Four Unicode characters at zero-based offset 4 |
| `v245(3,5)` | First-line and continuation indentation |

Ranges concatenate selected values unless the format emits separators. Use a repeatable group when per-occurrence punctuation or layout is needed.

## Literals and repetition

### Literal kinds

| Syntax | Semantics |
|---|---|
| `'text'` | Unconditional literal |
| `"text"` | Conditional literal associated with an adjacent field; first group occurrence only |
| `|text|` | Repeatable conditional literal; emits for each associated occurrence |

Do not use an unconditional literal for optional punctuation unless the punctuation should remain when the field is missing.

```pft
v245^a, if p(v245^b) then ': ', v245^b fi
```

### Repeatable groups

Parentheses iterate to the largest occurrence count among unqualified field selectors in the group.

```pft
(v650^a, /)
(iocc, |. |, v650^a, /)
```

An explicit selector such as `[2]` does not drive group iteration. Nested repeatable groups iterate independently in the verified core.

### First/last separator suppression

Use `+` next to a repeatable literal:

```pft
(v650^a+|; |)     /* suppress suffix after the last occurrence */
(|; |+v650^a)     /* suppress prefix before the first occurrence */
```

### Dummy selectors

- `d700` is present when field 700 exists.
- `n700` is present when field 700 is absent.
- A subfield may be included, for example `d700^e`.

Use dummy selectors to associate conditional literals without outputting the field itself:

```pft
"Contributor present"d700, "No contributor"n700
```

## Conditions and expressions

```pft
if condition then format
else format
fi
```

Supported comparison operators: `=`, `==`, `<>`, `!=`, `<`, `<=`, `>`, `>=`.

Supported boolean operators: `and`, `or`, `not`. Arithmetic supports unary `+`/`-`, addition, subtraction, multiplication, division, and parentheses.

```pft
if p(v245^b) and size(v245^b) > 5 then
  'Detailed subtitle'
else
  'Short or missing subtitle'
fi
```

Use `val()` before numeric comparisons when a field contains numeric text:

```pft
if val(v260^c) < 2000 then 'Published before 2000' fi
```

## Functions and system values

| Form | Result |
|---|---|
| `p(v245)` | True when selected data is present |
| `a(v245)` | True when selected data is absent |
| `nocc(v650)` | Number of field occurrences |
| `size(value)` | Character length |
| `instr(value, search)` | One-based search position, or zero |
| `val(value)` | Numeric conversion |
| `left(value, n)` | Leftmost characters |
| `right(value, n)` | Rightmost characters |
| `mid(value, start, length)` | One-based substring |
| `replace(value, search, replacement)` | Replace matching text |
| `s(value, ...)` | Concatenate expression values |
| `rsum(value)` | Sum numbers found in a string |
| `rmin(value)` / `rmax(value)` | Minimum / maximum number |
| `ravr(value)` | Average of numbers |
| `f(number)` | Default-width scientific notation |
| `f(number, width)` | Width-constrained scientific notation |
| `f(number, width, decimals)` | Fixed decimal formatting |
| `date` | CISIS-style current date/time value |
| `date(DATEONLY)` | Local date in date-only form |
| `date(DATETIME)` | Local date and time form |

System values:

- `mfn` outputs the current MFN.
- `mfn(4)` zero-pads to width 4.
- `iocc` outputs the current repeatable-group occurrence, or zero outside a group.

## Layout and modes

| Syntax | Behavior |
|---|---|
| `/` | Conditional newline; no leading or accumulated empty line |
| `#` | Unconditional newline; repeat as `##` when blank lines are intended |
| `%` | Remove trailing pending blank lines |
| `x4` | Emit four spaces |
| `c20` | Advance to one-based column 20, or start a new line if already past it |
| `lw(80)` | Set line width |
| `/* text */` | Ignored format comment |

Display modes persist until another mode is selected:

| Mode | Meaning |
|---|---|
| `mpl` / `mpu` | Proof mode, lowercase-preserving / uppercase |
| `mhl` / `mhu` | Heading mode, lowercase-preserving / uppercase |
| `mdl` / `mdu` | Data mode, lowercase-preserving / uppercase |

Proof mode retains stored subfield markers. Heading and data modes apply mode-specific punctuation; uppercase variants convert field output to uppercase.

## Variables and control flow

- Numeric variables: `e0` through `e9`.
- String/format variables: `s0` through `s9`.

```pft
e0:=2, e0:=e0*3, e0
s0:=(v245^a), s0
```

String-variable format assignments require parentheses. An incomplete assignment such as `s0:=` is invalid.

```pft
e0:=1,
while e0<=3 (
  e0,
  if e0<3 then ',' fi,
  e0:=e0+1
)
```

WHILE execution must be bounded. The ReISIS browser interpreter stops after 1,000 iterations.

```pft
select nocc(v650)
case 0: 'none'
case 1: 'one'
case 2: 'two'
elsecase 'many'
endsel
```

Inside repeatable groups, `break` stops iteration and `continue` advances to the next occurrence.

## Format-local record updates

`proc(format)` evaluates its argument as a format that generates field-update
commands. Deletes must come before additions. Later expressions in the same
format evaluation read the updated fields.

| Command | Effect |
|---|---|
| `d*` | Delete every field |
| `d245` | Delete every occurrence of field 245 |
| `d650/2` | Delete the second occurrence of field 650 |
| `a999#value#` | Append `value` to field 999; any non-numeric delimiter may replace `#` |
| `h999 5 value` | Append exactly five UTF-8 bytes to field 999 |

```pft
proc('d999', |a999#|, v245^a, |#|),
v999
```

The browser interpreter applies updates to a temporary copy. It does not alter
the loaded dataset or IndexedDB. A malformed command rejects the complete PROC
update rather than applying only a prefix.

## HTML output

Compose markup with literals and keep tags balanced across every conditional path.

```pft
'<article><h2>', v245^a, '</h2>',
if p(v245^b) then '<p class="subtitle">', v245^b, '</p>' fi,
'</article>'
```

Do not confuse generated HTML with WXIS IsisScript. Recommend sanitizing PFT-produced HTML before inserting it into a browser DOM.

## Unsupported or uncertain features

The verified core does not establish behavior for external conversion tables, byte-oriented slicing, `@include`, `ref()`, `l()`, `cat()`, database/file PROC extensions, `system()`, environment/file operations, arbitrary format-valued nested control inside `s()`, Pascal exits, or WXIS IsisScript elements.

Do not guess these semantics. Ask for target-runtime documentation or give a verified-core alternative.
