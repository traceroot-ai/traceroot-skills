# TypeScript instrumentation

## Initialize once

Call `TraceRoot.initialize()` at the application entry point, before any LLM library imports. Load env vars first.

Next.js loads `instrumentation.ts` on the edge runtime too. A top-level import of `@traceroot-ai/traceroot` loads `node:child_process` through git detection, so the edge runtime cannot load that file. Import the SDK and the provider modules inside `register()`, and only when `process.env.NEXT_RUNTIME === 'nodejs'`:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { TraceRoot } = await import('@traceroot-ai/traceroot');
    const { default: OpenAI } = await import('openai');
    TraceRoot.initialize({
      instrumentModules: {
        openAI: OpenAI, // only the modules this project uses
      },
    });
  }
}
```

Other Node apps import the SDK at the entry point, before any LLM library:

```typescript
import 'dotenv/config'; // must come before TraceRoot import
import { TraceRoot } from '@traceroot-ai/traceroot';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import * as lcCallbackManager from '@langchain/core/callbacks/manager';

TraceRoot.initialize({
  instrumentModules: {
    openAI: OpenAI,       // auto-instruments all OpenAI calls
    anthropic: Anthropic, // auto-instruments Anthropic calls
    langchain: lcCallbackManager,  // see LangChain note below
  },
  // Use only the modules present in the project
});
```

`TRACEROOT_API_KEY` is read from the environment automatically. No need to pass it explicitly.

### Environment

TypeScript reads `TRACEROOT_ENVIRONMENT`, or `initialize({ environment })`. Each span gets `traceroot.environment`, which is what the backend stores, and `deployment.environment` as well. If unset, `traceroot.environment` is left empty.

Other supported `instrumentModules` keys: `claudeAgentSDK`, `bedrock`, `openaiAgents` (pass the imported module, same as above). Pass only the ones the project uses. The Vercel AI SDK is not one of those keys. For Mastra, use `@traceroot-ai/mastra`'s `TraceRootExporter` instead of `instrumentModules`.

### Vercel AI SDK

AI SDK 7 does not emit OpenTelemetry spans on its own. `experimental_telemetry: { isEnabled: true }` only notifies telemetry integrations, and none are registered until you add `@ai-sdk/otel`. Install that package at the same patch as `ai` (`ai@7.0.169` with `@ai-sdk/otel@1.0.169`). A mismatched pair fails to compile, because `OpenTelemetry` implements the `Telemetry` type from `ai`.

Register it after `TraceRoot.initialize()`, so the spans use the provider traceroot set up:

```typescript
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';

TraceRoot.initialize({
  instrumentModules: {
    // the modules this project uses
  },
});
registerTelemetry(new OpenTelemetry({ usage: true }));
```

Once that integration is registered, a call is traced unless it passes `telemetry: { isEnabled: false }`. A call that passes its own `telemetry.integrations`, including an empty list, uses that list instead of the registered one, so it can drop `@ai-sdk/otel` without setting `isEnabled: false`. `telemetry` is the v7 name. `experimental_telemetry` is the v6 name. AI SDK 6 and earlier emit the spans themselves from `experimental_telemetry: { isEnabled: true }` and do not need `@ai-sdk/otel`.

The TS runtime supports fewer frameworks than Python (many agent frameworks are Python-only). The installed package is the current list — read the `instrumentModules` keys from `node_modules/@traceroot-ai/traceroot`'s type declarations rather than fetching a docs page, which costs a network round trip to learn what the dependency already states. Those keys are the auto-instrumentation coverage; the Vercel AI SDK and Mastra paths above are separate and are not keys. Coverage changes over time, so look rather than assume. Before the dependency is installed there is nothing to read, so consult the published list at https://traceroot.ai/docs/integrations/overview for the analyze step only; once `node_modules` exists, those type declarations are authoritative.

### LangChain note

Pass the callbacks manager module, not the LangChain class:

```typescript
import * as lcCallbackManager from '@langchain/core/callbacks/manager';

TraceRoot.initialize({
  instrumentModules: { langchain: lcCallbackManager },
});
```

## Add manual spans with `observe()`

Use `observe()` to wrap functions that represent meaningful steps: agent entrypoints, tool calls, orchestration logic.

```typescript
import { observe, updateCurrentSpan } from '@traceroot-ai/traceroot';

// Agent entrypoint
const result = await observe({ name: 'agent.run', type: 'agent' }, async () => {
  return await runPipeline(query);
});

// Tool call
const docs = await observe({ name: 'search_tool', type: 'tool' }, async () => {
  return await doSearch(query);
});

