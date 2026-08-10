# Common patterns

Adapt tags to the user's database contract.

## PFT patterns

### Title with optional subtitle

```pft
v245^a,
if p(v245^b) then ': ', v245^b fi
```

### Compact citation

```pft
v100^a, '. ', v245^a, '. ',
v260^a, ': ', v260^b, ', ', v260^c, '.'
```

When publication fields are optional, guard the entire punctuation block rather than only its values.

### Numbered repeatable subjects

```pft
'Subjects', /,
(iocc, |. |, v650^a, /)
```

### Semicolon-separated values without trailing separator

```pft
(v650^a+|; |)
```

### Optional contributor fallback

```pft
if p(v700^a) then
  (v700^a, /)
else
  'No contributor recorded'
fi
```

### Stop after three occurrences

```pft
(if iocc > 3 then break fi, v650^a, /)
```

### Administrative report

```pft
/* Compact record report */
'Record', c12, mfn(6), /,
'Title', c12, v245^a, /,
'Subjects', c12, nocc(v650), /
```

### Mode and wrapped layout

```pft
mhu, 'AUTHOR', /,
mhl, v100, /,
lw(40), v245(3,5)
```

### Count classification

```pft
select nocc(v650)
case 0: 'No subjects'
case 1: 'One subject'
elsecase 'Multiple subjects'
endsel
```

### Temporary derived field

```pft
proc('d999', |a999#|, v245^a, |#|),
v999
```

This replaces field 999 in the current evaluation only. It does not save the
derived field to the database.

### Balanced HTML card

```pft
'<article class="record"><h2>', v245^a, '</h2>',
if p(v245^b) then '<p class="subtitle">', v245^b, '</p>' fi,
if p(v100^a) then '<p class="author">', v100^a, '</p>' fi,
'</article>'
```

## FST patterns

### Identifier plus title and subject words

```fst
10 0 v020^a
20 4 v245^a
30 4 (v650^a, /)
```

### Title and author namespaces

```fst
20 8 '|TI_|', v245^a
30 8 '|AU_|', v100^a
```

### Extract controlled marked phrases

```fst
40 2 '<libraries><cataloging>'
50 3 '/library school/ and /documentation/'
```

## Natural-language transformations

Requirement:

> Show every subject on its own line, prefixed with its occurrence number.

Result:

```pft
(iocc, |. |, v650^a, /)
```

Inverse explanation:

> Iterate over every occurrence of subject subfield `650^a`; for each occurrence, output its one-based occurrence number, a period and space, the subject value, and a conditional newline.

Requirement:

> Index each Unicode word from every title under target tag 20.

Result:

```fst
20 4 (v245^a, /)
```

Expected properties: uppercase word terms, internal apostrophes/hyphens retained, duplicates removed within the row.
