/**
 * The directive resolver (contract C2).
 *
 * Maps the closed directive vocabulary onto custom elements at build time. Two
 * properties are mandatory and both ship here, in this file, rather than being
 * added later:
 *
 *  1. An unknown directive THROWS. With `features.directive` on, an unhandled
 *     `:::name` block is deleted from the output with no error — a typo does
 *     not look like a typo, it looks like a paragraph nobody wrote.
 *
 *  2. Every custom element WRAPS real semantic HTML rather than replacing it.
 *     `<tt-*>` carries no meaning to a crawler or an HTML-to-text extractor;
 *     the element inside it does. Where the author's own Markdown already
 *     produces the right semantic node (a list under `:::steps`, a table under
 *     `:::ledger`) that node is used as-is and `wrap` is null — wrapping it a
 *     second time would be the bug, not the fix.
 */

/** @typedef {'container' | 'leaf'} DirectiveKind */

/**
 * The closed vocabulary. Extended only deliberately — adding a name here is the
 * whole of adding a directive, and anything not here is a build failure.
 *
 * `wrap`   — inner semantic element, or null when the content already is one.
 * `expect` — mdast node type the content must be, when `wrap` is null.
 * `attrs`  — directive attributes copied onto the custom element.
 * `require`— attributes that must be present.
 */
const VOCABULARY = {
  note: { kind: 'container', element: 'tt-callout', wrap: 'aside', fixed: { kind: 'note' } },
  warn: { kind: 'container', element: 'tt-callout', wrap: 'aside', fixed: { kind: 'warn' } },
  tip: { kind: 'container', element: 'tt-callout', wrap: 'aside', fixed: { kind: 'tip' } },
  // A fourth severity, added 2026-09-03. `warn` is "this will bite you";
  // `error` is "this is broken". Collapsing the two costs the reader the
  // distinction that tells them whether to keep reading or stop and fix.
  error: { kind: 'container', element: 'tt-callout', wrap: 'aside', fixed: { kind: 'error' } },

  aside: { kind: 'container', element: 'tt-aside', wrap: 'aside' },

  // Cards, added 2026-09-03. `cards` is the grid and may contain nothing but
  // `card`s; a card is a self-contained composition, which is what <article>
  // means, and `title` becomes a real heading rather than a styled first line.
  cards: { kind: 'container', element: 'tt-cards', wrap: null, expect: 'cards' },
  card: {
    kind: 'container',
    element: 'tt-card',
    wrap: 'article',
    attrs: ['title', 'href', 'tone'],
    require: ['title'],
  },

  // A captioned image, added 2026-09-03. Plain `![alt](src)` already works and
  // stays the right way to drop a picture into a paragraph; what Markdown
  // cannot express is the *association* between a picture and its caption.
  // <figure>/<figcaption> is exactly that association, and it is the reason
  // this directive exists rather than a styled paragraph under the image.
  figure: { kind: 'container', element: 'tt-figure', wrap: 'figure', expect: 'figure' },

  // A button, added 2026-09-03 — and deliberately not a leaf directive.
  // ::button{href=… label=…} would put the destination and the words in
  // attributes, where the raw .md shows a reader machinery instead of a link.
  // C1 says the markdown IS the artifact, so a button is written as an ordinary
  // Markdown link and the directive only says "render this one loudly".
  button: { kind: 'container', element: 'tt-button', wrap: null, expect: 'paragraph' },

  steps: { kind: 'container', element: 'tt-steps', wrap: null, expect: 'list' },
  ledger: { kind: 'container', element: 'tt-ledger', wrap: null, expect: 'table' },

  run: { kind: 'container', element: 'tt-run', wrap: null, expect: 'table', attrs: ['src'] },
  compare: { kind: 'container', element: 'tt-compare', wrap: null, expect: 'table' },

  dag: { kind: 'leaf', element: 'tt-dag', attrs: ['src'], require: ['src'] },
  stat: { kind: 'leaf', element: 'tt-stat', attrs: ['value', 'label'], require: ['value', 'label'] },
  terminal: { kind: 'leaf', element: 'tt-terminal', attrs: ['src'], require: ['src'] },
};

/** Names that may legally appear, for the error message and for gate:directives. */
export const DIRECTIVE_NAMES = Object.freeze(Object.keys(VOCABULARY));

/** name → custom element, so gate:directives can assert the mapping held. */
export const DIRECTIVE_ELEMENTS = Object.freeze(
  Object.fromEntries(Object.entries(VOCABULARY).map(([name, d]) => [name, d.element]))
);

function where(node, ctx) {
  const line = node.position?.start?.line;
  const file = ctx.fileURL ? ctx.fileURL.pathname.replace(process.cwd(), '') : '<unknown file>';
  return line ? `${file}:${line}` : file;
}

function fail(node, ctx, message) {
  throw new Error(`[tt-directives] ${where(node, ctx)} — ${message}`);
}