// Generic span with input recorded
const answer = await observe(
  { name: 'process_step', type: 'span' },
  async () => {
    updateCurrentSpan({ input: { query } });
    return await processQuery(query);
  },
);
```

A function that returns a stream ends the span at that return, and the streamed work is not a child of it. Pass an async generator and exhaust it. `observe` returns that generator. The body starts when the caller begins iterating, and the span ends when iteration finishes:

```typescript
const answer = observe({ name: 'stream', type: 'llm' }, async function* (query: string) {
  for await (const chunk of client.stream(query)) {
    yield chunk;
  }
}, query);
for await (const chunk of answer) {
  // Forward each chunk to the response.
}
```

### `observe()` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `fn.name` or `'anonymous'` | Span name shown in the UI |
| `type` | `string` | `'span'` | `'span'`, `'tool'`, `'agent'`, or `'llm'` |
| `metadata` | `object` | — | Static metadata to attach |
| `tags` | `string[]` | — | Tags for filtering |

## Streaming and long-lived spans

`observe()` ends the span when your function returns. That is correct for a request/response function and wrong for anything that returns a handle to work still in progress — a stream, a queued job, a subscription. For those, either declare the function `async function*` so `observe()` tracks the iteration, or create the span imperatively and end it yourself.

**Async generator** — the span stays open across the whole iteration, and every yielded value is collected as output:

```typescript
import { observe } from '@traceroot-ai/traceroot';

const gen = observe({ name: 'chat.stream', type: 'llm' }, async function* (prompt: string) {
  for await (const chunk of model.stream(prompt)) {
    yield chunk;
  }
});

for await (const chunk of gen) {
  // ...
}
```

**Imperative** — for a streaming route handler that returns the stream and ends the span when the stream completes:

```typescript
import { startSpan, usingSpan } from '@traceroot-ai/traceroot';

const span = startSpan({ name: 'chat.stream', type: 'llm', input: { prompt } });
try {
  // children created inside nest under `span`
  const stream = await usingSpan(span, () => callModel(prompt));

  onFinish(stream, ({ text, usage }) => {          // your framework's completion callback
    span.update({ output: text, usage: { input: usage.in, output: usage.out } });
    span.end();                                    // ends when the stream ends
  });

  return stream;
} catch (err) {
  span.setError(err);
  span.end();
  throw err;
}
```

An imperatively created span is only ended by you — an early return or a rejected promise that skips `end()` leaks it, which is why the `try/catch` above is part of the pattern rather than decoration.

### Imperative span API

| Function | Description |
|----------|-------------|
| `startSpan(options)` | Create a span and return a `Span` handle. `StartSpanOptions` takes `name`, `type`, `input`, `model`, `modelParameters`, `tags`, `sessionId`, `userId`, `attributes`, and `parent` |
| `usingSpan(span, fn)` | Run `fn` with `span` active so nested `observe()`/`startSpan()` calls parent under it |
| `getCurrentSpan()` | The currently active `Span` handle, if any |
| `getCurrentSpanId()` | The id of the currently active span, if any |

`Span` handle methods: `update(attrs)` (`name`, `input`, `output`, `metadata`, `model`, `modelParameters`, `usage`, `attributes`), `setError(err)`, `end()`, and `startSpan(options)` for nested children.

## Set user and session context

Use `usingAttributes()` — all spans created inside the callback inherit the values, including those from auto-instrumented LLM calls.

```typescript
import { usingAttributes } from '@traceroot-ai/traceroot';

const result = await usingAttributes(
  { userId: 'user-123', sessionId: 'sess-456', tags: ['production'] },
  async () => {
    return await runAgent(userMessage);
  },
);
```

`usingAttributes` calls can be nested; the innermost value for each field wins.

## Update spans and traces programmatically

For custom providers or when you need to set attributes after the fact:

```typescript
import { updateCurrentSpan, updateCurrentTrace } from '@traceroot-ai/traceroot';

// Inside an observe() callback:
updateCurrentSpan({
  input: { query: 'hello' },
  output: { response: 'world' },
  model: 'gpt-6-luna',
  modelParameters: { temperature: 0.7, maxTokens: 1024 },
  usage: { inputTokens: 100, outputTokens: 50 },
});

updateCurrentTrace({
  userId: 'user-123',
  sessionId: 'sess-456',
  tags: ['production'],
});
```

## Flush before exit

Scripts, CLIs, and short-lived functions call flush before they return. A long-running server calls it from the SIGTERM and SIGINT handler, then exits. The SDK's `beforeExit` hook does not run on SIGTERM, and the flush inside it is not awaited, so the process can die mid-export.

```typescript
await runMyScript();
await TraceRoot.flush(); // export all buffered spans before exit
```

> Use `flush()`, not `shutdown()`. `flush()` exports what is buffered and leaves tracing running; `shutdown()` tears the provider down and disables the global OpenTelemetry API, so in a reused serverless container later invocations lose spans — and spans started with `startSpan()` never recover.

## What to instrument

**Prioritize:**
- Request/response boundaries (API handlers, queue consumers, cron jobs)
- Agent entrypoints and their major steps
- Tool calls and external calls not already auto-instrumented

**Avoid:**
- Low-level utilities called in tight loops
- Small pure functions that add noise
- Per-item spans in large fanout loops (use one span around the loop)
