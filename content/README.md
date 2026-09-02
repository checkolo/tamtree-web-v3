# tamtree-blog-content

Markdown only. No Node, no build step, nothing to install.

- `posts/<slug>.md` — one file per post. Frontmatter fields are listed below.
- `authors/<id>.md` — one file per author; `author:` in a post references the filename.

## Post frontmatter

| Field | Required | Notes |
|---|---|---|
| `title` | yes | ≤ 120 characters |
| `description` | yes | 40–300 characters; used in `llms.txt` and the OG card |
| `publishDate` | yes | `YYYY-MM-DD` |
| `updatedDate` | no | `YYYY-MM-DD` |
| `category` | yes | |
| `tags` | no | list of strings |
| `author` | yes | an id from `authors/` |
| `draft` | no | `true` hides it from production, keeps it visible in `pnpm dev` |
| `featured` | no | |

## The directive vocabulary

Blocks beyond plain Markdown are written as directives. The vocabulary is
**closed** — an unknown name fails the build with a line number rather than
vanishing silently from the page.

```
:::note / :::warn / :::tip   a callout
:::aside                     a digression
:::steps                     wraps ONE ordered/unordered Markdown list
:::ledger                    wraps ONE Markdown table
:::run{src="…"} / :::compare wraps ONE Markdown table
::dag{src="…"}               a diagram, from a recorded run fixture
::stat{value="…" label="…"}  a single figure
::terminal{src="…"}          a recorded session
```

Every directive must also read correctly as plain text — the `.md` is the
artifact and the site is a rendering of it, so a block that only makes sense
once styled is a block written wrong.

**No figure describing a Tamtree run may be hand-typed.** Costs, durations and
token counts come from a recorded run fixture, or they are bracketed as
placeholders.
