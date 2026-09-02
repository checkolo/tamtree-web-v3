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

  aside: { kind: 'container', element: 'tt-aside', wrap: 'aside' },

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

  // Leaf directives have no block content to keep semantic — the element is
  // rendered wholly by its component in Phase 4, from its attributes.
  if (kind === 'leaf') {
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
    ctx.setProperty(node, 'data', { hName: spec.element, hProperties });
    return;
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
