# Search quality eval

`cases.json` is the answer key for "does search feel right". Each case:

```json
{"query": "trash can", "expect": ["trash-2"], "top": 1}
```

- `query` — what a user would type.
- `expect` — icon names (kebab-case); **at least one** must rank within the top `top`
  results. An empty list means the query must return nothing.
- `top` — 1-based rank cutoff, defaults to 3.

Cases run against a small lucide fixture (`fixture.ts`) that mirrors real packaging
(including the deprecated `kanban-square-dashed` alias), with the real
`synonyms.json` baked in — so synonym additions and ranking changes are both
measurable here.

**When to add a case:** any time a real query misbehaves — a user report, a synonym
you add, a ranking tweak. Write the case first (it should fail), then fix.

**When a case fails after a deliberate change:** update the case, like any other
test. The suite gates CI; the `reports the eval score` test prints the tally
(e.g. `search eval: 15/16 cases pass`) with per-case failures.
