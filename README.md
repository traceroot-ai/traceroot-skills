# TraceRoot Skills

Skills for adding [TraceRoot](https://traceroot.ai) tracing to your application, for Python and TypeScript/Node.js.

## Which skill?

- **Add tracing to my app** → `traceroot-instrument-repo` — instruments an existing codebase: auto-instrumentation plus manual spans for agents, tools, and LLM calls.
- **Just show me a trace / verify my setup** → `traceroot-quickstart` — a minimal runnable demo that produces one trace in a couple of minutes.
- **Evaluate my LLM app** → `traceroot-eval` — offline evaluations: a dataset of cases, a task, and scorers (including LLM judges), run and reported to TraceRoot.

## Install

```bash
npx skills add traceroot-ai/traceroot-skills --skill traceroot-instrument-repo
npx skills add traceroot-ai/traceroot-skills --skill traceroot-quickstart
npx skills add traceroot-ai/traceroot-skills --skill traceroot-eval
```

Or point any coding agent (Claude Code, Codex, Cursor, …) at this repo:

> Install the TraceRoot AI skill from https://github.com/traceroot-ai/traceroot-skills and use it to add tracing to this application with TraceRoot following best practices.

## Prerequisites

A TraceRoot account ([cloud](https://app.traceroot.ai) or [self-hosted](https://traceroot.ai/docs/developer/self-hosting)) and an API key:

```bash
export TRACEROOT_API_KEY=your-api-key
export TRACEROOT_HOST_URL=https://app.traceroot.ai  # only when self-hosting
```

Find your API key in the TraceRoot UI under project settings.
