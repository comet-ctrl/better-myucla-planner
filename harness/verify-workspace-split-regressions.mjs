/** Production split/drop regressions. Fictional HTML only; no live account. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { introductionFixtureHtml } from './workspace-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '../../outputs/workspace-split-regressions');
const css = await readFile(resolve(root, 'dist/injected.css'), 'utf8');
const js = await readFile(resolve(root, 'dist/content.js'), 'utf8');
const url = 'https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx';
const key = 'plannerLift.workspace.v2';
const ids = ['classes', 'find', 'optimizer', 'study', 'personal', 'schedule'];
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const tab = (page, id) => page.locator(`[data-pl-tab="${id}"]`);
const panel = (page, id) => page.locator(id === 'find' ? '.pl-workspace-search' : '.pl-workspace-plan');
const reports = [];

function savedLayout(dock, swap = false) {
  const panels = Object.fromEntries(ids.map(id => [id, { placement: swap && id === 'find' ? (dock === 'left' ? 'right' : 'left') : dock, open: ['classes', 'find'].includes(id) }]));
  return { version: 2, groups: { version: 1, order: ids, panels, active: { main: null, left: null, right: null, [dock]: 'classes', ...(swap ? { [panels.find.placement]: 'find' } : {}) } },
    panels: ids.map(id => ({ id, placement: panels[id].placement, hidden: !panels[id].open })), module: 'classes', mainModule: 'classes',
    navigationCollapsed: false, scheduleWidth: null, scheduleExpanded: false, dockSizes: {}, collapsedPanes: [] };
}

async function open(browser, width, saved, dark = false) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(7000);
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === url
    ? route.fulfill({ status: 200, contentType: 'text/html', body: introductionFixtureHtml(4, true, 4) })
    : (requests.push(route.request().url()), route.abort()));
  await page.goto(url);
  await page.evaluate(({ key, saved, dark }) => {
    const stored = { 'plannerLift.layout.v1': { tidy: true }, 'plannerLift.header.v1': { compact: true }, 'plannerLift.appearance.v1': dark ? 'dark' : 'light', [key]: saved };
    window.fixtureStored = stored; window.fixtureSubmits = []; window.fixtureCalls = [];
    window.chrome = { storage: { local: { get: async key => ({ [key]: structuredClone(stored[key]) }), set: async value => Object.assign(stored, structuredClone(value)), remove: async key => delete stored[key] }, onChanged: { addListener() {}, removeListener() {} } } };
    document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); window.fixtureSubmits.push(event.submitter?.id || 'implicit'); });
    window.__doPostBack = (...args) => window.fixtureCalls.push(args);
    window.fixtureControls = [...document.querySelectorAll('.classPlannerWrapper input,.classPlannerWrapper select,.classPlannerWrapper button,.classPlannerWrapper a')].map(node => ({ node, parent: node.parentElement, form: node.form, onclick: node.getAttribute('onclick') }));
  }, { key, saved, dark });
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  await page.waitForSelector('.pl-workspace-group-strip:visible'); await frame(page);
  return { page, errors, requests };
}

async function identity(page) {
  const result = await page.evaluate(() => ({
    controls: window.fixtureControls.every(({ node, parent, form, onclick }) => node.isConnected && node.form === form && node.getAttribute('onclick') === onclick && (node.parentElement === parent || (node.id === 'ctl00_MainContent_cs_goButton' && node.parentElement?.matches('span.pl-search-submit') && node.parentElement.parentElement === parent))),
    forms: document.querySelectorAll('form').length, submits: window.fixtureSubmits, calls: window.fixtureCalls,
  }));
  assert.deepEqual(result, { controls: true, forms: 1, submits: [], calls: [] }, 'dragging preserves every native control and never invokes native actions');
}

async function hover(page, point) {
  await page.mouse.move(point.x, point.y, { steps: 8 }); await frame(page);
  const preview = page.locator('.pl-panel-drop-preview:visible');
  if (!await preview.count()) return null;
  return { kind: await preview.getAttribute('data-pl-drop-operation'), dock: await preview.getAttribute('data-pl-dock-target'), label: await preview.textContent(), box: await preview.boundingBox() };
}

async function start(page) {
  const box = await tab(page, 'find').boundingBox(); assert.ok(box, 'Find supplies a visible tab');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
}

async function check(browser, config) {
  const { width, dock, side, swap = false, offset = 20, strip = false, narrow = false, dark = false } = config;
  const name = `${width}-${swap ? 'swap-' : ''}${dock}-to-${side}-${strip ? 'strip' : offset}${dark ? '-dark' : ''}`;
  const report = { ...config, name, passed: false }; reports.push(report);
  const { page, errors, requests } = await open(browser, width, savedLayout(dock, swap), dark);
  try {
    const before = await page.evaluate(key => structuredClone(window.fixtureStored[key]), key);
    const deck = await page.locator('.pl-workspace-deck').boundingBox();
    const point = { x: side === 'left' ? deck.x + offset : deck.x + deck.width - offset, y: deck.y + (strip ? 20 : deck.height / 2) };
    await start(page);
    // Approach from outside the edge band, rather than inheriting a sticky split.
    await hover(page, { x: deck.x + deck.width / 2, y: deck.y + deck.height / 2 });
    const preview = await hover(page, point); report.preview = preview;
    report.source = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('[data-pl-tab]')].filter(node => node.getClientRects().length).map(node => ({ id: node.dataset.plTab, selected: node.getAttribute('aria-selected') })),
      floating: document.querySelector('.pl-workspace-search').classList.contains('pl-panel-dragging'),
    }));
    if (!swap) assert.equal(report.source.tabs.find(tab => tab.id === 'classes')?.selected, 'true', 'the remaining source tab stays selected during a drag');
    assert.deepEqual(await page.evaluate(key => window.fixtureStored[key], key), before, 'a held drag cannot persist transient group changes');
    await identity(page);
    await page.screenshot({ path: resolve(output, `${name}-preview.png`) });
    // Cancel first, then repeat the gesture and check the committed shape.
    await page.keyboard.press('Escape'); await page.mouse.up(); await frame(page);
    assert.deepEqual(await page.evaluate(key => window.fixtureStored[key], key), before, 'Escape restores the saved group membership and active tabs');
    assert.equal(await panel(page, 'find').getAttribute('data-pl-panel-placement'), before.groups.panels.find.placement);
    await start(page); await hover(page, { x: deck.x + deck.width / 2, y: deck.y + deck.height / 2 });
    const commitPreview = await hover(page, point);
    await page.mouse.up(); await frame(page);
    report.after = await page.evaluate(key => structuredClone(window.fixtureStored[key].groups), key);
    report.actual = await panel(page, 'find').boundingBox();
    await identity(page);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    assert.equal(preview?.kind, strip || narrow ? 'merge' : 'split', `${name}: visible target must describe the requested ${strip ? 'tab insertion' : narrow ? 'narrow-screen grouping' : 'edge split'}`);
    assert.equal(preview?.label, strip || narrow ? 'Group tabs' : `Split ${side}`, 'the visible preview explains the resulting operation');
    assert.equal(commitPreview?.kind, preview?.kind, 'the same pointer location advertises the same operation');
    const actual = report.actual, advertised = commitPreview.box;
    assert.ok(actual && ['x', 'width'].every(key => Math.abs(actual[key] - advertised[key]) <= 2)
      && Math.abs(actual.y - advertised.y - 40) <= 2 && Math.abs(actual.height - advertised.height + 40) <= 2,
      `advertised preview matches the resulting pane including its 40px strip: ${JSON.stringify({ advertised, actual })}`);
    if (strip || narrow) {
      assert.equal(report.after.panels.find.placement, report.after.panels.classes.placement, 'strip and narrow-screen drops group tabs without splitting');
    } else {
      assert.notEqual(report.after.panels.find.placement, report.after.panels.classes.placement, 'edge drop produces two distinct groups');
      const classes = await panel(page, 'classes').boundingBox();
      assert.ok(classes, 'the remaining source tab stays visible after splitting');
      assert.ok(side === 'left' ? actual.x < classes.x : actual.x > classes.x, 'the dragged tab occupies the indicated physical side');
      assert.equal(await tab(page, 'classes').getAttribute('aria-selected'), 'true', 'remaining source tab is active');
      assert.equal(await tab(page, 'find').getAttribute('aria-selected'), 'true', 'moved tab is active in its destination group');
    }
    report.passed = true;
  } catch (error) { report.error = error.message; }
  finally { await page.close(); }
}

const browser = await chromium.launch({ executablePath: process.env.BETTER_MYUCLA_CHROMIUM || undefined });
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 2048]) {
    for (const dock of ['main', 'left', 'right']) for (const side of ['left', 'right']) {
      await check(browser, { width, dock, side, offset: 20 });
      await check(browser, { width, dock, side, offset: 120 });
    }
    for (const side of ['left', 'right']) {
      await check(browser, { width, dock: 'main', side, strip: true });
      await check(browser, { width, dock: side, side, swap: true });
      await check(browser, { width, dock: 'main', side, offset: -8 });
    }
  }
  for (const side of ['left', 'right']) await check(browser, { width: 1024, dock: 'main', side, narrow: true });
  await check(browser, { width: 1440, dock: 'left', side: 'left', offset: 120, dark: true });
} finally {
  await browser.close(); await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
}
const failed = reports.filter(report => !report.passed);
console.log(`${reports.length - failed.length}/${reports.length} tab-splitting regressions passed.`);
for (const report of failed) console.log(`FAIL ${report.name}: ${report.error}`);
assert.equal(failed.length, 0, 'tab splitting, target hit areas, cancellation and preview/commit must agree');
