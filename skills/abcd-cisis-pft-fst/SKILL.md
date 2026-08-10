---
name: abcd-cisis-pft-fst
description: Create, explain, review, translate, and debug ABCD/CISIS PFT display formats and FST field selection tables. Use when requests mention ABCD, CISIS, CDS/ISIS, PFT, print or display formats, FST, indexing techniques, v-tag selectors, conditional or repeatable literals, format diagnostics, or converting natural-language catalog display/indexing requirements into code and back.
---

# ABCD/CISIS PFT and FST

Create correct, readable ABCD/CISIS formatting and indexing code from natural-language requirements. Explain existing code in domain terms and debug it without changing its intended output.

## Establish the task

1. Identify the requested artifact:
   - Use PFT to generate display text, reports, labels, HTML, or computed values.
   - Use FST to derive index terms from a PFT expression.
   - Do not treat PFT/FST as the database search-expression language. Clarify requests for a "query" when retrieval rather than formatting/indexing is intended.
2. Default to the ABCD/CISIS dialect. Ask for the runtime and version when behavior may differ across CISIS, WinISIS, J-ISIS, WXIS, or another ISIS-family implementation.
3. Establish the record contract before writing field selectors. Read [record-model.md](references/record-model.md). Never silently invent local tags or subfields.
4. State a concise assumption when common MARC tags are reasonable but not confirmed.

## Load only the needed references

- For PFT creation or explanation, read [pft.md](references/pft.md).
- For FST work, read [fst.md](references/fst.md) and the PFT sections used by its expression.
- For errors, wrong output, or compatibility problems, read [debugging.md](references/debugging.md).
- For reusable patterns, read [examples.md](references/examples.md).
- For parsing ambiguity, consult [pft-core.ebnf](references/pft-core.ebnf) or [fst-core.ebnf](references/fst-core.ebnf). These grammars define the verified core, not every historical CISIS extension.

## Create PFT code

1. Write the expected output for three cases before finalizing complex code:
   - all relevant fields present;
   - optional field absent;
   - repeatable field containing multiple occurrences.
2. Select the smallest field expression that satisfies the requirement.
3. Put unqualified repeatable fields in a repeatable group. Use an explicit occurrence only when the request calls for one occurrence or range.
4. Choose literal semantics deliberately:
   - single quotes for unconditional text;
   - double quotes for text conditional on an associated field;
   - pipes for text repeated with an associated occurrence.
5. Guard optional multi-expression blocks with `p()` or `a()` when adjacency alone is unclear.
6. Add layout, modes, functions, and control flow only after field/repetition behavior is correct.
7. Balance all delimiters and terminators: quotes, pipes, comments, parentheses, `fi`, and `endsel`.
8. Dry-run the final format occurrence by occurrence. Check punctuation and newlines at missing and final occurrences.

## Create FST code

1. Define the desired term unit: complete output, subfield, marked phrase, word, or prefixed variant.
2. Select technique 0 through 8 from [fst.md](references/fst.md).
3. Write each row as `target-tag technique PFT-expression`.
4. Use a repeatable PFT group when all field occurrences must contribute terms.
5. For techniques 5 through 8, emit the delimiter-wrapped prefix before the term source.
6. Dry-run the row and list representative terms, including case conversion and duplicate removal.

## Debug code

Preserve the user's intended result. Apply the smallest defensible correction.

1. Reproduce or infer the actual record shape and expected output.
2. Classify the problem before editing:
   - lexical or delimiter error;
   - PFT/FST grammar error;
   - valid syntax with wrong repetition, association, or layout;
   - missing/mis-modeled record data;
   - runtime safety limit;
   - dialect mismatch or unsupported function.
3. Check structural errors before semantic ones. Follow the ordered procedure in [debugging.md](references/debugging.md).
4. Do not "fix" a missing field by making punctuation unconditional.
5. When uncertain about implementation-specific behavior, label it and provide a conservative verified-core alternative.

## Explain or translate code

- Explain output order, field dependencies, repetition, and missing-field behavior rather than paraphrasing tokens one by one.
- For FST, describe the target tag, extraction technique, PFT source, normalization, prefix, and example terms.
- For inverse translation, express the code as requirements with explicit assumptions and edge cases.

## Response contract

For creation requests, provide:

1. the code first in a fenced block;
2. field/dialect assumptions;
3. a concise explanation;
4. present, absent, and repeated test cases when relevant.

For debugging requests, provide:

1. the corrected code;
2. the root cause and diagnostic category;
3. the minimal change;
4. any behavior change or remaining compatibility uncertainty.

Keep commas and spacing readable. Add `/* ... */` comments only when they preserve non-obvious domain intent.

## Compatibility boundaries

- Treat the bundled reference as a verified ABCD/CISIS core, not a claim of complete CISIS, WXIS, WinISIS, or J-ISIS support.
- Do not fabricate semantics for `ref()`, `l()`, `cat()`, `proc()`, `system()`, `@include`, external tables, postings, or IsisScript.
- Distinguish PFT-produced HTML from WXIS IsisScript. Keep conditional HTML balanced and recommend sanitization in browser contexts.
- State when a requested feature lies outside the references and ask for runtime documentation or a working example.
