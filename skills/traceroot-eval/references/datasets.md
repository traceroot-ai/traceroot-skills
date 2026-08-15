# Datasets: author by name, edits become versions

## The mental model

**A dataset's identity is its NAME.** `Dataset("weather-no-conclusion")` always refers to the same
dataset — in any process, on any machine, from Python or TypeScript. Re-running does not fork a new
dataset; it resolves to the same one.

**Versions are content-addressed.** The cases you author produce a content revision. Unchanged
content re-resolves to the current version (a no-op). Changed content publishes a **new version of
the same dataset**.

So: *author a dataset by name; edits become new versions of that dataset.* Do not generate a unique
name per run — that is the one thing that breaks the model, since it forks a fresh dataset each
time and makes runs incomparable.

## Authoring (no network I/O)

```python
from traceroot import Dataset

dataset = Dataset("weather-no-conclusion")
for case in CASES:
    dataset.add(input=case)                       # `expected=` is optional, never inferred
```

```ts
import { Dataset } from "@traceroot-ai/traceroot";

const dataset = new Dataset("weather-no-conclusion");
for (const c of CASES) dataset.add(c.input);
```

`Dataset(name, description=None)` in Python; `new Dataset(name, description = null)` in TypeScript.
Construction and mutation are purely local — nothing is sent until a run (or an explicit push).

`add()` also takes `expected`, `metadata`, `source_trace_id` / `sourceTraceId`,
`source_span_id` / `sourceSpanId`, and an explicit `id`. Only `input` is required.

## Case ids are derived from input content

Without an explicit `id`, each case's id is derived from the dataset key plus that case's **input
content** — not its position. Consequences worth knowing:

- Inserting, removing, or reordering cases does **not** shift other cases' ids.
- The same case authored in Python and TypeScript gets a byte-identical id, so the two SDKs
  converge on one dataset.
- Duplicate inputs are disambiguated by occurrence order.
- Re-publishing matches cases by id, so the platform pairs runs case-for-case.

Ids are `ds_` + a sha256 prefix of the name for the dataset, and `tc_` + a sha256 prefix of
(dataset key + canonical input + occurrence) for each case.

## `evaluate()` provisions the dataset — do not push by hand

Pass the local `Dataset` straight to `evaluate()`:

```python
result = evaluate(name="weather-no-conclusion", dataset=dataset, task=task, scorers=[...])
```

`evaluate()` publishes it once so the run has a server-side version to attach to. This is
idempotent — unchanged content reuses the current version. There is **no** "sync then run" step to
write: no `ensure_synced()`, no `Dataset.push(PlatformDatasetSync())` before the call.

Auto-provisioning is skipped when the dataset is already synced (pulled from the platform), when
you pass an explicit `dataset_id` / `datasetId`, or when you pass an explicit transport.

## The publish confirmation

Publishing a **new version to an already-existing dataset** asks first, on an interactive terminal:

```
Dataset 'weather-no-conclusion' already exists (current version dsv_...). Publish a NEW version? [y/N]
```

The default is **no**, so an accidental Enter never publishes. Declining raises
`DatasetPublishAborted` and creates no version.

- Non-interactive contexts (CI, pipes) proceed silently — automation is never blocked.
- `TRACEROOT_ASSUME_YES=1` skips the prompt everywhere.

An unchanged dataset is a no-op and does **not** prompt. If a script must publish edits
unattended, set `TRACEROOT_ASSUME_YES=1` rather than restructuring the code.

## Explicit push (escape hatch)

`Dataset.push(transport)` still exists as the deliberate publish boundary for workflows that
version a dataset separately from running an eval. Default transport is local-only (no network);
pass `PlatformDatasetSync()` to publish. A stale `base_version_id` raises `DatasetConflictError` —
pull the latest, review the diff, and retry intentionally.

Reach for this only when the user explicitly wants to publish without running an eval. For the
normal path, `evaluate()` handles it.

## Pulling an existing dataset

`pull_dataset(...)` / `pullDataset(...)` fetches a dataset that already lives on the platform (and
`pull_dataset_version` / `pullDatasetVersion` a specific version). A pulled dataset is already
synced, so `evaluate()` will not re-publish it.

## Run provenance

Git/CI details (commit, branch, dirty state, CI build) ride along as **non-identity** run metadata,
so a run can be tied back to the exact commit and dataset version. It is reproducibility metadata,
not identity — and the SDK language is never part of a run's or dataset's identity. Your own
`metadata=` keys win on conflict.
