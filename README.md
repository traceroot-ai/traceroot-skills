# TraceRoot Skills

Skills for TraceRoot: quickstart demo and codebase instrumentation.

## Install

```bash
npx skills add traceroot-ai/traceroot-skills --skill traceroot-quickstart
npx skills add traceroot-ai/traceroot-skills --skill traceroot-instrument-repo
```

## Prompts

- "Set up TraceRoot in my project and show me a trace."
- "Instrument this application with TraceRoot tracing following best practices."

## Prerequisites

You need a TraceRoot account ([cloud](https://app.traceroot.ai) or self-hosted) and an API key:

```bash
export TRACEROOT_API_KEY=your-api-key
# For self-hosted instances:
export TRACEROOT_HOST_URL=https://your-instance.example.com
```

API keys are found in your TraceRoot project under **Settings > API Keys**.
