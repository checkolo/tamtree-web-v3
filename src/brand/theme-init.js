/**
 * Pre-paint theme resolution. This is inlined into <head> BEFORE any
 * stylesheet, and it must stay tiny and synchronous — that is the whole
 * mechanism. Deferred, bundled or moved below the CSS, it stops preventing the
 * flash and becomes decoration.
 *
 * It writes `data-theme` only for an EXPLICIT choice. With no stored choice the
 * attribute is absent and `prefers-color-scheme` decides in CSS, which is why
 * tokens.css guards its media block with `:root:not([data-theme="light"])`.
 */
(function () {
  try {
    var stored = localStorage.getItem('tt-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {
    /* Private mode, or site data blocked. The media query still resolves, so
       the page is correct — just not remembered. Never let this throw: it runs
       before anything is painted. */
  }
})();
