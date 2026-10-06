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

## Manifest

`skills/manifest.json` is the index of the skills in this repository. Each entry names the skill's
directory under `skills/`, a one-line description, short "best for" tags, and whether the TraceRoot
CLI bundles it:

```json
{
  "name": "traceroot-quickstart",
  "description": "Minimal runnable demo that produces one TraceRoot trace.",
  "bestFor": ["verifying API keys", "seeing TraceRoot quickly"],
  "bundledWithCli": true
}
```

All four fields are required. `npm run check:manifest` enforces that, and that every entry names a
directory under `skills/` and every such directory has exactly one entry; CI runs it on every pull
request.

## How consumers get the text

This repository is not an installable package — `package.json` is private and exists only to host
the check above. What it is instead is the single source for every skill's text: a consumer takes a
copy pinned to a commit here rather than resolving a version range.

The [TraceRoot CLI](https://github.com/traceroot-ai/traceroot-cli) does exactly that. It vendors
every skill whose `bundledWithCli` is `true`, recording the commit it copied from and a SHA-256
per file, and its own CI re-hashes the copy on every pull request — so a hand-edit to the vendored
tree fails there instead of shipping. Moving to newer skill text is a deliberate change to that
recorded commit.

So edit skills here. A copy that disagrees with this repository is a bug in the copy.
