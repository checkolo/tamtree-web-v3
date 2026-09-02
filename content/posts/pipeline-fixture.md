---
title: Pipeline fixture
description: The fixture post that proves the Markdown pipeline end to end — directives, semantics and syntax highlighting all in one file.
publishDate: 2026-09-02
category: engineering
tags: [build, markdown]
author: dilhan
draft: true
---

This post exists to exercise every mechanism the pipeline is supposed to have.
It is a draft, so it never reaches production; `gate:directives` reads it in
dev to prove each directive still resolves to its element.

:::note
A callout wraps an `aside`, so an extractor that strips unknown elements still
finds a semantic block rather than a bare paragraph.
:::

:::steps
1. Parse the Markdown with Sätteri, directives on.
2. Resolve each directive to its custom element.
3. Fail the build on any name the vocabulary does not contain.
:::

:::ledger
| Step | Status | Duration |
|---|---|---|
| plan | ok | [pending] |
| draft | ok | [pending] |
| review | paused | [pending] |

:::

::stat{value="677 ms" label="500 posts, markdown pipeline only"}

A fenced block, to prove Expressive Code actually ran under Sätteri:

```js
export function ttDirectives() {
  return { name: 'tt-directives', options: { position: true } };
}
```

:::warn
Figures describing a run are bracketed until a recorded fixture exists. That is
contract C5 working, not a gap in the copy.
:::
