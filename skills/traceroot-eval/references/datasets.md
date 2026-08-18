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

### Passing your own `id=` is the exception

`add(..., id="...")` pins a case to an id you supply — useful to tie a case back to an external
system (a ticket number, a table row) for traceback. It **trades away the convergence above**: two
people authoring the same case diverge if they pick different ids, and the cross-SDK guarantee no
longer holds for that case. Reach for it only when the external link is the point; otherwise let
the content derive the id.

`update(id, **changes)` edits a case in place (and rejects a change of `id`); `upsert(case)` adds or
replaces by id; `archive(id)` soft-archives for lineage; `remove(id)` hard-deletes.

### TypeScript shape differences

- **Count is `dataset.size`, a getter — not `.length`.** Python uses `len(dataset)`.
- `dataset.datasetId` is a plain field; `dataset.key` is a **rejecting getter** — assigning to it
  throws, because identity is fixed at construction.
- `push` takes three arguments: `push(transport?, baseVersionId?, { onExisting })`. Python's is
  `push(transport=None, *, base_version_id=None, on_existing=None)`.

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

## `evaluate()` never prompts

A versioning decision must never block a run, so `evaluate()` **auto-approves** the version it
publishes. Re-running an eval is silent and non-interactive even when the dataset content changed.
Do not design around a prompt here, and do not tell a user to set an env var to get past one.

## Explicit push (escape hatch) — this one *does* confirm

`Dataset.push(transport)` is the deliberate publish boundary for workflows that version a dataset
separately from running an eval. That is where interactive version management lives, so publishing
a **changed** version to an already-existing dataset asks first, on a TTY:

```
Dataset 'weather-no-conclusion' already exists (current version dsv_...). Publish a NEW version? [y/N]
```

The default is **no**, so an accidental Enter never publishes. Declining raises
`DatasetPublishAborted` and creates no version.

- Non-interactive contexts (CI, pipes) proceed silently — automation is never blocked.
- `TRACEROOT_ASSUME_YES=1` skips the prompt.
- An unchanged dataset is a no-op and does not prompt.

The default transport is local-only (no network); pass `PlatformDatasetSync()` to publish. A stale
`base_version_id` raises `DatasetConflictError` — pull the latest, review the diff, and retry
intentionally. Answer the confirmation programmatically with `on_existing=lambda info: True` (py) /
`{ onExisting: () => true }` (ts).

`push` returns a `PushResult`: `status` — the literal `"local_only"` or `"uploaded"` — plus the
dataset id, an optional version id, and an optional version number. `status == "local_only"` is how
you tell that nothing was published because the default transport was still in place.

Reach for this only when the user explicitly wants to publish without running an eval. For the
normal path, `evaluate()` handles it.

## Saving a dataset to disk

`save(path)` / `Dataset.load(path)` round-trip a dataset through a local file (`.jsonl` carries a
header record plus one case per line). Useful for committing a dataset next to the code that
evaluates it. Loading does no network I/O.

## Pulling an existing dataset

```python
pull_dataset(dataset_id, *, version_id=None)          # the current version
pull_dataset_version(version_id, *, dataset_id=None)  # one exact immutable version
```

TypeScript: `pullDataset`, `pullDatasetVersion`. A pulled dataset is already synced, so
`evaluate()` will not re-publish it.

**You pull data, not runs.** To reproduce what a past run scored, pull the exact
`dataset_version_id` that run recorded, then bring your own task and scorers:

```python
replay = pull_dataset_version(run.dataset.dataset_version_id, dataset_id=ds.dataset_id)
evaluate(name="x-replay", dataset=replay, task=task, scorers=[s], local=True)
```

Run the replay with `local=True` so reproducing a past run doesn't pollute the reported history.
Passing `dataset_id=` validates that the version actually belongs to that dataset — a foreign
version raises instead of quietly returning the wrong cases.

This is also how you re-run someone else's dataset against your candidate: the cases are shared,
the task and scorers stay yours. There is deliberately no `pull_run`.

## Run provenance

Git/CI details (commit, branch, dirty state, CI build) ride along as **non-identity** run metadata,
so a run can be tied back to the exact commit and dataset version. It is reproducibility metadata,
not identity — and the SDK language is never part of a run's or dataset's identity. Your own
`metadata=` keys win on conflict.
