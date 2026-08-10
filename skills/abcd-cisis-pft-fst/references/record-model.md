# Record model

## Establish the contract

ABCD/CISIS formats address numeric field tags, repeatable occurrences, and optional subfields. Before generating code, obtain one of:

- a representative record;
- a field-selection table or database definition;
- an explicit mapping such as "title is `v245^a`";
- permission to assume common MARC 21 tags.

Ask only for information that changes the result. For example, a title display usually needs the title tag, relevant subfields, repeatability, and desired missing-value behavior.

## Conceptual representation

```json
{
  "mfn": 1,
  "fields": {
    "001": ["control-1"],
    "100": ["^aEco, Umberto^d1932-2016"],
    "245": ["^aThe name of the rose^bA novel"],
    "650": ["^aMonastic libraries", "^aItaly"]
  }
}
```

- `mfn` is the ISIS master-file number, not necessarily MARC control field `001`.
- A tag maps to zero or more occurrences.
- `v245` selects a field occurrence.
- `v245^a` selects subfield `a`.
- Missing fields, occurrences, and subfields normally produce an empty value.
- Unqualified fields outside a repeatable group read the first occurrence in the verified core.

## Common MARC assumptions

Use these only when the user confirms MARC or permits the assumption:

| Data | Typical selector |
|---|---|
| ISBN | `v020^a` or locally mapped `v20` |
| Personal author | `v100^a` |
| Title | `v245^a` |
| Subtitle | `v245^b` |
| Publication place | `v260^a` or `v264^a` |
| Publisher | `v260^b` or `v264^b` |
| Publication date | `v260^c` or `v264^c` |
| Physical description | `v300` |
| Topical subject | `v650^a` |
| Added contributor | `v700^a` |
| Contributor role | `v700^e` |

ABCD databases often use local tags or simplified mappings. Do not replace a supplied local schema with MARC conventions.

## Imported MARC records in ReISIS

- The MARC leader is exposed as field `000`.
- MARC control fields retain their raw values.
- Data fields use CISIS-style strings such as `^aTitle^bSubtitle`.
- Repeatable MARC fields become repeatable occurrences.
- MARC indicators are retained as metadata but are not selected through the verified PFT field syntax.
- Imported records receive sequential MFNs; `001` remains record data.

## Requirement checklist

Confirm these when relevant:

1. Output type: plain text, HTML, or FST terms.
2. Field and subfield mapping.
3. First, selected, ranged, or all occurrences.
4. Missing-value behavior and fallback text.
5. Separators before, between, and after repeated values.
6. Case, punctuation, line width, and indentation.
7. Target runtime and dialect.
8. Example input and exact expected output.
