# FST reference

## Purpose and row syntax

An FST defines how formatted record data becomes index terms. It is not a search query.

```text
target-tag technique PFT-expression
```

Example:

```fst
10 0 v020^a
20 4 v245^a
30 4 (v650^a, /)
```

- `target-tag` identifies the generated index field.
- `technique` controls extraction from the PFT output.
- The remainder of the row is a PFT program.
- Use one row per line.
- Empty lines are allowed.
- A line whose first non-space character is `#` is a comment.

## Techniques

| Technique | Extraction |
|---|---|
| 0 | Each non-empty output line as one exact term |
| 1 | Each generated `^x` subfield value; falls back to non-empty lines when no subfield marker exists |
| 2 | Each phrase inside `<angle brackets>` |
| 3 | Each phrase inside `/slash delimiters/` |
| 4 | Unicode word tokens, converted to uppercase |
| 5 | Prefix plus technique 1 |
| 6 | Prefix plus technique 2 |
| 7 | Prefix plus technique 3 |
| 8 | Prefix plus technique 4 |

Word extraction retains an internal ASCII apostrophe or hyphen, so `HANDMAID'S` and `CO-OPERATIVE` remain single terms.

Terms are deduplicated within each FST row. The same term produced by different rows is retained with each row's target tag and provenance.

## Common rows

Exact identifier:

```fst
10 0 v020^a
```

Title words:

```fst
20 4 v245^a
```

Words from every subject occurrence:

```fst
30 4 (v650^a, /)
```

Separate generated subfields:

```fst
40 1 v245
```

Marked phrases:

```fst
50 2 '<libraries><14th century>'
60 3 '/library school/ and /documentation/'
```

## Prefix techniques

Techniques 5 through 8 require the evaluated PFT output to start with a prefix enclosed by a repeated delimiter. The first character becomes the delimiter; the text until its next occurrence becomes the prefix.

```fst
20 8 '|TI_|', v245^a
30 8 '|SU_|', (v650^a, /)
```

For title `The name of the rose`, the first row emits terms such as:

```text
TI_THE
TI_NAME
TI_OF
TI_ROSE
```

Do not omit the wrapped prefix:

```fst
20 8 v245^a
```

This is invalid because technique 8 cannot determine its prefix.

## Choosing a technique

1. Use 0 for identifiers, normalized headings, or complete phrases already separated by lines.
2. Use 1 when the PFT intentionally emits subfield markers and each subfield should be separate.
3. Use 2 or 3 when the format marks only selected phrases.
4. Use 4 for ordinary word indexes.
5. Use 5 through 8 when indexes need namespaces such as `TI_`, `AU_`, or `SU_`.

## Validation checklist

1. Every non-comment row has three parts.
2. Target tag is an integer.
3. Technique is 0 through 8.
4. The PFT expression is valid independently.
5. Repeatable fields use a group if all occurrences are needed.
6. Prefix techniques emit a wrapped prefix before the content.
7. Expected case and duplicate behavior match the selected technique.
