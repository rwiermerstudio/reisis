# Debugging guide

## Contents

1. Ordered diagnosis
2. Diagnostic codes
3. Wrong-output patterns
4. FST-specific failures
5. Dialect and data problems
6. Debugging response format

## Ordered diagnosis

Debug from structure outward. Do not rewrite the whole format before finding the failing layer.

1. **Capture the contract**
   - Record fields and occurrences.
   - Exact format or FST source.
   - Actual output or diagnostic.
   - Expected output.
   - Runtime/dialect.
2. **Check lexical balance**
   - `'...'`, `"..."`, and `|...|`.
   - `/* ... */`.
   - Parentheses and occurrence brackets.
3. **Check block terminators**
   - `if ... then ... fi`.
   - `select ... case ... : ... endsel`.
   - `while condition (format)`.
4. **Check selector syntax**
   - Subfield code follows `^`.
   - Occurrences start at 1.
   - Range and `LAST` syntax are valid.
   - Field slicing and indentation are attached to a field.
5. **Check repetition**
   - A repeatable field is inside a group when all occurrences are needed.
   - Explicit occurrences do not unexpectedly disable group-driven selection.
   - The separator is repeatable and suppressed on the correct edge.
6. **Check literal association**
   - Optional punctuation is not unconditional.
   - A double-quoted literal is adjacent to the intended field.
   - A pipe literal is inside the intended repeatable group.
7. **Check expression types and function arity**
   - Use `val()` for numeric field text.
   - Supply every required function argument.
   - Parenthesize mixed boolean/arithmetic expressions.
8. **Check record data and mode**
   - Distinguish a missing field from invalid syntax.
   - Confirm local tag mappings.
   - Check whether proof/heading/data mode explains punctuation or visible `^a` markers.
9. **Check dialect compatibility**
   - Confirm the failing construct exists in the target CISIS-family runtime.

## Diagnostic codes

| Code | Likely cause | Typical correction |
|---|---|---|
| `PFT_UNSUPPORTED` | Unknown token or unsupported extension | Remove it or confirm target-runtime syntax |
| `PFT_LITERAL` | Unterminated quote or pipe literal | Add the matching delimiter |
| `PFT_COMMENT` | Missing `*/` | Close the existing comment; do not insert a second comment block |
| `PFT_GROUP` | Missing group `)` | Close the repeatable group |
| `PFT_SUBFIELD` | Missing code after `^` | Add one alphanumeric subfield code |
| `PFT_OCCURRENCE` | Invalid occurrence/range or occurrence 0 | Use `[1]`, `[2..LAST]`, or another valid one-based selector |
| `PFT_INDENT` | Invalid field indentation | Use a form such as `v245(3,5)` |
| `PFT_LINE_WIDTH` | Invalid `lw()` | Supply a positive width such as `lw(80)` |
| `PFT_MFN` | Invalid MFN width | Use `mfn` or `mfn(4)` |
| `PFT_NOCC` | Missing/invalid field argument | Use a field reference such as `nocc(v650)` |
| `PFT_EXPRESSION_STRING` | Unterminated expression string | Close the quote |
| `PFT_EXPRESSION_TOKEN` | Invalid expression character | Replace it with a supported operator/token |
| `PFT_EXPRESSION` | Invalid expression, unknown function, or wrong arity | Check precedence, function name, and arguments |
| `PFT_THEN` | Missing `then` | Complete `if condition then ... fi` |
| `PFT_FI` | Missing `fi` | Close the conditional |
| `PFT_ASSIGNMENT` | Missing or malformed assignment value | Use `e0:=expression` or `s0:=(format)` |
| `PFT_WHILE` | Missing condition/body or closing `)` | Use `while condition (format)` |
| `PFT_WHILE_LIMIT` | Loop did not terminate within 1,000 iterations | Ensure the body updates the condition variable |
| `PFT_SELECT` | Missing case, colon, or `endsel` | Complete the select structure |
| `FST_ROW` | Row lacks target, technique, or PFT | Use `20 4 v245^a` |
| `FST_TECHNIQUE` | Technique outside 0 through 8 | Choose a supported technique |
| `FST_PREFIX` | Technique 5-8 lacks wrapped prefix | Start output with a value such as `'|TI_|'` |

## Wrong-output patterns

### Punctuation remains when data is absent

Problem:

```pft
v245^a, ': ', v245^b
```

Correction:

```pft
v245^a, if p(v245^b) then ': ', v245^b fi
```

### Only the first repeated value appears

Problem:

```pft
v650^a
```

Correction:

```pft
(v650^a, /)
```

### Label appears only once but should repeat

Problem:

```pft
("Subject: "v650^a, /)
```

Correction:

```pft
(|Subject: |v650^a, /)
```

### Trailing separator appears after the last occurrence

```pft
(v650^a+|; |)
```

### Values run together

Occurrence ranges concatenate. Use a repeatable group with an explicit separator when values must remain distinguishable.

### Stored `^a` markers appear

The format may be in proof mode or selecting the whole field. Select a subfield or use the intended heading/data mode.

### Extra blank lines appear

- `/` is conditional.
- `#` is unconditional.
- `%` removes trailing pending blank lines.

Choose the operator by intent instead of deleting newlines blindly.

### Variable assignment emits nothing

Assignments change state; they are not necessarily output. Emit the variable afterward. String-format assignments require parentheses:

```pft
s0:=(v245^a), s0
```

## FST-specific failures

- **No terms:** First evaluate the row's PFT alone. The extractor cannot create terms from empty output.
- **One term instead of words:** Technique 0 preserves a complete line; use technique 4 for words.
- **Only one occurrence indexed:** Put the repeatable field in a PFT group.
- **Unexpected uppercase:** Word techniques 4 and 8 uppercase terms.
- **Missing duplicate:** Duplicates are removed within one row.
- **Prefix error:** Ensure the first evaluated characters are a delimiter-wrapped prefix.
- **PFT diagnostic on an FST row:** Fix the embedded PFT at its row-relative location.

## Dialect and data problems

Valid code may still fail because:

- the database uses local tags rather than MARC tags;
- a subfield is stored differently;
- the runtime implements WinISIS/J-ISIS behavior rather than CISIS behavior;
- a requested function is outside the verified core;
- a date, conversion table, or character mode is environment-dependent.

Label these as data or compatibility findings. Do not disguise them as syntax fixes.

## Debugging response format

Return:

1. corrected code;
2. root-cause category;
3. minimal edit with a before/after fragment;
4. expected output for representative records;
5. remaining runtime-specific uncertainty.
