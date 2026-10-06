/** Fictional course menus and partial redraws. No live enrollment or requests. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { introductionFixtureHtml } from './workspace-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '../../outputs/course-detail-actions');
const build = resolve(root, process.env.BETTER_MYUCLA_DETAIL_ACTION_BUILD || 'dist');
const css = await readFile(resolve(build, 'injected.css'), 'utf8');
const js = await readFile(resolve(build, 'content.js'), 'utf8');
const url = 'https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx';
const widths = process.env.BETTER_MYUCLA_DETAIL_ACTION_WIDTHS?.split(',').map(Number) || [2048, 1440, 1280, 390];
assert.ok(widths.every(width => Number.isInteger(width) && width >= 320 && width <= 3840));
const baseline = process.argv.includes('--expect-baseline-failure');
const failures = [], measurements = [];
const check = (ok, description) => { if (!ok) failures.push(description); };

function fixture() {
  const doc = new JSDOM(introductionFixtureHtml(6, true)).window.document;
  for (const [index, card] of [...doc.querySelectorAll('tbody.courseItem')].entries()) {
    const table = card.querySelector('table.coursetable');
    const group = table.tBodies[1], row = group.rows[0];
    const menu = group.rows[1];
    menu.className = 'mobilemenupanel';
    menu.innerHTML = `<td colspan="10"><div class="message enrl-plan-actions touchpanelmenu">
      <button type="button" data-fixture-next="${index}" onclick="return courseListAction(this)">Example next step</button>
      </div></td>`;
    row.cells[0].innerHTML = `<button type="button" class="link actionMenu" data-fixture-menu="${index}" onclick="const row=this.closest('tbody').querySelector('tr.mobilemenupanel');row.style.display=row.style.display==='none'?'table-row':'none';return false">Example actions</button>`;
    const response = doc.createElement('div'); response.className = 'planClass'; table.after(response);
  }
  // This is a synthetic response shape, not a claim to emulate UCLA's backend.
  // Keep the recorded native action row ancestry while making its controls inert.
  const style = doc.createElement('style');
  style.textContent = '.enrl-plan-actions{padding:12px;border:1px solid #ccd;background:white}.enrl-plan-actions button,.enrl-plan-actions select{padding:8px;max-width:100%}.enrl-plan-actions label{display:block}.enrl-plan-actions [hidden]{display:none}';
  doc.head.append(style);
  return doc.documentElement.outerHTML;
}

const browser = await chromium.launch({ executablePath: process.env.BETTER_MYUCLA_CHROMIUM || undefined });
await mkdir(output, { recursive: true });
try {
  for (const width of widths) for (const redraw of ['in-place', 'course', 'root', 'wrapper']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
    const errors = [], requests = [];
    const named = message => `${width}px/${redraw}: ${message}`;
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === url
      ? route.fulfill({ status: 200, contentType: 'text/html', body: fixture() })
      : (requests.push(route.request().url()), route.abort()));
    await page.goto(url);
    await page.evaluate(redraw => {
      const stored = { 'plannerLift.layout.v1': { tidy: true }, 'plannerLift.header.v1': { compact: true } }, listeners = [];
      window.chrome = { storage: { local: { get: async key => ({ [key]: stored[key] }), set: async values => Object.assign(stored, values), remove: async key => delete stored[key] }, onChanged: { addListener: fn => listeners.push(fn), removeListener: () => {} } } };
      window.fixtureTidy = tidy => listeners.forEach(fn => fn({ 'plannerLift.layout.v1': { newValue: { tidy } } }, 'local'));
      const wrapper = document.querySelector('.classPlannerWrapper');
      const original = wrapper.outerHTML;
      window.fixtureSwapContext = () => {
        const template = document.createElement('template'); template.innerHTML = original;
        document.getElementById('ctl00_MainContent_planIDField').value = '9999999999';
        document.querySelector('#panelPlan #div_landing > table').replaceWith(template.content.querySelector('#panelPlan #div_landing > table'));
      };
      window.fixtureCalls = 0;
      window.fixtureReferences = [...document.querySelectorAll('[data-fixture-menu],[data-fixture-next]')].map(node => ({ node, parent: node.parentElement, onclick: node.getAttribute('onclick'), form: node.form }));
      window.courseListAction = button => {
        window.fixtureCalls++;
        const index = button.dataset.fixtureNext;
        const template = document.createElement('template'); template.innerHTML = original;
        const replacement = template.content.firstElementChild;
        const target = replacement.querySelector(`[data-fixture-next="${index}"]`);
        const nativeCourse = target.closest('tbody.courseItem');
        const review = document.createElement('div'); review.dataset.fixtureNativeReview = index;
        review.innerHTML = `<h3>Example native review</h3><label>Example option <select name="fictionalChoice${index}"><option value="example">Example choice</option></select></label><button type="button" data-fixture-review-cancel onclick="this.parentElement.hidden=true;return false">Close example review</button>`;
        if (redraw === 'in-place') {
          button.closest('tbody.courseItem').querySelector('.planClass').append(review);
          button.closest('tr.mobilemenupanel').style.display = 'none';
        } else nativeCourse.querySelector('.planClass').append(review);
        if (redraw === 'course') button.closest('tbody.courseItem').replaceWith(nativeCourse);
        else if (redraw === 'root') document.querySelector('#panelPlan #div_landing > table').replaceWith(replacement.querySelector('#panelPlan #div_landing > table'));
        else if (redraw === 'wrapper') document.querySelector('.classPlannerWrapper').replaceWith(replacement);
        // Keep the freshly returned control identities as the authoritative nodes.
        window.fixtureResponse = {
          review,
          controls: [...review.querySelectorAll('select,button')].map(node => ({ node, parent: node.parentElement, onclick: node.getAttribute('onclick') })),
          nativeCourse: review.closest('tbody.courseItem'),
        };
        review.querySelector('select').focus({ preventScroll: true });
        window.fixtureResponse.initialFocus = document.activeElement === review.querySelector('select');
        return false;
      };
    }, redraw);
    await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
    await page.waitForSelector('.pl-workspace-deck');
    const details = page.locator('[data-pl-workspace-details]');
    await details.nth(0).click();
    if (!baseline) {
      await details.nth(1).click();
      check(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count() === 2, named('two independent details stay open'));
    }
    const menu = page.locator('[data-fixture-menu="0"]');
    const beforeFocus = await page.locator('.pl-workspace-details-slot').evaluate(node => {
      node.scrollTop = 0;
      const target = document.querySelector('[data-fixture-menu="0"]');
      const before = { scrollTop: node.scrollTop, slot: node.getBoundingClientRect().toJSON(), control: target.getBoundingClientRect().toJSON(), active: document.activeElement?.className };
      // Reproduce focus before the asynchronous scroll event updates native rows.
      target.focus();
      return before;
    });
    const afterFocus = await menu.evaluate(node => ({ slotScroll: document.querySelector('.pl-workspace-details-slot').scrollTop, control: node.getBoundingClientRect().toJSON(), active: document.activeElement === node }));
    try { await menu.click(); }
    catch (error) {
      const geometry = await menu.evaluate(node => {
        const inspect = element => {
          if (!element) return null;
          const style = getComputedStyle(element);
          return { tag: element.tagName, id: element.id, classes: element.className, box: element.getBoundingClientRect().toJSON(), scrollTop: element.scrollTop, display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents, position: style.position, zIndex: style.zIndex, clipPath: style.clipPath, inline: element.getAttribute('style') };
        };
        const box = node.getBoundingClientRect();
        return { control: inspect(node), hit: inspect(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)), row: inspect(node.closest('tbody.courseItem').children[2]), card: inspect(node.closest('tbody.courseItem')), slot: inspect(document.querySelector('.pl-workspace-details-slot')), frame: inspect(document.querySelector('.pl-workspace-details-frame')), plan: inspect(document.querySelector('.pl-workspace-plan')), main: inspect(document.querySelector('.pl-workspace-main')), deck: inspect(document.querySelector('.pl-workspace-deck')), pageScroll: scrollY, bodyScroll: document.body.scrollTop };
      });
      await writeFile(resolve(output, `menu-failure-${width}-${redraw}.json`), JSON.stringify({ beforeFocus, afterFocus, ...geometry }, null, 2));
      await page.screenshot({ path: resolve(output, `menu-failure-${width}-${redraw}.png`) });
      throw new Error(named(`native menu click failed: ${error.message}`));
    }
    const next = page.locator('[data-fixture-next="0"]');
    await next.focus();
    check(await next.isVisible(), named('native action menu is visible'));
    check(await page.evaluate(() => window.fixtureReferences.every(({ node, parent, onclick, form }) => node.parentElement === parent && node.getAttribute('onclick') === onclick && node.form === form && form === document.getElementById('aspnetForm'))), named('opening details preserves original menu/action/control identity'));
    await next.click();
    await page.waitForFunction(() => !!window.fixtureResponse && !!document.querySelector('.pl-workspace-deck'));
    // Reconciliation is driven by the real production MutationObserver/rAF path.
    await page.waitForFunction(() => document.querySelector('[data-fixture-menu="0"]').closest('tbody.courseItem').querySelector('[data-pl-workspace-details]'));
    const response = page.locator('[data-fixture-native-review="0"]');
    const responseVisible = await response.isVisible();
    check(responseVisible, named('same-context native response stays visible after redraw'));
    check(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count() === (baseline ? 1 : 2), named('same-context native redraw retains open courses'));
    check(await page.evaluate(() => window.fixtureResponse.controls.every(({ node, parent, onclick }) => node.isConnected && node.parentElement === parent && node.getAttribute('onclick') === onclick && node.form === document.getElementById('aspnetForm'))), named('returned review controls retain identity, handlers and form'));
    check(await page.evaluate(() => !window.fixtureResponse.initialFocus || document.activeElement === window.fixtureResponse.review.querySelector('select')), named('native response focus is not stolen by local detail restoration'));
    if (responseVisible) {
      const choice = response.locator('select');
      await choice.focus();
      const view = await choice.evaluate(node => {
        const box = node.getBoundingClientRect(), target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const slot = document.querySelector('.pl-workspace-details-slot'), row = node.closest('tbody.courseItem').children[2];
        return { visible: !!node.getClientRects().length, reachable: node === target || node.contains(target), documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
          control: box.toJSON(), slot: slot.getBoundingClientRect().toJSON(), row: row.getBoundingClientRect().toJSON(), slotScroll: slot.scrollTop, rowStyle: row.getAttribute('style'), intercept: target?.tagName };
      });
      check(view.reachable, named('returned native review is pointer reachable'));
      if (!view.reachable) await page.screenshot({ path: resolve(output, `unreachable-${width}-${redraw}.png`) });
      check(view.documentWidth <= view.viewport + 1, named('no horizontal page clipping'));
      await choice.focus();
      check(await choice.evaluate(node => document.activeElement === node), named('returned native review is keyboard reachable'));
      const cancel = response.locator('[data-fixture-review-cancel]');
      await cancel.focus();
      const cancelReachable = await cancel.evaluate(node => {
        const box = node.getBoundingClientRect(), target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return node === target || node.contains(target);
      });
      check(cancelReachable, named('returned native cancel button is pointer reachable'));
      if (cancelReachable) {
        await cancel.click();
        check(!await response.isVisible(), named('original cancellation handler still works'));
      }
      measurements.push({ width, redraw, ...view });
    }
    check(await page.evaluate(() => window.fixtureCalls) === 1, named('exactly one explicit fictional native command; no replay on reconcile'));
    if (!baseline) {
      if (redraw === 'in-place') {
        // Touch must scroll the shared detail stack, never UCLA's page behind it.
        await page.locator('.pl-workspace-details-slot').evaluate(node => { node.scrollTop = 0; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const gesture = await page.locator('.pl-workspace-details-slot').evaluate(node => {
          const box = node.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.top + Math.min(230, box.height - 40), scroll: node.scrollTop, pageScroll: scrollY };
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gesture.x, y: gesture.y }] });
        for (let step = 1; step <= 5; step++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gesture.x, y: gesture.y - step * 24 }] });
          await page.waitForTimeout(20);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const afterTouch = await page.locator('.pl-workspace-details-slot').evaluate(node => ({ scroll: node.scrollTop, pageScroll: scrollY }));
        check(afterTouch.scroll > gesture.scroll + 40, named('touch gesture scrolls open details'));
        check(Math.abs(afterTouch.pageScroll - gesture.pageScroll) <= 1, named('touch gesture does not scroll the document behind details'));
        await cdp.detach();
      }
      await page.evaluate(() => window.fixtureSwapContext());
      await page.waitForFunction(() => !document.querySelector('[data-pl-workspace-details][aria-expanded="true"]'));
      check(await page.locator('.pl-workspace-deck').count() === 1, named('new context stays usable with obsolete details discarded'));
      check(await page.evaluate(() => window.fixtureCalls) === 1, named('changing context never replays a native action'));
      await page.evaluate(() => window.fixtureTidy(false));
      await page.waitForSelector('.pl-workspace-deck', { state: 'detached' });
      check(await page.locator('.pl-workspace-preview,.pl-workspace-details-slot').count() === 0, named('Original presentation removes detail overlays'));
    }
    check(errors.length === 0 && requests.length === 0, named('no script errors or outgoing requests'));
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(resolve(output, `${baseline ? 'baseline' : 'fixed'}-metrics.json`), JSON.stringify({ measurements, failures }, null, 2));
if (baseline) {
  assert.ok(failures.some(message => message.includes('native response stays visible')), 'baseline must reproduce response hidden after redraw');
  console.log(`Reproduced ${failures.length} old-build failures in fictional native response flows.`);
} else {
  assert.deepEqual(failures, [], 'course detail native-action presentation regression');
  console.log(`Course detail actions passed at ${widths.join(', ')}px: menus, two-open redraw retention, form identity, keyboard/pointer access, context reset and no action replay.`);
}