function resolve(node, ctx, kind) {
  const spec = VOCABULARY[node.name];

  if (!spec) {
    fail(
      node,
      ctx,
      `unknown directive ":::${node.name}". The vocabulary is closed; known names are ` +
        `${DIRECTIVE_NAMES.join(', ')}. An unhandled directive is silently deleted from the ` +
        `output, so this is a build failure by design rather than a missing block you find later.`
    );
  }

  if (spec.kind !== kind) {
    const wanted = spec.kind === 'leaf' ? `::${node.name}{…}` : `:::${node.name} … :::`;
    fail(node, ctx, `":::${node.name}" is a ${spec.kind} directive — write it as ${wanted}.`);
  }

  const attributes = node.attributes ?? {};
  for (const key of spec.require ?? []) {
    if (!attributes[key]) {
      fail(node, ctx, `"${node.name}" requires the "${key}" attribute.`);
    }
  }

  const hProperties = { ...(spec.fixed ?? {}) };
  for (const key of spec.attrs ?? []) {
    if (attributes[key] != null) hProperties[key] = attributes[key];
  }

  if (kind === 'leaf') {
    ctx.setProperty(node, 'data', { hName: spec.element, hProperties });

    // `stat` is rendered here rather than by CSS. `content: attr(value)` would
    // paint the number without putting it in the document: it would be missing
    // from the .md-to-text extraction C4 depends on, from find-in-page, and
    // from a screen reader. The figure is the whole point of the block, so it
    // is real text — <strong> for the number, plain text for what it counts.
    if (node.name === 'stat') {
      ctx.setProperty(node, 'children', [
        { type: 'strong', children: [{ type: 'text', value: attributes.value }] },
        { type: 'text', value: ` ${attributes.label}` },
      ]);
    }
    return;
  }

  if (spec.expect === 'cards') {
    // A grid that can contain anything is not a grid, it is a div. Children are
    // checked whichever order the traversal reached them in: an unresolved card
    // is still a containerDirective named "card", a resolved one has already
    // become the <tt-card> wrapper.
    const children = node.children ?? [];
    const isCard = (c) =>
      (c.type === 'containerDirective' && c.name === 'card') || c.data?.hName === 'tt-card';

    // Two, not one — and the reason is a silent failure, not tidiness.
    // Directive fences nest by LENGTH: `:::cards` is closed by the first `:::`
    // it meets, which is the closing fence of the FIRST card. Everything after
    // that lands outside the grid and a stray ":::" renders as a paragraph.
    // The build stays green and the page quietly loses most of its cards.
    // A grid of one is never what an author meant, so requiring two turns that
    // exact mistake into a build failure that says what to do about it.
    if (children.length < 2) {
      fail(
        node,
        ctx,
        `"cards" holds ${children.length === 1 ? 'a single card' : 'nothing'}. A grid needs at ` +
          `least two — and if you wrote more than one, the outer fence is the problem: nested ` +
          `directives need a LONGER fence, so open the grid with "::::cards" and close it with ` +
          `"::::". With ":::cards" the first card's ":::" closes the grid and the rest of the ` +
          `cards fall outside it. For a single card, use ":::card" on its own.`
      );
    }
    const stray = children.find((c) => !isCard(c));
    if (stray) {
      fail(
        node,
        ctx,
        `"cards" may contain only ":::card" blocks — found a ${stray.type}. Prose between ` +
          `cards belongs above or below the grid, where it can be read in the .md too.`
      );
    }
    ctx.setProperty(node, 'data', { hName: spec.element, hProperties });
    return;
  }

  if (spec.wrap === null) {
    // The author's own Markdown is the semantic layer. Insist on it: a
    // `:::steps` that is not a list would render as a styled div and quietly
    // lose the enumeration that made it a step list.
    const children = node.children ?? [];
    const only = children.length === 1 ? children[0] : undefined;

    if (!only || only.type !== spec.expect) {
      // A Markdown table only ends at a blank line, so a closing `:::` written
      // directly under the last row is swallowed as table-adjacent content
      // instead of closing the block. It is by far the most likely way to
      // arrive here, and the raw message ("got 2 blocks") explains nothing.
      const last = children[children.length - 1];
      if (
        spec.expect === 'table' &&
        children[0]?.type === 'table' &&
        last?.type === 'paragraph' &&
        ctx.textContent(last).trim() === ':::'
      ) {
        fail(
          node,
          ctx,
          `"${node.name}" is not closed. A Markdown table runs until a blank line, so the ` +
            `closing ":::" written directly under the last row is read as part of the table ` +
            `rather than as the fence. Put a blank line between the last row and the ":::".`
        );
      }

      const got = only ? only.type : `${children.length} blocks`;
      fail(
        node,
        ctx,
        `"${node.name}" must contain exactly one Markdown ${spec.expect} — got ${got}. ` +
          `The custom element wraps real semantic HTML; it does not replace it.`
      );
    }

    // A button is one link, loudly. Anything else in the paragraph would be
    // painted as part of the control and lost to anyone reading the source.
    if (node.name === 'button') {
      const inline = (only.children ?? []).filter(
        (c) => !(c.type === 'text' && !c.value.trim())
      );
      if (inline.length !== 1 || inline[0].type !== 'link') {
        fail(
          node,
          ctx,
          `"button" must contain exactly one Markdown link and nothing else — write it as ` +
            `[Label](/destination/). It renders as a button; it stays a plain link in the .md, ` +
            `which is the artifact (C1).`
        );
      }

      // The link becomes the site's own button rather than a lookalike. Copying
      // .btn--primary's rules into prose.css would fork them: the next change to
      // the button forgets the copy, and — more concretely — gate:axe's excusal
      // of the white-on-ember label is written against `.btn--primary`, so a
      // lookalike would fail the gate for a colour pair the owner has already
      // decided on. One class, one source of truth, one exemption.
      const link = inline[0];
      ctx.setProperty(link, 'data', {
        ...(link.data ?? {}),
        hProperties: { className: ['btn', 'btn--primary'] },
      });
    }
    ctx.setProperty(node, 'data', { hName: spec.element, hProperties });
    return;
  }

  // A figure is an image and, optionally, the caption that belongs to it. The
  // image is hoisted out of its paragraph: <figure><p><img></p></figure> is
  // legal but puts a text block's margins around a picture, and the <p> carries
  // no meaning here — the <figure> is already the container.
  if (node.name === 'figure') {
    const children = node.children ?? [];
    const head = children[0];
    const inline =
      head?.type === 'paragraph'
        ? (head.children ?? []).filter((c) => !(c.type === 'text' && !c.value.trim()))
        : [];

    if (inline.length !== 1 || inline[0].type !== 'image') {
      fail(
        node,
        ctx,
        `"figure" must open with a single Markdown image — write it as ![Alt text](../images/…). ` +
          `Everything about the picture stays ordinary Markdown; the directive only says that ` +
          `the paragraph under it is its caption.`
      );
    }
    if (children.length > 2) {
      fail(
        node,
        ctx,
        `"figure" holds an image and at most one caption paragraph — got ${children.length} ` +
          `blocks. A caption that needs two paragraphs is prose, and prose belongs under the ` +
          `figure where it can be read in the .md as prose.`
      );
    }
    const caption = children[1];
    if (caption && caption.type !== 'paragraph') {
      fail(node, ctx, `"figure"'s caption must be a paragraph — got a ${caption.type}.`);
    }

    const parts = [inline[0]];
    if (caption) {
      // <figcaption> is the whole point: it is what ties the words to the
      // picture for a screen reader, which a styled paragraph underneath does
      // not do however small the type is.
      ctx.setProperty(caption, 'data', { ...(caption.data ?? {}), hName: 'figcaption' });
      parts.push(caption);
    }
    ctx.setProperty(node, 'children', parts);
  }

  // A card's title becomes a real heading inside the article, not a styled
  // first line and not a lone attribute on the custom element. An attribute is
  // invisible to the document outline and to anything that strips <tt-*>; a
  // heading is the thing that makes an <article> self-contained. h3 because a
  // card sits inside a post's h2 sections — see C3 on not skipping levels.
  if (node.name === 'card') {
    const label = { type: 'text', value: attributes.title };
    ctx.setProperty(node, 'children', [
      {
        type: 'heading',
        depth: 3,
        children: attributes.href
          ? [{ type: 'link', url: attributes.href, children: [label] }]
          : [label],
      },
      ...(node.children ?? []),
    ]);
    // The title is now in the document; leaving it duplicated in an attribute
    // would give an extractor two copies of it and gate:copy two hits.
    delete hProperties.title;
  }

  // Content is prose, so the semantic element is ours to add: the directive
  // itself becomes the inner element and the custom element wraps it.
  ctx.setProperty(node, 'data', { hName: spec.wrap, hProperties: {} });
  ctx.wrapNode(node, {
    type: 'ttElement',
    data: { hName: spec.element, hProperties },
    children: [],
  });
}

