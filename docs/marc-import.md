# MARC import

The Playground can load MARCXML and ISO2709 MARC files without sending data to
a server. Imported datasets are kept in browser memory while in use and saved
to IndexedDB for restoration after reload.

## Supported input

- MARCXML `record` and `collection` documents encoded as UTF-8
- ISO2709/MARC records whose leader position 09 declares UTF-8 (`a`)
- ASCII-only ISO2709 records whose leader declares MARC-8
- Up to 10,000 records and 100 MB per file

MARC-8 records containing non-ASCII characters are rejected with an explicit
encoding diagnostic. They must be converted to UTF-8 MARC or MARCXML before
import. XML documents containing a `DOCTYPE` are rejected.

## CISIS mapping

Each imported record receives a sequential MFN starting at 1. MARC control
number field `001` remains an ordinary field and is not used as the MFN.

- The MARC leader is available as field `000` and in `record.marc.leader`.
- Control fields are stored as their unmodified value.
- Data fields become CISIS subfield strings such as `^aTitle^bSubtitle`.
- Repeatable MARC fields become repeatable CISIS field occurrences.
- Indicators remain aligned with occurrences in `record.marc.indicators` and
  are shown in the record inspector.

Lessons always use the deterministic bundled records. Imported datasets apply
only to the Playground, where they can be evaluated as one record or as a
worker-based batch.

## Local persistence

The application stores one imported dataset per site origin. Metadata and
warnings are stored separately from record data, which is split into chunks of
250 records. Replacement clears and writes all chunks in one IndexedDB
transaction, preventing a partially replaced dataset from becoming active.

The dataset picker can switch between bundled and imported records. Removing
the imported dataset clears its metadata and every record chunk. Storage quota,
private-browsing restrictions, and other IndexedDB failures are reported in the
dataset bar while the in-memory import remains usable when possible.

## Processing model

The selected file is transferred to a dedicated module worker. MARCXML is fed
incrementally to a SAX parser, so no XML DOM is constructed. ISO2709 records
are read from their leaders and directories using byte offsets. Normalized
records are then transferred to the existing evaluation worker when all-record
PFT or FST execution is selected.
