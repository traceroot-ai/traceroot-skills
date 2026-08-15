# TypeScript/Node.js offline eval

## Steps

1. Install: `npm install @traceroot-ai/traceroot dotenv` (plus whatever your task needs).
2. Set `TRACEROOT_API_KEY` in `.env`. Evaluation is cloud-only — the run always reports.
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

const MODEL = "claude-opus-4-8";
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
const coversBothCities = ({ input, output }: ScorerContext): Score => {
  const out = String(output ?? "").toLowerCase();
  const hit = (input as WeatherInput).cities.every((c) => out.includes(c.toLowerCase()));
  return {
    name: "coverage",
    value: hit ? 1.0 : 0.0,
    comment: hit ? "all cities present" : "missing a city",
  };
};

async function main() {
  const result = await evaluate({
    name: "weather-no-conclusion",
    dataset: DATASET,
    task: (input) => task(input as WeatherInput),
    scorers: [coversBothCities],
  });
  console.log(result.summary());
  console.log("\nrun:", result.uploadState.dashboardUrl);
}

void main();
```

`evaluate` is async — `await` it inside a `main()` function rather than relying on top-level await.

## `evaluate()` options

One options object. `name`, `task`, `scorers`, and `dataset` are what you need for a first eval.

| Option | Meaning |
|---|---|
| `name` | the evaluation's name (required) |
| `dataset` | a `Dataset` or an array of cases (`data` is a back-compat alias) |
| `task` | `(input) => output \| Promise<output>` (required) |
| `scorers` | array of scorer functions (required) |
| `runScorers` | whole-run scorers, given a read-only view of all item results |
| `maxConcurrency` | cases in flight |
| `timeout` | per-case bound in seconds; a timeout is an isolated per-case error |
| `select` | `(c: EvalCase) => boolean` to run a subset |
| `metadata` | free-form record attached to the run record |
| `candidateVersion` | label for the version of the system under test |
| `environment` | defaults to `"evaluation"` |
| `datasetId` | associate the run with an existing platform dataset (skips auto-provision) |
| `transport` | explicit transport; `new FakeTransport()` runs offline in tests |
| `progress` | live console progress bar; default auto (on for a TTY, off when piped) |
| `signal` | `AbortSignal` for cooperative cancellation (e.g. SIGINT) |

There is **no** `mainScore` option.

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

`EvalRunResult` carries the item results, the per-metric summary, the dataset reference, and
`uploadState.dashboardUrl`. `summary()` returns a **string** — log it. `caseStatus(item)` returns
`"errored"` or `"not_scored"` — there is no run-level pass/fail to read or compute.
`aggregateScores(...)` gives each metric's mean and count; numeric and boolean values contribute to
the mean, categorical values to the count only.

**Do not use `result.passed`, `result.failed`, `result.failures()`, or `result.scoredCount`.** They
filter on statuses `caseStatus()` never returns, so they are always `0`/empty regardless of how the
run went. Use `errors()` for cases that hit a task or scorer error, and read the per-metric summary
for everything else.

## Parity with Python

Both SDKs produce byte-identical dataset and case ids for the same content, so an eval authored in
either language converges on the same dataset. Give a scorer the same `key` in both to make it the
same logical scorer across runtimes. Option names differ only in casing (`valueType` vs
`value_type`).

## Testing an eval offline

Pass `transport: new FakeTransport()` to exercise the engine without credentials or network. That
is a test affordance — production runs report to the platform.
