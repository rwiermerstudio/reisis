# HTML output exercises

ABCD display formats can emit HTML by composing markup literals and record fields
in a CISIS PFT. ABCD uses this technique for web presentation through WXIS. This
milestone teaches the same composition model while using a deliberately smaller,
safe browser surface.

## Workflow

HTML exercises open on the Rendered result tab. The other views show:

- HTML: the exact text emitted by the PFT evaluator.
- Validation: offline structural HTML diagnostics and sanitizer removals.
- Trace and AST: the existing PFT evaluation details.

Exercises can be opened directly with `?lesson=26`; append `&solution=1` to load
the reference solution for demonstrations and review.

Validation messages link back to the PFT literal that produced the affected
markup when a single record is active. An exercise only passes when its expected
output is present, validation has no errors, and the sanitizer removed nothing.

All-record mode keeps evaluation in the existing worker and renders only the
current 20-record result page. This prevents preview cost from growing with a
future collection containing thousands of records.

## Security boundary

Rendered output is sanitized and loaded into an iframe with an empty sandbox and
a restrictive Content Security Policy. The current milestone blocks:

- scripts and inline event handlers
- forms and interactive controls
- frames, objects, and embedded media
- remote links, images, stylesheets, fonts, and CSS URLs
- document metadata that can alter navigation or resource loading

Fragment links, `mailto:` links, data-URL raster images, internal CSS, semantic
HTML, lists, and tables are supported. WXIS IsisScript, `<htmlpft>`, `cat()`,
remote assets, JavaScript, audio/video, and iframe content remain outside this
milestone.
