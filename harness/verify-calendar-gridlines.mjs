/** Production dark-calendar regression. Uses only fictional local HTML. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { introductionFixtureHtml } from './workspace-fixture.mjs';
import { nativeLayeredCalendarMarkup } from './calendar-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '../../outputs/calendar-gridlines');
const css = await readFile(resolve(root, 'dist/injected.css'), 'utf8');
const js = await readFile(resolve(root, 'dist/content.js'), 'utf8');
const url = 'https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx';
const widths = process.env.BETTER_MYUCLA_CALENDAR_WIDTHS?.split(',').map(Number) || [2048, 1440, 1280, 960, 390];
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const appearanceKey = 'plannerLift.appearance.v1';
const reports = [];
await mkdir(output, { recursive: true });

function fixture() {
  const dom = new JSDOM(introductionFixtureHtml(5, true)), doc = dom.window.document;
  const native = nativeLayeredCalendarMarkup(), grid = doc.getElementById('gridDiv');
  grid.innerHTML = native.html;
  grid.prepend(doc.querySelector('.plannerMenuLinks'));
  const style = doc.createElement('style'); style.textContent = native.css; doc.head.append(style);
  return dom.serialize();
}

async function geometry(page) {
  return page.evaluate(() => [...document.querySelectorAll('#ctl00_MainContent_weekGrid :is(.hourbox,.timebox,.planneritembox)')].map(node => {
    const box = node.getBoundingClientRect(), parent = node.parentElement.getBoundingClientRect(), style = getComputedStyle(node);
    return { type: node.className, x: box.x - parent.x, y: box.y - parent.y, width: box.width, height: box.height,
      inline: node.getAttribute('style'), borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      ...(node.classList.contains('planneritembox') ? { background: style.backgroundColor, borderColors: style.borderColor } : {}) };
  }));
}

async function identity(page) {
  assert.deepEqual(await page.evaluate(() => ({
    controls: fixtureNative.every(({ node, parent, form, handler }) => node.isConnected && node.parentElement === parent && node.form === form && node.getAttribute('onclick') === handler),
    meetings: fixtureMeetings.every(({ node, parent, inline }) => node.isConnected && node.parentElement === parent && node.getAttribute('style') === inline),
    navigation: fixtureNavigation.node.outerHTML === fixtureNavigation.html,
    submits: fixtureSubmits,
  })), { controls: true, meetings: true, navigation: true, submits: 0 });
}

// Sample the actual painted rule under an empty weekday column. Computed border
// color alone would pass even when a later opaque day column paints over it.
async function linePixels(page) {
  const row = page.locator('#ctl00_MainContent_weekGrid .hourbox').nth(5);
  await row.scrollIntoViewIfNeeded(); await frame(page);
  const sample = await row.evaluate(node => {
    const row = node.getBoundingClientRect(), day = node.parentElement.querySelectorAll('.timebox')[2].getBoundingClientRect();
    const channels = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    return { x: Math.floor(day.x + day.width / 2), y: Math.floor(row.y) - 2,
      line: channels(getComputedStyle(node).borderTopColor), background: channels(getComputedStyle(node).backgroundColor) };
  });
  assert.ok(sample.x >= 0 && sample.y >= 0, 'hour-line sample is in the visible local pane');
  const png = await page.screenshot({ clip: { x: sample.x, y: sample.y, width: 1, height: 7 } });
  const pixels = await page.evaluate(async encoded => {
    const picture = new Image(); picture.src = `data:image/png;base64,${encoded}`; await picture.decode();
    const canvas = document.createElement('canvas'); canvas.width = picture.width; canvas.height = picture.height;
    const context = canvas.getContext('2d'); context.drawImage(picture, 0, 0);
    const data = context.getImageData(0, 0, 1, picture.height).data;
    return Array.from({ length: picture.height }, (_, index) => [...data.slice(index * 4, index * 4 + 3)]);
  }, png.toString('base64'));
  const matches = (actual, expected) => actual.every((value, index) => Math.abs(value - expected[index]) <= 2);
  return { ...sample, pixels, visible: pixels.some(pixel => matches(pixel, sample.line)), surface: pixels.some(pixel => matches(pixel, sample.background)) };
}

async function setAppearance(page, appearance) {
  await page.evaluate(({ key, appearance }) => fixturePreference(key, appearance), { key: appearanceKey, appearance });
  await page.waitForFunction(appearance => document.documentElement.dataset.plAppearance === appearance, appearance);
  await frame(page);
}

const browser = await chromium.launch({ executablePath: process.env.BETTER_MYUCLA_CHROMIUM || undefined });
try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'light' });
    page.setDefaultTimeout(8000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === url
      ? route.fulfill({ status: 200, contentType: 'text/html', body: fixture() })
      : (requests.push(route.request().url()), route.abort()));
    try {
      await page.goto(url);
      await page.evaluate(() => {
        const stored = { 'plannerLift.layout.v1': { tidy: true }, 'plannerLift.header.v1': { compact: true }, 'plannerLift.appearance.v1': 'light' }, listeners = [];
        window.chrome = { storage: { local: { get: async key => ({ [key]: stored[key] }), set: async values => Object.assign(stored, values), remove: async key => delete stored[key] },
          onChanged: { addListener: listener => listeners.push(listener), removeListener: listener => { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); } } } };
        window.fixturePreference = (key, value) => { stored[key] = value; listeners.slice().forEach(listener => listener({ [key]: { newValue: value } }, 'local')); };
        window.fixtureSubmits = 0;
        document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); fixtureSubmits++; });
        const navigation = document.getElementById('fixture-native-navigation');
        window.fixtureNavigation = { node: navigation, html: navigation.outerHTML };
      });
      await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
      await page.waitForSelector('.pl-workspace-deck');
      await page.locator('.pl-workspace-nav [data-pl-module="schedule"]').click(); await frame(page);
      await page.evaluate(() => {
        window.fixtureNative = [...document.querySelectorAll('.classPlanner_CalendarSection :is(input,select,button,a)')].filter(node => !node.closest('[data-planner-lift-owned]'))
          .map(node => ({ node, parent: node.parentElement, form: node.form, handler: node.getAttribute('onclick') }));
        window.fixtureCaptureMeetings = () => { window.fixtureMeetings = [...document.querySelectorAll('#gridDiv .planneritembox')].map(node => ({ node, parent: node.parentElement, inline: node.getAttribute('style') })); };
        fixtureCaptureMeetings();
      });
      const light = await geometry(page), lightLine = await linePixels(page);
      assert.ok(lightLine.visible && lightLine.surface, 'native light grid has painted horizontal hour rules');
      await setAppearance(page, 'dark');
      assert.deepEqual(await geometry(page), light, 'dark mode preserves all row, column and meeting geometry and meeting colors');
      assert.deepEqual(await page.locator('#gridDiv .timebox').evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).backgroundColor))]), ['rgba(0, 0, 0, 0)'], 'full-height overlays stay transparent');
      const darkLine = await linePixels(page);
      assert.ok(darkLine.visible && darkLine.surface, `the horizontal rule is actually painted in dark mode: ${JSON.stringify(darkLine)}`);
      assert.notDeepEqual(darkLine.line, darkLine.background, 'hour boundary differs from the grid surface');

      // Prove this fixture detects the original failure, not merely the presence
      // of a border underneath a painted overlay.
      const oldOverlay = await page.addStyleTag({ content: 'html[data-pl-appearance="dark"] .pl-workspace-calendar #gridDiv .timebox { background-color:var(--pl-dark-surface) }' });
      assert.equal((await linePixels(page)).visible, false, 'the old opaque overlay reproduces missing hour rules');
      await oldOverlay.evaluate(node => node.remove());
      assert.equal((await linePixels(page)).visible, true, 'transparent overlay restores painted hour rules');
      await identity(page);
      await page.screenshot({ path: resolve(output, `gridlines-dark-${width}.png`) });

      // A native redraw can change hour spacing. Rebuild only the fictional grid
      // with a different native row height; the extension must not synthesize a
      // fixed repeating pattern or change native event duration/placement.
      const resized = nativeLayeredCalendarMarkup(60);
      await page.evaluate(html => {
        const wrapper = document.createElement('div'); wrapper.innerHTML = html;
        document.getElementById('ctl00_MainContent_weekGrid').replaceWith(wrapper.firstElementChild);
        fixtureCaptureMeetings();
      }, resized.html);
      await page.waitForFunction(() => document.querySelector('#gridDiv .planneritembox')?.dataset.plGrid === 'tidy'); await frame(page);
      const darkResized = await geometry(page);
      const resizedLine = await linePixels(page);
      assert.ok(resizedLine.visible && resizedLine.surface, 'native resized hour rules remain visible');
      await setAppearance(page, 'light');
      assert.deepEqual(await geometry(page), darkResized, 'native-redrawn geometry remains identical between light and dark');
      await setAppearance(page, 'dark');
      const resizedWidth = width >= 1280 ? width - 100 : width === 390 ? 430 : 850;
      await page.setViewportSize({ width: resizedWidth, height: 1000 }); await frame(page);
      assert.equal((await linePixels(page)).visible, true, 'hour rules remain visible after viewport resize');
      await page.setViewportSize({ width, height: 1000 }); await frame(page);
      await identity(page);

      await page.emulateMedia({ media: 'print' }); await frame(page);
      assert.equal(await page.locator('#gridDiv .hourbox').first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)', 'printing restores the light native grid');
      assert.equal(await page.locator('#gridDiv .timebox').first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
      await page.emulateMedia({ media: 'screen' }); await frame(page);
      await page.locator('.pl-workspace-original').click(); await page.waitForFunction(() => !document.querySelector('.pl-workspace-deck')); await frame(page);
      assert.notEqual(await page.locator('html').getAttribute('data-pl-appearance'), 'dark');
      assert.equal(await page.locator('#gridDiv .hourbox').first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)', 'Original layout restores native hour background');
      await identity(page);
      assert.deepEqual(errors, []); assert.deepEqual(requests, []);
      reports.push({ width, lightLine, darkLine, resizedLine, nativeIdentity: true, requests, errors });
      console.log(`PASS ${width}px: painted native hour rules, old-overlay failure reproduced, native resize, exact event geometry/colors, print and Original restore`);
    } catch (error) {
      await page.screenshot({ path: resolve(output, `failure-${width}.png`) }); throw error;
    } finally { await page.close(); }
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
