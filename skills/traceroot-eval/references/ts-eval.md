# TypeScript/Node.js offline eval

## Steps

1. Install: `npm install @traceroot-ai/traceroot dotenv` (plus whatever your task needs).
2. Set `TRACEROOT_API_KEY` in `.env` so the run reports — or pass `local: true` to skip reporting.
3. Create the eval script (below) and run it: `npx tsx eval-weather.ts`.
4. Open the printed dashboard URL to see the run, its metrics, and each case's trace.

Node >= 20. Everything eval-related is exported from the package root — there is no subpath.

## eval-weather.ts

```ts
import "dotenv/config";

import Anthropic from "@anthropic-ai/sdk";
import {
  initialize, evaluate, Dataset,
  type Score, type ScorerContext,
} from "@traceroot-ai/traceroot";

const MODEL = "claude-opus-5";
const SYSTEM_PROMPT =
  "You are a weather assistant. Answer using ONLY the data provided. Present the facts " +
  "and a short Comparison section only. Do NOT add a concluding paragraph.";

const WEATHER_FACTS: Record<string, string> = {
  "San Francisco": "68°F, Foggy, 75% humidity",
  Tokyo: "72°F, Sunny, 50% humidity",
  London: "59°F, Rainy, 88% humidity",
  Paris: "64°F, Cloudy, 70% humidity",
};

interface WeatherInput { query: string; cities: string[] }

const CASES: WeatherInput[] = [
  { query: "What's the weather in San Francisco and Tokyo? Compare them.", cities: ["San Francisco", "Tokyo"] },
  { query: "Compare the weather in London and Paris.", cities: ["London", "Paris"] },
];

initialize({ apiKey: process.env.TRACEROOT_API_KEY, instrumentModules: { anthropic: Anthropic } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Identity is the NAME. evaluate() provisions this for you — no manual push.
const DATASET = new Dataset("weather-no-conclusion");
for (const c of CASES) DATASET.add(c);

// The system under evaluation: one input in, one output out.
async function task(input: WeatherInput): Promise<string> {
  const facts = input.cities.map((c) => `${c}: ${WEATHER_FACTS[c]}`).join("\n");
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${input.query}\n\nData:\n${facts}` }],
  });
  return resp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
}

// A scorer takes the ScorerContext. Returning a Score adds a metric name + a per-case comment.
// The value is a BOOLEAN, so it is its own pass/fail verdict — no threshold needed. The const is
// named for the metric it emits, which keeps that verdict bound once you add a second scorer.
const coverage = ({ input, output }: ScorerContext): Score => {
  const out = String(output ?? "").toLowerCase();
  const hit = (input as WeatherInput).cities.every((c) => out.includes(c.toLowerCase()));
  return {
    name: "coverage",
    value: hit,
    comment: hit ? "all cities present" : "missing a city",
  };
};

async function main() {
  // On a terminal this logs its own summary and the run URL — no manual log needed.
  await evaluate({
    name: "weather-no-conclusion",
    dataset: DATASET,
    task: (input) => task(input as WeatherInput),
    scorers: [coverage],
  });
}

