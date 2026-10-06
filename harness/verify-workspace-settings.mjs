/** Workspace Settings QA uses production assets and entirely fictional HTML. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { introductionFixtureHtml } from './workspace-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '../../outputs/workspace-settings');
const css = await readFile(resolve(root, 'dist/injected.css'), 'utf8');
const js = await readFile(resolve(root, 'dist/content.js'), 'utf8');
const url = 'https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx';
const key = 'plannerLift.workspace.v2';
const presets = ['single', 'balanced', 'browse-wide', 'schedule-wide', 'schedule-left'];
const widths = process.env.BETTER_MYUCLA_SETTINGS_WIDTHS?.split(',').map(Number) || [2048, 1440, 1280, 960, 390];
assert.ok(widths.every(width => Number.isInteger(width) && width >= 320 && width <= 3840));
const cases = widths.flatMap(width => (width >= 1440 ? ['light', 'dark'] : ['light']).map(appearance => ({ width, appearance })));
const selectors = { classes: '.pl-workspace-plan', find: '.pl-workspace-search', schedule: '.pl-workspace-calendar', optimizer: '.classPlanner_ClassOptimizerSection', study: '.classPlanner_EnrolledNotInPlanSection', personal: '.classPlanner_PersonalTimeBlocksSection' };
const reports = [];
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const dialog = page => page.locator('dialog.pl-workspace-settings-dialog');
const trigger = page => page.locator('button.pl-workspace-settings');
const close = page => dialog(page).getByRole('button', { name: 'Close settings', exact: true });
const nav = (page, id) => page.locator(`.pl-workspace-nav [data-pl-module="${id}"]`);
const stored = page => page.evaluate(() => structuredClone(window.fixtureStored));

async function open(browser, width, appearance, saved = {}) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 780 : 1000 }, colorScheme: appearance });
  page.setDefaultTimeout(7000);
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === url
    ? route.fulfill({ status: 200, contentType: 'text/html', body: introductionFixtureHtml(8, true, 8) })
    : (requests.push(route.request().url()), route.abort()));
  await page.goto(url);
  await page.evaluate(({ saved, appearance }) => {
    const listeners = new Set(), state = { 'plannerLift.layout.v1': { tidy: true }, 'plannerLift.header.v1': { compact: true }, 'plannerLift.appearance.v1': appearance, ...saved };
    window.fixtureStored = state; window.fixtureCalls = []; window.fixtureSubmits = []; window.fixtureWrites = [];
    window.chrome = { storage: { local: {
      get: async key => typeof key === 'string' ? { [key]: structuredClone(state[key]) } : structuredClone(state),
      set: async values => { window.fixtureWrites.push(structuredClone(values)); Object.assign(state, structuredClone(values)); },
      remove: async key => delete state[key],
    }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
    document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); window.fixtureSubmits.push(event.submitter?.id || 'implicit'); });
    window.__doPostBack = (...args) => window.fixtureCalls.push(args);
    window.fixtureNative = {
      controls: [...document.querySelectorAll('.classPlannerWrapper input,.classPlannerWrapper select,.classPlannerWrapper button,.classPlannerWrapper a')]
        .map(node => ({ node, parent: node.parentElement, form: node.form, handler: node.getAttribute('onclick') })),
      rows: [...document.querySelectorAll('tbody.courseItem > tr:nth-child(3)')].map(node => ({ node, parent: node.parentElement })),
      statuses: [...document.querySelectorAll('table.coursetable td:nth-child(3),.ClassSearchList .data_row>.span3')].map(node => ({ node, html: node.innerHTML })),
      navigation: document.getElementById('fixture-native-navigation'), navigationHtml: document.getElementById('fixture-native-navigation').outerHTML,
    };
  }, { saved, appearance });
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  await page.waitForSelector('.pl-workspace-group-strip:visible'); await frame(page);
  assert.equal(await page.locator('html').getAttribute('data-pl-appearance'), appearance);
  return { page, errors, requests };
}

async function identity(page) {
  const result = await page.evaluate(() => ({
    controls: fixtureNative.controls.every(({ node, parent, form, handler }) => node.isConnected && node.form === form && node.getAttribute('onclick') === handler && (node.parentElement === parent || (node.id === 'ctl00_MainContent_cs_goButton' && node.parentElement?.matches('span.pl-search-submit') && node.parentElement.parentElement === parent))),
    rows: fixtureNative.rows.every(({ node, parent }) => node.isConnected && node.parentElement === parent),
    statuses: fixtureNative.statuses.every(({ node, html }) => node.isConnected && node.innerHTML === html),
    navigation: fixtureNative.navigation.isConnected && fixtureNative.navigation.outerHTML === fixtureNative.navigationHtml,
    forms: document.querySelectorAll('form').length, calls: fixtureCalls, submissions: fixtureSubmits,
  }));
  assert.deepEqual(result, { controls: true, rows: true, statuses: true, navigation: true, forms: 1, calls: [], submissions: [] });
}

async function geometry(page, preset, width) {
  const result = await page.evaluate(selectors => {
    const visible = node => node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    const box = node => node.getBoundingClientRect().toJSON();
    return {
      deck: box(document.querySelector('.pl-workspace-deck')), overflow: document.documentElement.scrollWidth - innerWidth,
      panels: Object.entries(selectors).map(([id, selector]) => ({ id, node: document.querySelector(selector) })).filter(({ node }) => visible(node)).map(({ id, node }) => ({ id, box: box(node), placement: node.dataset.plPanelPlacement })),
      viewportHeight: innerHeight,
    };
  }, selectors);
  assert.ok(result.overflow <= 1, `no horizontal page overflow: ${JSON.stringify(result)}`);
  assert.ok(result.panels.length > 0 && result.panels.length <= 2, 'one or two groups are usable');
  for (const panel of result.panels) assert.ok(panel.box.x >= -1 && panel.box.right <= width + 1 && panel.box.bottom <= result.viewportHeight + 1 && panel.box.height > 80 && panel.box.width > 100, `panel stays usable in viewport: ${JSON.stringify(panel)}`);
  if (preset === 'single' || width < 1100 || result.deck.width < 992) {
    assert.equal(result.panels.length, 1, 'single/narrow presentation uses one active group');
    assert.ok(Math.abs(result.panels[0].box.width - result.deck.width) <= 2, 'single visible pane fills its deck');
  } else {
    assert.equal(result.panels.length, 2, 'readable desktop presets show both browsing and calendar');
    const browsing = result.panels.find(panel => panel.id === 'find'), schedule = result.panels.find(panel => panel.id === 'schedule');
    assert.ok(browsing && schedule, 'preset preserves the selected Find tab beside Schedule');
    assert.ok(browsing.box.width >= 560 - 1 && schedule.box.width >= 420 - 1, 'presets retain both readable minimum widths');
    assert.ok(Math.min(browsing.box.right, schedule.box.right) - Math.max(browsing.box.left, schedule.box.left) <= 1, 'active panels do not overlap');
    assert.equal(schedule.placement, preset === 'schedule-left' ? 'left' : 'right');
    assert.equal(browsing.placement, preset === 'schedule-left' ? 'right' : 'left');
    const ratio = { balanced: .5, 'browse-wide': .35, 'schedule-wide': .65, 'schedule-left': .4 }[preset];
    const available = result.deck.width - 12, expected = Math.max(420, Math.min(available - 560, available * ratio));
    assert.ok(Math.abs(schedule.box.width - expected) <= 2, `preset ratio clamps to readable widths: ${JSON.stringify({ preset, expected, actual: schedule.box.width })}`);
  }
  return result;
}

async function openSettings(page) {
  await trigger(page).click(); await dialog(page).waitFor({ state: 'visible' });
  assert.equal(await dialog(page).evaluate(node => node.matches(':modal')), true, 'Settings uses a modal dialog');
  assert.equal(await dialog(page).locator('[data-pl-layout-preset]').count(), 5);
}

async function focusReturned(page) {
  await frame(page); assert.equal(await dialog(page).isVisible(), false);
  assert.equal(await trigger(page).evaluate(node => node === document.activeElement), true, 'dismissal returns focus to Settings');
}

async function dialogKeyboard(page) {
  const focusables = dialog(page).locator('button:visible,select:visible,input:visible,a[href]:visible,[tabindex="0"]:visible');
  const first = focusables.first(), last = focusables.last();
  await last.focus(); await page.keyboard.press('Tab');
  assert.equal(await first.evaluate(node => node === document.activeElement), true, `Tab wraps inside Settings; actual focus ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 350))}`);
  await first.focus(); await page.keyboard.press('Shift+Tab');
  assert.equal(await last.evaluate(node => node === document.activeElement), true, 'Shift+Tab wraps inside Settings');
  await page.keyboard.press('Escape'); await focusReturned(page);
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BETTER_MYUCLA_CHROMIUM || undefined });
try {
  for (const { width, appearance } of cases) {
    const run = await open(browser, width, appearance), { page } = run;
    const caseReport = { width, appearance, presets: [] };
    try {
      await nav(page, 'find').click(); await frame(page);
      const selectedSection = page.locator('#container_course_M0 .data_row input').first();
      await selectedSection.check();
      const searchMode = page.locator('#ctl00_MainContent_cs_searchBy'), modeValue = await searchMode.inputValue();
      await openSettings(page); await dialogKeyboard(page);
      await openSettings(page);
      await page.emulateMedia({ media: 'print' });
      assert.equal(await dialog(page).isVisible(), false, 'print omits the open Settings dialog');
      assert.equal(await trigger(page).isVisible(), false, 'print omits the Settings trigger');
      await page.emulateMedia({ media: 'screen' }); await frame(page);
      assert.equal(await dialog(page).isVisible(), true, 'Settings remains usable after returning from print media');
      assert.equal(await dialog(page).evaluate(node => node.matches(':modal')), true);
      await identity(page);
      const dialogBox = await dialog(page).boundingBox(), viewport = page.viewportSize();
      assert.ok(dialogBox.x >= 0 && dialogBox.y >= 0 && dialogBox.x + dialogBox.width <= viewport.width + 1 && dialogBox.y + dialogBox.height <= viewport.height + 1, 'Settings fits viewport');
      await page.mouse.click(2, 2); await focusReturned(page);

      for (const preset of presets) {
        await openSettings(page);
        await dialog(page).locator(`[data-pl-layout-preset="${preset}"]`).click(); await frame(page);
        assert.equal(await dialog(page).isVisible(), true, 'applying a preset leaves Settings available');
        assert.equal(await dialog(page).locator(`[data-pl-layout-preset="${preset}"]`).getAttribute('aria-pressed'), 'true');
        assert.equal(await dialog(page).locator('[data-pl-layout-preset][aria-pressed="true"]').count(), 1);
        assert.ok((await dialog(page).locator('.pl-settings-status').textContent()).trim(), 'preset application announces its result');
        const saved = (await stored(page))[key];
        assert.equal(saved.layoutPreset, preset, 'only the recognized preset enum is persisted');
        assert.equal(saved.groups.active[preset === 'schedule-left' ? 'right' : preset === 'single' ? 'main' : 'left'], 'find', 'applying a preset keeps the active browse tab');
        for (const id of ['optimizer', 'study', 'personal']) assert.equal(saved.groups.panels[id].open, false, 'closed optional modules are not opened implicitly');
        if (preset === 'single') assert.ok(Object.values(saved.groups.panels).every(panel => panel.placement === 'main'), 'single preset groups every panel into main');
        else assert.equal(saved.groups.panels.schedule.open, true, 'split presets provide the calendar');
        await identity(page);
        assert.equal(await selectedSection.isChecked(), true, 'preset preserves native section selections');
        assert.equal(await searchMode.inputValue(), modeValue, 'preset preserves original search mode');
        if (preset === 'balanced') {
          await page.screenshot({ path: resolve(output, `settings-${width}-${appearance}.png`) });
          await dialog(page).screenshot({ path: resolve(output, `settings-dialog-${width}-${appearance}.png`) });
        }
        await close(page).click(); await focusReturned(page);
        const measured = await geometry(page, preset, width); caseReport.presets.push({ preset, geometry: measured });
        await page.screenshot({ path: resolve(output, `${preset}-${width}-${appearance}.png`) });
      }

      // Last preset keeps its ratio when the viewport changes and after a new
      // document reads the same local preference. Native values stay ephemeral.
      const resizedWidth = width >= 1440 ? width - 200 : width >= 960 ? 1024 : 430;
      await page.setViewportSize({ width: resizedWidth, height: width === 390 ? 780 : 1000 }); await frame(page);
      await geometry(page, 'schedule-left', resizedWidth); await identity(page);
      await page.setViewportSize({ width, height: width === 390 ? 780 : 1000 }); await frame(page);
      const committed = await stored(page);
      const restored = await open(browser, width, appearance, committed);
      try {
        await geometry(restored.page, 'schedule-left', width); await identity(restored.page);
        await openSettings(restored.page);
        assert.equal(await dialog(restored.page).locator('[data-pl-layout-preset="schedule-left"]').getAttribute('aria-pressed'), 'true');
        await close(restored.page).click(); await focusReturned(restored.page);
        assert.deepEqual(restored.errors, []); assert.deepEqual(restored.requests, []);
      } finally { await restored.page.close(); }

      // Collapse only the owned desktop navigation; the Settings trigger must
      // remain discoverable and operable in that smaller presentation.
      const collapse = page.locator('.pl-navigation-toggle');
      if (await collapse.isVisible()) { await collapse.click(); await frame(page); }
      await openSettings(page);
      await dialog(page).getByRole('button', { name: 'Default layout', exact: true }).click(); await frame(page);
      assert.equal(await dialog(page).isVisible(), true); await identity(page);
      await page.keyboard.press('Escape'); await focusReturned(page);
      assert.equal(await page.getByRole('button', { name: 'Default layout', exact: true }).isVisible(), true, 'sidebar Default layout remains available');
      await page.getByRole('button', { name: 'Default layout', exact: true }).click(); await frame(page); await identity(page);
      await page.locator('.pl-workspace-original').click(); await frame(page);
      assert.equal(await dialog(page).count(), 0, 'Original layout removes Settings');
      assert.equal(await trigger(page).count(), 0);
      await identity(page); assert.deepEqual(run.errors, []); assert.deepEqual(run.requests, []);
      reports.push(caseReport);
      console.log(`PASS ${width}px ${appearance}: five preset ratios, native identity/selections, modal dismissal/focus/trap, responsive bounds, saved reload and Original restoration`);
    } catch (error) {
      await page.screenshot({ path: resolve(output, `failure-${width}-${appearance}.png`) }); throw error;
    } finally { await page.close(); }
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
