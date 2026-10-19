// Gate — the header's icon theme switch (ThemeSwitch.astro), against dist/.
//
// Narrow on purpose: one page, the behaviours the component promises and
// nothing the axe/visual gates already cover.
//   1. With no stored choice, the icon follows the system (moon in light, sun
//      in dark) and the accessible name says what a press will do.
//   2. A press flips data-theme, stores it under tt-theme, swaps the icon and
//      the name, and the footer radiogroup repaints to match.
//   3. The footer toggle drives the header switch the other way round.
//   4. The choice survives a reload.
//   5. Hidden at ≤359px, where the nav has no room; visible at 360px.
import puppeteer from 'puppeteer-core';
import { start } from '../serve.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4326;
const URL = `http://localhost:${PORT}/`;

const server = await start(PORT);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures++;
}

// Read everything a check needs in one round trip.
const state = (page) =>
  page.evaluate(() => {
    const sw = document.querySelector('.nav [data-theme-switch]');
    const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('tt-theme'),
      label: sw?.getAttribute('aria-label') ?? null,
      switchShown: shown(sw),
      moon: shown(sw?.querySelector('.tswitch__moon')),
      sun: shown(sw?.querySelector('.tswitch__sun')),
      footerChecked:
        document.querySelector('[data-theme-set][aria-checked="true"]')?.dataset.themeSet ?? null,
    };
  });

async function fresh(scheme, width = 1280) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  return page;
}

try {
  // 1. No stored choice: follow the system.
  for (const [scheme, icon, next] of [
    ['light', 'moon', 'dark'],
    ['dark', 'sun', 'light'],
  ]) {
    const page = await fresh(scheme);
    const s = await state(page);
    check(`${scheme} system, no choice: switch is in the header`, s.switchShown);
    check(
      `${scheme} system, no choice: shows the ${icon} only`,
      icon === 'moon' ? s.moon && !s.sun : s.sun && !s.moon,
      JSON.stringify(s)
    );
    check(
      `${scheme} system, no choice: labelled "Switch to ${next} theme"`,
      s.label === `Switch to ${next} theme`,
      s.label
    );
    await page.close();
  }

  // 2 + 4. Press it, then reload.
  {
    const page = await fresh('light');
    await page.click('.nav [data-theme-switch]');
    let s = await state(page);
    check('press: data-theme becomes dark', s.theme === 'dark', s.theme);
    check('press: stored under tt-theme', s.stored === 'dark', s.stored);
    check('press: sun shown, moon hidden', s.sun && !s.moon, JSON.stringify(s));
    check('press: label flips to light', s.label === 'Switch to light theme', s.label);
    check('press: footer radiogroup follows', s.footerChecked === 'dark', s.footerChecked);

    await page.reload({ waitUntil: 'networkidle0' });
    s = await state(page);
    check('reload: dark choice kept over a light system', s.theme === 'dark' && s.sun, JSON.stringify(s));

    await page.click('.nav [data-theme-switch]');
    s = await state(page);
    check('second press: back to light', s.theme === 'light' && s.stored === 'light' && s.moon, JSON.stringify(s));
    await page.close();
  }

  // 3. The footer drives the header.
  {
    const page = await fresh('light');
    await page.click('[data-theme-set="dark"]');
    let s = await state(page);
    check('footer Dark: header shows the sun', s.sun && !s.moon, JSON.stringify(s));
    check('footer Dark: header label flips', s.label === 'Switch to light theme', s.label);
    await page.click('[data-theme-set="light"]');
    s = await state(page);
    check('footer Light: header back to the moon', s.moon && s.label === 'Switch to dark theme', JSON.stringify(s));
    await page.close();
  }

  // 5. Narrow phones.
  for (const [width, want] of [
    [359, false],
    [360, true],
  ]) {
    const page = await fresh('light', width);
    const s = await state(page);
    check(`${width}px: switch ${want ? 'visible' : 'hidden'}`, s.switchShown === want, JSON.stringify(s));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures) {
  console.error(`\ntheme-switch: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\ntheme-switch: all checks pass');