void main();
```

`evaluate` is async — `await` it inside a `main()` function rather than relying on top-level await.

## `evaluate()` options

One options object. `name`, `task`, `scorers`, and `dataset` are what you need for a first eval.

| Option | Meaning |
|---|---|
| `name` | the evaluation's name (required) |
| `dataset` | a `Dataset`, a `DatasetSnapshot`, or an array of cases (required; `data` is an alias) |
| `task` | `(input) => output \| Promise<output>` (required) |
| `scorers` | array of scorer functions (required) |
| `local` | `true` runs in full and reports **nowhere**; mutually exclusive with `transport` |
| `evaluationKey` | stable grouping identity; defaults to `name` |
| `maxConcurrency` | cases in flight, default `10` |
| `timeout` | per-case bound in seconds, bounding the task *and* its scorers |
| `select` | `(c: EvalCase) => boolean` to run a subset |
| `metadata` | free-form record attached to the run record |
| `candidateVersion` | label for the candidate under test (a git sha, a model id) |
| `environment` | defaults to `"evaluation"` |
| `datasetId` | associate the run with an existing platform dataset (skips auto-provision) |
| `transport` | explicit reporting sink; prefer `local: true` for a local run |
| `progress` | live console progress bar; default auto (on for a TTY, off when piped) |
| `signal` | `AbortSignal` for cooperative cancellation (e.g. SIGINT) |

There is **no** `mainScore` option, and **no `runScorers`** — whole-run scorers were removed;
aggregate across cases yourself from the returned result.

**`name` vs `evaluationKey`.** `name` is the display label; `evaluationKey` is the stable identity
runs are grouped by (the same split as a scorer's `name` vs `key`). Set it to keep one history
across a rename, or to group the TypeScript and Python runs of one evaluation.

`evaluateAsync(...)` is also exported, and `Evaluation` is the reusable object form.

## Imports

```ts
import {
  evaluate, Dataset, Scorer,                                  // the common surface
  FakeTransport, PlatformDatasetSync, DatasetPublishAborted,
  pullDataset, caseStatus, aggregateScores,
} from "@traceroot-ai/traceroot";
import type { Score, ScorerContext, EvalCase } from "@traceroot-ai/traceroot";
```

`Score`, `ScorerContext`, and `EvalCase` are **types**, not classes — import them with
`import type` and return plain object literals.

`Scorer.code` and `Scorer.llmJudge` are the same functions as the older `scorer` / `llmJudge`
exports, which still work.

## Reading the result

`evaluate()` logs its summary on completion whenever the progress bar is shown (interactive, or
`progress: true`). Piped, in CI, or called programmatically, stdout stays clean and you read the
result yourself:

```ts
run.summary();                      // the same string it auto-logs
run.results;                        // EvalItemResult[]
run.errored;                        // number — COUNT of cases with a task or scorer error
run.notScored;                      // number — COUNT of cases that did NOT error
run.errors();                       // EvalItemResult[] — the errored cases themselves
run.uploadState.dashboardUrl;       // link to the reported run
run.uploadState.failedResultCount;  // per-case POSTs dropped; >0 means silently-missing results
run.candidateVersion;
run.save("run.json");               // EvalRunResult.load(path) reads it back
caseStatus(item);                   // per case: "errored" | "not_scored"
```

`summary()` is a head line plus one line per metric, byte-identical to the Python output:

```
EvalRunResult(name='weather-no-conclusion', cases=2, errored=0, not_scored=2, task_errors=0, upload=uploaded)
  coverage: mean=1 pass=2/2 count=2
```

`pass=k/n` appears for any metric whose scores are **judgeable**: boolean values always are;
numeric values only once their scorer declares a `threshold`. It is resolved exactly as the platform
resolves it, so the local pass-rate matches what the dashboard will show.

Per-case status is `"errored"` or `"not_scored"` — there is no run-level pass/fail to read or
compute.

**`not_scored` does not mean "no score was emitted."** Per-case status has exactly two values, and
`not_scored` is simply *not `errored`* — every case that ran cleanly carries it, scores and all.
That is why the run above reports `not_scored=2` alongside `pass=2/2`. Call `run.errors()` to get
the failed cases; read the metric lines to see what was scored.

**`errored` and `notScored` are counts, not collections** — they are `number` getters, so
`run.errored.map(...)` throws. Use `run.errors()` for the errored items, or `run.results` for every
item. `aggregateScores(...)` gives each metric's mean and count; numeric and boolean values
contribute to the mean, categorical values to the count only.

A scorer that throws fails that scorer on that case and marks the case `errored`; the run itself
completes and reports. A scorer that returns a non-finite number (`NaN`, `Infinity`) is recorded as
a scorer error too, rather than a fake zero or a null.

## Running without reporting

Pass `local: true`. The run executes in full and returns a complete `EvalRunResult`, but reports
nowhere — no credentials, no dataset publish, no run record. Use it while drafting, in unit tests,
or anywhere a key is unavailable.

## Parity with Python

Both SDKs produce byte-identical dataset and case ids for the same content, so an eval authored in
either language converges on the same dataset. Give a scorer the same `key` in both to make it the
same logical scorer across runtimes. Option names differ only in casing (`valueType` vs
`value_type`).

## Asserting the wire in tests

`local: true` reports nowhere and discards the record of what *would* have been sent. When a test
needs to assert that sequence, pass `transport: new FakeTransport()` instead — it makes zero HTTP
calls and records the exact call order in `.calls`:

```
create_run → register_item×N → record_item_result×N → record_scores×N → finish_run
```

`local: true` reports nowhere like a `FakeTransport` whose record is thrown away — but it is not
identical: `FakeTransport` runs the normal exporting tracer (spans can still be exported), whereas
`local: true` uses a non-exporting tracer and suppresses global auto-init. Use `local` to run
leak-free; use `FakeTransport` to assert the wire.
