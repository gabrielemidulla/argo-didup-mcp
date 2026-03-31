---
name: do-not-reinvent-the-wheel
description: >-
  Prefer existing libraries over hand-rolled implementations when writing or
  reviewing code. Use when implementing new features, reviewing pull requests,
  refactoring code, or whenever a task could be solved by a well-maintained
  open-source package instead of custom code.
license: MIT
metadata:
  author: gabrielemidulla
  version: "1.0.0"
  homepage: https://github.com/gabrielemidulla/pragmatic
---

# Do Not Reinvent the Wheel

## Core Principle

Before writing custom logic, check whether a well-maintained library already solves the problem. Using battle-tested packages leads to cleaner, more minimal code with fewer bugs, better edge-case handling, and lower maintenance burden.

## When Writing Code

1. **Pause before implementing**: If the task involves a common problem (date handling, validation, HTTP retries, deep merging, cron parsing, CSV/Excel generation, etc.), assume a library exists.
2. **Pick the right library**: Prefer packages that are actively maintained, widely adopted, and small in scope. A focused library beats a kitchen-sink framework.
3. **Add it as a dependency**: Use the project's package manager to install the latest version (`pnpm add <package>`). Do not manually copy library code.
4. **Search when unsure**: If you don't know a library that solves the task, **spawn a sub-agent to perform a web search** for one before writing custom code. Search for terms like `"npm <problem domain>"` or `"best node.js library for <task>"`.

## When Reviewing Code

Flag custom implementations that duplicate what a library already provides. Suggest the library alternative with a brief rationale (maintenance, edge cases, community support).

## Common Substitutions

| Instead of writing...                | Use                                    |
| ------------------------------------ | -------------------------------------- |
| Custom date arithmetic               | `date-fns` or `dayjs`                  |
| Hand-rolled schema validation        | `zod`, `valibot`, or `yup`             |
| Manual deep clone / deep merge       | `lodash-es` (cherry-pick), `deepmerge` |
| Custom retry / backoff logic         | `p-retry`, `async-retry`               |
| DIY cron expression parsing          | `cron-parser`, `croner`                |
| Regex-heavy email/URL validation     | `validator`                            |
| Manual CSV/Excel generation          | `papaparse`, `exceljs`                 |
| Custom slugify                       | `slugify`                              |
| Hand-rolled HTTP client wrappers     | `ky`, `got`, `ofetch`                  |
| Custom queue / job scheduling        | `bullmq`, `bee-queue`                  |
| Manual string template interpolation | `handlebars`, `mustache`, `eta`        |

This table is illustrative, not exhaustive. The principle applies broadly.

## Decision Checklist

Before writing custom code, answer:

- [ ] Is this a problem someone else has already solved well?
- [ ] Would a library handle edge cases I might miss?
- [ ] Will custom code create maintenance burden for the team?
- [ ] Is the library lightweight enough to justify the dependency?

If the first three are **yes** and the last is **yes**, use the library.

## When Custom Code Is Fine

- The problem is highly specific to the domain and no library fits.
- The library would be a disproportionately heavy dependency for a trivial task (e.g., pulling in a full utility library for a single three-line function).
- Security-sensitive code that must be fully audited and owned.
