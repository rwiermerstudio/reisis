# Batch Execution

The `All` record scope is shared by Learn and Playground. It uses a separate
module Worker in production and a cooperative timer fallback where Workers are
unavailable.

## Execution contract

1. The active dataset is transferred to the Worker when the dataset changes.
2. Source edits are debounced before an evaluation request is sent.
3. PFT or FST source is compiled once per request.
4. The compiled representation is evaluated in chunks of 100 records.
5. Each chunk posts compact output back with processed and total counts.
6. A newer request cancels the previous request between chunks.

Batch results intentionally omit ASTs, execution traces, source copies, and FST
term source strings. Those heavier structures are generated only for the active
detail record. The UI pages record results and therefore keeps its rendered DOM
bounded as the dataset grows.

The synchronous core has test coverage for 5,000 PFT records and 2,000 FST
records. Larger future datasets can use the same contract without changing the
language runtime or result view.