export function ttDirectives() {
  return {
    name: 'tt-directives',
    options: { position: true },

    containerDirective(node, ctx) {
      resolve(node, ctx, 'container');
    },

    leafDirective(node, ctx) {
      resolve(node, ctx, 'leaf');
    },

    /**
     * Alt text is not optional, and this is the only place it can be made
     * mandatory before the page exists.
     *
     * gate:axe reads the built HTML and would catch a missing `alt` attribute —
     * but `![](x.png)` emits `alt=""`, which is *valid* HTML meaning "this
     * picture is decorative, skip it". A blog image is never decorative, so the
     * gate sees nothing wrong and the reader on a screen reader gets silence.
     * The only moment the distinction is still visible is here, in the source,
     * where an empty alt is a person who did not write one.
     */
    image(node, ctx) {
      if (!node.alt || !node.alt.trim()) {
        fail(
          node,
          ctx,
          `image "${node.url}" has no alt text. Write what the picture shows — ` +
            `![The run ledger after a retry](../images/ledger.png). An empty alt is valid HTML ` +
            `that means "decorative, ignore me", so no gate downstream can tell it apart from ` +
            `one you meant.`
        );
      }
    },

    textDirective(node, ctx) {
      fail(
        node,
        ctx,
        `inline directive ":${node.name}" is not part of the vocabulary — every Tamtree ` +
          `directive is a block. Did you mean "::${node.name}{…}"?`
      );
    },
  };
}
