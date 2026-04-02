# TraceRoot Skills

Skills for TraceRoot: quickstart demo and codebase instrumentation.

## Install

```bash
npx skills add traceroot-ai/traceroot-skills --skill traceroot-quickstart
npx skills add traceroot-ai/traceroot-skills --skill traceroot-instrument-repo
```

## Example prompts

- "Set up TraceRoot in my project and show me a trace."
- "Instrument this application with TraceRoot tracing following best practices."

## Prerequisites

You need a TraceRoot account and an API key:

```bash
export TRACEROOT_API_KEY=your-api-key
```

Find your API key in the TraceRoot UI under **Project Settings > API Keys**.

To target a self-hosted instance, also set:

```bash
export TRACEROOT_HOST_URL=https://your-instance.example.com
```

## Contents

- `skills/traceroot-quickstart/SKILL.md`
- `skills/traceroot-quickstart/references/python-quickstart.md`
- `skills/traceroot-instrument-repo/SKILL.md`
- `skills/traceroot-instrument-repo/references/python-instrument.md`
