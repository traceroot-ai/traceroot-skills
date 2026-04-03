# TypeScript quickstart demo (no external LLM calls)

## Steps

1. Install dependencies: `npm install @traceroot-ai/traceroot dotenv`
2. Set `TRACEROOT_API_KEY` in your `.env` file.
3. Create `quickstart.ts` with the code below.
4. Run `npx tsx quickstart.ts`.
5. Open the TraceRoot UI → Traces — filter for the `quickstart.root` trace.

## quickstart.ts

```typescript
import 'dotenv/config';
import { TraceRoot, observe } from '@traceroot-ai/traceroot';

// Reads TRACEROOT_API_KEY from env automatically.
// instrumentModules: {} disables auto-instrumentation — this demo only uses manual spans.
TraceRoot.initialize({ instrumentModules: {} });

async function step() {
  return await observe({ name: 'quickstart.step', type: 'span' }, async () => {
    return { answer: 42 };
  });
}

async function main() {
  return await observe({ name: 'quickstart.root', type: 'agent' }, async () => {
    return { result: await step() };
  });
}

await main();
await TraceRoot.flush(); // required in short-lived scripts
```

## Notes

- `await TraceRoot.flush()` is required at the end of scripts — without it, spans may not be exported before the process exits.
- `instrumentModules: {}` disables auto-instrumentation; this demo only uses manual `observe()` spans.
- `observe()` is a function wrapper (not a decorator): pass options and an async callback.
- To target a self-hosted instance, set `TRACEROOT_HOST_URL` in `.env`.
