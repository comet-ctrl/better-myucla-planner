/** Production docking QA on fictional planner HTML. No live page or backend. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { introductionFixtureHtml } from './workspace-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '../../outputs/panel-layout');
const build = resolve(root, process.env.BETTER_MYUCLA_PANEL_BUILD || 'dist');
const js = await readFile(resolve(build, 'content.js'), 'utf8');
const css = await readFile(resolve(build, 'injected.css'), 'utf8');
const url = 'https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx';
const widths = process.env.BETTER_MYUCLA_PANEL_WIDTHS?.split(',').map(Number) || [2048, 1440, 390];
const polishOnly = process.env.BETTER_MYUCLA_PANEL_POLISH_ONLY === '1';
assert.ok(widths.length && widths.every(width => Number.isInteger(width) && width >= 320 && width <= 3840));
const reports = [];
const workspaceKey = 'plannerLift.workspace.v1';
const selectors = {
  schedule: '.pl-workspace-calendar', details: '.pl-workspace-details-frame',
  classes: '.pl-workspace-plan', find: '.pl-workspace-search',
  optimizer: '.classPlanner_ClassOptimizerSection', study: '.classPlanner_EnrolledNotInPlanSection',
  personal: '.classPlanner_PersonalTimeBlocksSection',
};

function fixture() {
  const doc = new JSDOM(introductionFixtureHtml(8, true, 8)).window.document;
  // Native title buttons are essential here: a plain-text calendar heading
  // cannot reproduce an invisible, flex-growing button over the drag surface.
  for (const [title, body, toggle, label] of [
    ['plannerSectionCal', 'gridDiv', 'toggleGrid', 'Weekly Schedule'],
    ['plannerSectionClip', 'panelPlan', 'togglePlan', 'Class Plan'],
    ['classSearchTitle', 'panelSearch', 'toggleSearch', 'Search for Class and Add to Plan'],
  ]) {
    const help = body === 'panelSearch' ? '<a href="#fictional-enrollment-link" class="planSectionHelpTip" data-fixture-search-enroll-link>Find a Class and Enroll</a><button id="faceTip" class="uit-clickover-bottom planSectionHelpTip link" onclick="return false;">Help</button>' : '';
    doc.getElementById(title).innerHTML = `${help}<button id="ctl00_MainContent_${toggle}" class="planSectionToggle link" onclick="shrink('${body}'); __doPostBack('ctl00$MainContent$${toggle}','')"><i class="icon-minus-sign"></i><label>${label}</label></button>`;
  }
  // The real display switches belong to gridDiv inside the native panel body,
  // not to the title. Presentation may align them without changing ancestry.
  const calendar = doc.querySelector('.classPlanner_CalendarSection');
  const grid = doc.getElementById('gridDiv'), menu = calendar.querySelector('.plannerMenuLinks');
  const gridBody = calendar.querySelector(':scope > #ctl00_MainContent_panelGrid');
  gridBody.append(grid); grid.prepend(menu);
  for (const [name, prefix] of [['studylist', 'sl'], ['plan', 'plan'], ['alternates', 'alt']]) {
    for (const state of ['Check', 'Uncheck']) doc.getElementById(`${name}${state}`).id = `${prefix}${state}`;
  }
  menu.insertAdjacentHTML('beforeend', `<span id="gridSize">Grid size: <button id="gridPlus" aria-label="Larger grid" onclick="return false;">+</button><button id="gridMinus" aria-label="Smaller grid" onclick="return false;">−</button></span>
    <span id="scghedGridShowHide"><button class="uit-clickover-bottom link" onclick="return false;">Grid View</button>: <span class="icontoggle gridsizeicons"><button id="sgUncheck" aria-label="unchecked Grid View" onclick="return false;">☐</button><button id="sgCheck" aria-label="checked Grid View" onclick="return false;">☑</button></span></span>
    <span id="schedAgendaShowHide"><button class="uit-clickover-bottom link" onclick="return false;">Agenda View</button>: <span class="icontoggle gridsizeicons"><button id="saUncheck" aria-label="unchecked Agenda View" onclick="return false;">☐</button><button id="saCheck" aria-label="checked Agenda View" onclick="return false;">☑</button></span></span>`);
  for (const [title, body, toggle, label, help] of [
    ['classOptimizerTitle', 'panelOptimizer', 'toggleOptimizer', 'Plan Optimizer', 'ctl00_MainContent_planSectionHelpTipOpPop'],
    ['plannerSectionEnip', 'panelNotplan', 'toggleNotplan', 'In Study List but Not In Current Plan', 'slneTip'],
    ['plannerSectionPer', 'panelPersonal', 'togglePersonal', 'Personal Entries', 'ctl00_MainContent_helpPersonal'],
  ]) {
    doc.getElementById(title).innerHTML = `${body === 'panelNotplan' ? '<a class="planSectionHelpTip" href="#fictional-help">Help</a>' : ''}<button id="${help}" class="${body === 'panelOptimizer' ? '' : 'uit-clickover-bottom '}planSectionHelpTip link" onclick="return false;">Help</button><button id="ctl00_MainContent_${toggle}" class="planSectionToggle link" onclick="shrink('${body}'); __doPostBack('ctl00$MainContent$${toggle}','')"><i class="${body === 'panelOptimizer' ? 'icon-plus-sign' : 'icon-minus-sign'}"></i><label>${label}</label></button>`;
  }
  doc.getElementById('HelpOptimizerDiv').style.display = 'none';
  for (const [index, card] of [...doc.querySelectorAll('tbody.courseItem')].entries()) {
    const table = card.querySelector('table.coursetable');
    const row = table.tBodies[1].rows[0];
    row.cells[0].innerHTML = `<button type="button" class="link actionMenu" aria-label="Example details action" data-fixture-detail-action="${index}" onclick="this.closest('tbody.courseItem').querySelector('.planClass').hidden=false;return false;">✎</button>`;
    const response = doc.createElement('div'); response.className = 'planClass'; response.hidden = true;
    response.innerHTML = '<label>Example native review <select name="fixtureNativeReview"><option>Example choice</option></select></label><button type="button" onclick="this.parentElement.hidden=true;return false;">Close example review</button>';
    table.after(response);
  }
  const style = doc.createElement('style');
  style.textContent = `.planClass:not([hidden]){padding:12px;border:1px solid #ccd}.planClass select,.planClass button{padding:6px;max-width:100%}
    nav{box-shadow:0 0 4px 2px rgba(0,0,0,.4)}#gridDiv{position:static}
    #gridDiv .icontoggle.gridsizeicons > button{min-width:34px}
    ${['studylist', 'plan', 'alternates'].map(name => `.checkboxStateHolder.${name}Checked .${name}Uncheck,.checkboxStateHolder:not(.${name}Checked) .${name}Check{display:none}`).join('')}
    #gridDiv.sgChecked #sgUncheck,#gridDiv:not(.sgChecked) #sgCheck,#gridDiv.saChecked #saUncheck,#gridDiv:not(.saChecked) #saCheck{display:none}`;
  doc.head.append(style);
  return doc.documentElement.outerHTML;
}

const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const panel = (page, id) => page.locator(selectors[id]);
const handle = (page, id) => panel(page, id).locator(`button[data-pl-panel-handle="${id}"]:visible`).first();
const close = (page, id) => panel(page, id).locator(`[data-pl-panel-close="${id}"]`);

const preview = page => page.locator('.pl-panel-drop-preview[data-pl-dock-target]:visible');
const interactive = 'button,a,input,select,textarea,label,[role="button"],[contenteditable="true"]';

async function dockRegions(page) {
  return { deck: await page.locator('.pl-workspace-deck').boundingBox(), main: await page.locator('.pl-workspace-main').boundingBox(), classes: await panel(page, 'classes').boundingBox() };
}

/** Point at the pane itself: a target must not be needed to discover a drop. */
async function hoverDockDestination(page, destination, regions) {
  const { deck, main, classes } = regions;
  assert.ok(deck && deck.width > 0 && deck.height > 0, 'the workspace supplies a visible drop area');
  const view = page.viewportSize();
  const points = destination === 'main'
    ? [classes, main, deck].filter(box => box && box.width > 0 && box.height > 0).flatMap(box => [.5, .4, .6].flatMap(x => [.08, .16, .3, .5, .7].map(y => ({ x: box.x + box.width * x, y: box.y + box.height * y }))))
    : [.5, .3, .7, .15].flatMap(y => [20, 48, deck.width * .12].map(inset => ({ x: destination === 'left' ? deck.x + inset : deck.x + deck.width - inset, y: deck.y + deck.height * y })));
  for (const point of points) {
    if (point.x < 0 || point.x >= view.width || point.y < 0 || point.y >= view.height) continue;
    await page.mouse.move(point.x, point.y, { steps: 6 }); await frame(page);
    if (await preview(page).count() && await preview(page).getAttribute('data-pl-dock-target') === destination) {
      assert.equal(await preview(page).count(), 1, 'only the hovered destination is previewed');
      assert.equal(await page.locator('[data-pl-dock-target="bottom"],.pl-panel-drop-target').count(), 0, 'no bottom target or small target button is rendered');
      const box = await preview(page).boundingBox();
      const style = await preview(page).evaluate(node => ({ background: getComputedStyle(node).backgroundColor, pointerEvents: getComputedStyle(node).pointerEvents }));
      assert.ok(box && box.width * box.height > deck.width * deck.height * .1 && box.height > Math.min(160, deck.height * .5), `the ${destination} preview fills a pane-sized destination: ${JSON.stringify({ box, deck })}`);
      assert.ok(style.background !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)/.test(style.background), 'the drop preview is a filled rectangle');
      assert.equal(style.pointerEvents, 'none', 'the destination preview does not intercept native controls');
      return { point, box };
    }
  }
  assert.fail(`Moving over the measured ${destination} pane region did not show its destination preview`);
}

async function assertNoBottomDock(page, id) {
  assert.equal(await page.locator('[data-pl-dock-divider="bottom"],[data-pl-dock-target="bottom"]').count(), 0, 'the workspace has no bottom docking controls');
  const placement = await panel(page, id).getAttribute('data-pl-panel-placement');
  await handle(page, id).focus(); await page.keyboard.press('Alt+ArrowDown'); await frame(page);
  assert.equal(await panel(page, id).getAttribute('data-pl-panel-placement'), placement, 'Alt+Down has no bottom docking action');
  await page.keyboard.press('Shift+F10');
  const items = await page.getByRole('menuitem').allTextContents();
  assert.ok(items.length > 0 && items.every(text => !/bottom/i.test(text)), 'the layout menu exposes no bottom docking action');
  await page.keyboard.press('Escape'); await frame(page);
}

async function blankHeaderPoint(page, id) {
  const gap = await nativeHeaderGap(page, id);
  if (gap.width >= 64) {
    assert.ok(gap.hits.every(hit => hit.noninteractive), `${id} visible header gap must not hit a native control: ${JSON.stringify(gap)}`);
    return gap.point;
  }
  // Compact headers may spend their width on native labels and controls.
  // Use the explicit grip there, never pass by finding a few padding pixels.
  await assertReachable(handle(page, id), `${id} compact header retains a reachable drag grip`);
  const grip = await handle(page, id).boundingBox();
  return { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
}

/** Measure the apparent blank gap, independently of the title button's box. */
async function nativeHeaderGap(page, id) {
  return handle(page, id).evaluate((grip, excluded) => {
    const header = grip.closest('.classPlanner_SectionTitle');
    const title = header.querySelector(':scope > button.planSectionToggle');
    const label = title.querySelector('label');
    const range = document.createRange(); range.selectNodeContents(label);
    const text = range.getBoundingClientRect(), bounds = header.getBoundingClientRect();
    const y = text.top + text.height / 2;
    const following = [...header.children].filter(node => node !== title).map(node => node.getBoundingClientRect())
      .filter(box => box.width > 0 && box.height > 0 && box.left > text.right && box.top <= y && box.bottom >= y);
    const left = text.right + 12, right = Math.min(bounds.right - 16, ...following.map(box => box.left - 12));
    const hits = [.25, .5, .75].map(fraction => {
      const point = { x: left + (right - left) * fraction, y };
      const target = document.elementFromPoint(point.x, point.y);
      return { ...point, noninteractive: !!target && header.contains(target) && !target.closest(excluded), target: target?.tagName, interactive: target?.closest(excluded)?.className };
    });
    return { width: right - left, headerWidth: bounds.width, titleWidth: title.getBoundingClientRect().width, hits, point: { x: (left + right) / 2, y } };
  }, interactive);
}

async function assertRoomyNativeHeader(page, id) {
  const gap = await nativeHeaderGap(page, id);
  assert.ok(gap.width >= 64 && gap.hits.every(hit => hit.noninteractive),
    `${id} apparent blank header has at least 64px of real noninteractive drag space, away from edge padding: ${JSON.stringify(gap)}`);
  return gap.point;
}

async function assertNativeHeaderControls(page, id) {
  const controls = panel(page, id).locator('.classPlanner_SectionTitle > :is(button,a):visible');
  assert.ok(await controls.count() >= 3, `${id} includes a real native title and owned panel controls`);
  for (const control of await controls.all()) {
    await assertReachable(control, `${id} visible native title, Help/link and owned header controls keep their own pointer targets`);
  }
  const geometry = await panel(page, id).locator('.classPlanner_SectionTitle').evaluate(header => {
    const bounds = header.getBoundingClientRect();
    const title = header.querySelector('button.planSectionToggle').getBoundingClientRect();
    return { header: bounds.toJSON(), title: title.toJSON(), viewport: innerWidth };
  });
  assert.ok(geometry.title.left >= geometry.header.left - 1 && geometry.title.right <= geometry.header.right + 1 && geometry.header.right <= geometry.viewport + 1,
    `${id} native title fits without clipping after wrapping: ${JSON.stringify(geometry)}`);
}

async function assertScheduleHeader(page, compact = false) {
  const geometry = await panel(page, 'schedule').evaluate(section => {
    const header = section.querySelector(':scope > .classPlanner_SectionTitle');
    const menu = section.querySelector('#ctl00_MainContent_panelGrid > #gridDiv > .plannerMenuLinks');
    const controls = [...section.querySelectorAll('.classPlanner_SectionTitle > button,.plannerMenuLinks button')]
      .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      .map(node => {
        const box = node.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { id: node.id || node.className, box: box.toJSON(), reachable: hit === node || node.contains(hit) };
      });
    const overlaps = [];
    controls.forEach((a, index) => controls.slice(index + 1).forEach(b => {
      if (Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1) overlaps.push([a.id, b.id]);
    }));
    const switchSlots = [...menu.querySelectorAll('.icontoggle.gridsizeicons')].map(slot => ({ width: slot.getBoundingClientRect().width, buttons: [...slot.querySelectorAll('button')].map(button => button.getBoundingClientRect().width) }));
    return { section: section.getBoundingClientRect().toJSON(), header: header.getBoundingClientRect().toJSON(), menu: menu.getBoundingClientRect().toJSON(), controls, overlaps, switchSlots };
  });
  assert.equal(geometry.controls.length >= 12, true, 'the calendar fixture includes all six native display-switch groups');
  assert.deepEqual(geometry.overlaps, [], `Schedule title and original display controls do not overlap: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.switchSlots.every(slot => slot.width >= Math.max(...slot.buttons)), 'native checkbox slots reserve the full visible button width');
  assert.ok(geometry.controls.every(({ box, reachable }) => reachable && box.left >= geometry.section.left - 1 && box.right <= geometry.section.right + 1),
    `all Schedule header/display controls stay inside the panel and keep their native pointer targets: ${JSON.stringify(geometry)}`);
  if (compact) assert.ok(geometry.menu.top >= geometry.header.top - 1 && geometry.menu.bottom <= geometry.header.bottom + 1,
    `roomy Schedule keeps its title and native display controls on one compact row: ${JSON.stringify(geometry)}`);
  await assertIdentity(page);
  return { panelWidth: geometry.section.width, title: geometry.header, controls: geometry.menu };
}

async function assertDetailsProjection(page) {
  await page.locator('.pl-workspace-details-slot').evaluate(node => { node.scrollTop = 0; }); await frame(page);
  const geometry = await page.evaluate(() => {
    const slot = document.querySelector('.pl-workspace-details-slot'), card = document.querySelector('tbody.courseItem.pl-workspace-preview-card');
    return { slot: slot.getBoundingClientRect().toJSON(), width: slot.clientWidth, row: card.querySelector(':scope > tr:nth-child(3)').getBoundingClientRect().toJSON() };
  });
  assert.ok(Math.abs(geometry.row.x - geometry.slot.x) <= 2 && Math.abs(geometry.row.y - geometry.slot.y) <= 2 && Math.abs(geometry.row.width - geometry.width) <= 2,
    `original course details stay aligned with their presentation viewport after navigation changes: ${JSON.stringify(geometry)}`);
}

async function hidePanel(page, id) {
  await assertReachable(close(page, id), `${id} close control is pointer reachable`);
  await close(page, id).click(); await frame(page);
  assert.ok(await panel(page, id).evaluate(node => node.classList.contains('pl-panel-hidden')), `${id} can be hidden without removing its native content`);
  await assertIdentity(page);
}

/** Check the original panel while the pointer remains down, not its final drop. */
async function assertLiveDragAndCancel(page, id, width, useBlankHeader = false) {
  const original = await panel(page, id).boundingBox();
  const placement = await panel(page, id).getAttribute('data-pl-panel-placement');
  const grip = await handle(page, id).boundingBox();
  const regions = await dockRegions(page);
  assert.ok(original && grip, `${id} starts visible before live drag`);
  const start = useBlankHeader ? await blankHeaderPoint(page, id) : { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  assert.ok(start, `${id} has blank header space that can start a drag`);
  assert.equal(await page.locator('[data-pl-dock-target]').count(), 0, 'no destination target exists before a drag');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(width * .51, 600, { steps: 8 }); await frame(page);
  const first = await panel(page, id).boundingBox();
  // Even a large pane must keep the same pointer offset while held. Bounds
  // are restored at the end of the gesture, not imposed between pointer moves.
  await page.mouse.move(width * .59, 90, { steps: 8 }); await frame(page);
  const second = await panel(page, id).boundingBox();
  assert.ok(first && second && Math.abs(first.x - second.x) + Math.abs(first.y - second.y) > 30,
    `${id} itself follows the mouse before release: ${JSON.stringify({ first, second })}`);
  assert.ok(Math.abs(second.x - first.x - width * .08) <= 2 && Math.abs(second.y - first.y + 510) <= 2,
    `${id} keeps the pointer offset instead of sticking at viewport edges while held: ${JSON.stringify({ first, second })}`);
  assert.ok(await panel(page, id).isVisible(), 'the dragged original panel remains visible');
  assert.equal(await page.locator('.pl-panel-drag-ghost').count(), 0, 'dragging shows the actual panel, not only a label ghost');
  assert.equal(await preview(page).count(), 0, 'free-space dragging shows no destination preview');
  await assertIdentity(page);
  await hoverDockDestination(page, id === 'schedule' ? 'right' : 'main', regions);
  await page.screenshot({ path: resolve(output, `${id}-live-drag-${width}.png`) });
  await page.keyboard.press('Escape'); await page.mouse.up(); await frame(page);
  assert.equal(await panel(page, id).getAttribute('data-pl-panel-placement'), placement, 'Escape cancels temporary undocking');
  const restored = await panel(page, id).boundingBox();
  assert.ok(restored && ['x', 'y', 'width', 'height'].every(key => Math.abs(restored[key] - original[key]) <= 2),
    `${id} returns to its pre-drag geometry after Escape: ${JSON.stringify({ original, restored })}`);
  assert.equal(await page.locator('[data-pl-dock-target],.pl-panel-drop-overlay').count(), 0, 'cancel removes the destination preview and drag overlay');
  await assertIdentity(page);
}

async function drag(page, source, destination) {
  let start = source;
  if (typeof source.boundingBox === 'function') {
    await source.scrollIntoViewIfNeeded();
    const box = await source.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, 'drag handle is visible');
    start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 18, start.y + 12, { steps: 4 });
  await frame(page);
  const point = typeof destination === 'function' ? await destination() : destination;
  await page.mouse.move(point.x, point.y, { steps: 10 });
  await page.mouse.up(); await frame(page);
}

async function floatPanel(page, id, source = handle(page, id)) {
  await drag(page, source, async () => {
    const { width, height } = page.viewportSize();
    // Narrow floating panes are deliberately placed below the navigation row,
    // so this test can reach it without first moving the window out of the way.
    for (const y of width < 600 ? [.68, .74, .55, .42, .98, .1] : [.42, .55, .68, .3, .1]) for (const x of [.52, .64, .4, .74]) {
      const point = { x: width * x, y: height * y };
      await page.mouse.move(point.x, point.y, { steps: 4 }); await frame(page);
      if (!await preview(page).count()) return point;
    }
    throw Error('No free position outside docking targets');
  });
  assert.ok(await panel(page, id).evaluate(node => node.classList.contains('pl-floating-panel')), `${id} floats after dragging to free space`);
  assert.equal(await page.locator('.pl-panel-drop-overlay').count(), 0, 'floating finishes without a stale preview overlay');
}

async function dockPanel(page, id, destination, scenario = '', source = handle(page, id)) {
  const regions = await dockRegions(page);
  const detailsGeometry = () => page.evaluate(() => {
    const plan = document.querySelector('.pl-workspace-plan'), title = plan.querySelector('.classPlanner_SectionTitle'), main = document.querySelector('.pl-workspace-main'), details = document.querySelector('.pl-workspace-details-frame');
    const style = getComputedStyle(plan);
    return { placement: plan.getAttribute('data-pl-panel-placement'), classes: plan.className, plan: plan.getBoundingClientRect().toJSON(), title: title.getBoundingClientRect().toJSON(), rows: style.gridTemplateRows, columns: style.gridTemplateColumns, clientHeight: plan.clientHeight, clientWidth: plan.clientWidth, main: main.getBoundingClientRect().toJSON(), details: details.getBoundingClientRect().toJSON() };
  });
  const before = id === 'details' ? await detailsGeometry() : null;
  let targetBox, whileDragging;
  await drag(page, source, async () => {
    const { point, box } = await hoverDockDestination(page, destination, regions);
    targetBox = box;
    if (id === 'details') whileDragging = await detailsGeometry();
    await page.screenshot({ path: resolve(output, `${id}-${destination}${scenario ? `-${scenario}` : ''}-drop-preview-${page.viewportSize().width}.png`) });
    return point;
  });
  assert.equal(await panel(page, id).getAttribute('data-pl-panel-placement'), destination, `${id} docks ${destination}`);
  assert.equal(await panel(page, id).evaluate(node => node.classList.contains('pl-floating-panel')), false);
  const dropped = await panel(page, id).boundingBox();
  const after = id === 'details' ? await detailsGeometry() : null;
  assert.ok(dropped && ['x', 'y', 'width', 'height'].every(key => Math.abs(dropped[key] - targetBox[key]) <= 2), `${id} ${destination} drop matches the filled destination preview: ${JSON.stringify({ preview: targetBox, dropped, ...(before ? { before, whileDragging, after } : {}) })}`);
  assert.equal(await page.locator('[data-pl-dock-target],.pl-panel-drop-overlay').count(), 0, 'a completed drop removes its preview');
}

async function assertReachable(locator, message) {
  const view = await locator.evaluate(node => {
    const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { reachable: !!target && (node === target || node.contains(target)), bounds: r.toJSON(), target: target?.className, viewport: [innerWidth, innerHeight] };
  });
  assert.ok(view.reachable && view.bounds.width > 0 && view.bounds.height > 0, `${message}: ${JSON.stringify(view)}`);
}

async function assertIdentity(page) {
  const mismatches = await page.evaluate(() => window.fixtureReferences.filter(({ node, parent, form, handler }) => !node.isConnected || !window.fixtureParentPreserved(node, parent) || node.form !== form || node.getAttribute('onclick') !== handler).map(({ node, parent, form, handler }) => ({
    id: node.id, tag: node.tagName, cls: node.className, connected: node.isConnected,
    originalParent: `${parent?.tagName}.${parent?.className}`, currentParent: `${node.parentElement?.tagName}.${node.parentElement?.className}`,
    sameForm: node.form === form, sameHandler: node.getAttribute('onclick') === handler,
  })));
  const proof = await page.evaluate(() => ({
    controls: window.fixtureReferences.every(({ node, parent, form, handler }) => node.isConnected && window.fixtureParentPreserved(node, parent) && node.form === form && node.getAttribute('onclick') === handler),
    rows: window.fixtureRows.every(({ node, parent }) => node.isConnected && node.parentElement === parent),
    status: window.fixtureStatuses.every(({ node, html }) => node.isConnected && node.innerHTML === html),
    calendar: window.fixtureMeetings.every(({ node, parent, top, height }) => node.isConnected && node.parentElement === parent && node.style.top === top && node.style.height === height),
    masthead: window.fixtureNavigation.isConnected && window.fixtureNavigation.outerHTML === window.fixtureNavigationHtml,
    forms: document.querySelectorAll('form').length,
  }));
  assert.deepEqual(proof, { controls: true, rows: true, status: true, calendar: true, masthead: true, forms: 1 }, `original form, immediate native control/row parents, status markup, calendar geometry and UCLA navigation survive layout gestures: ${JSON.stringify(mismatches)}`);
}

async function setup(page, saved = {}) {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === url
    ? route.fulfill({ status: 200, contentType: 'text/html', body: fixture() })
    : (requests.push(route.request().url()), route.abort()));
  await page.goto(url);
  await page.evaluate(saved => {
    const stored = { 'plannerLift.layout.v1': { tidy: true }, 'plannerLift.header.v1': { compact: true }, ...saved }, listeners = [];
    window.fixtureStored = stored;
    window.fixtureWrites = []; window.fixtureNativeCalls = []; window.fixtureSubmits = [];
    window.fixtureWorkspaceWrites = [];
    window.chrome = { storage: { local: { get: async key => ({ [key]: structuredClone(stored[key]) }), set: async value => { window.fixtureWrites.push(Object.keys(value)); if (value['plannerLift.workspace.v1']) window.fixtureWorkspaceWrites.push(structuredClone(value['plannerLift.workspace.v1'])); Object.assign(stored, structuredClone(value)); }, remove: async key => delete stored[key] }, onChanged: { addListener: fn => listeners.push(fn), removeListener() {} } } };
    window.fixtureTidy = tidy => listeners.forEach(fn => fn({ 'plannerLift.layout.v1': { newValue: { tidy } } }, 'local'));
    document.getElementById('aspnetForm').addEventListener('submit', event => { event.preventDefault(); window.fixtureSubmits.push(event.submitter?.id || 'implicit'); });
    window.shrink = id => { const body = document.getElementById(id); body.classList.toggle('hidden'); body.closest('section').querySelector('.planSectionToggle > i').className = body.classList.contains('hidden') ? 'icon-plus-sign' : 'icon-minus-sign'; };
    window.__doPostBack = (target, arg) => window.fixtureNativeCalls.push(`${target}|${arg}`);
    // The pre-existing search presentation wraps the same native Go input in
    // one label surface; docking must preserve that wrapper under goPanel.
    window.fixtureParentPreserved = (node, parent) => node.parentElement === parent || (node.id === 'ctl00_MainContent_cs_goButton' && node.parentElement?.matches('span.pl-search-submit') && node.parentElement.parentElement === parent);
    const original = document.querySelector('.classPlannerWrapper').outerHTML;
    window.fixtureCapture = () => {
      window.fixtureReferences = [...document.querySelectorAll('.classPlannerWrapper input,.classPlannerWrapper select,.classPlannerWrapper button,.classPlannerWrapper a')].filter(node => !node.closest('[data-planner-lift-owned]')).map(node => ({ node, parent: node.parentElement, form: node.form, handler: node.getAttribute('onclick') }));
      window.fixtureRows = [...document.querySelectorAll('tbody.courseItem > tr:nth-child(3)')].map(node => ({ node, parent: node.parentElement }));
      window.fixtureStatuses = [...document.querySelectorAll('table.coursetable td:nth-child(3),.ClassSearchList .data_row > .span3')].map(node => ({ node, html: node.innerHTML }));
      window.fixtureMeetings = [...document.querySelectorAll('#gridDiv .planneritembox')].map(node => ({ node, parent: node.parentElement, top: node.style.top, height: node.style.height }));
    };
    window.fixtureCapture();
    window.fixtureNavigation = document.getElementById('fixture-native-navigation'); window.fixtureNavigationHtml = window.fixtureNavigation.outerHTML;
    window.fixtureNativeSections = [...document.querySelectorAll('#ctl00_MainContent_classPlanPanel > section')];
    window.fixtureRedraw = (context = false) => {
      const template = document.createElement('template'); template.innerHTML = original;
      if (context) document.getElementById('ctl00_MainContent_planIDField').value = '9999999999';
      document.querySelector('.classPlannerWrapper').replaceWith(template.content.firstElementChild);
      window.fixtureCapture();
    };
  }, saved);
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  await page.waitForSelector('.pl-workspace-deck'); await frame(page);
  return { errors, requests };
}

/** A fresh document has no workspace controller or course references to reuse. */
async function verifyPersistence(browser) {
  const pages = [], checks = [], width = 1440;
  const open = async saved => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    pages.push(page); page.setDefaultTimeout(10000);
    checks.push(await setup(page, saved));
    return page;
  };
  const stored = page => page.evaluate(() => structuredClone(window.fixtureStored));
  const layout = page => page.evaluate(key => structuredClone(window.fixtureStored[key]), workspaceKey);
  const writes = page => page.evaluate(() => window.fixtureWorkspaceWrites.length);
  const nav = (page, id) => page.locator(`.pl-workspace-nav [data-pl-module="${id}"]`);
  const reset = page => page.getByRole('button', { name: 'Default layout', exact: true });
  const selectMenu = async (page, id, label) => {
    await handle(page, id).focus(); await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitemradio', { name: label, exact: true }).click(); await frame(page);
  };
  const assertBounded = async (page, id) => {
    const box = await panel(page, id).boundingBox(), viewport = page.viewportSize();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
      `${id} restores reachable bounds: ${JSON.stringify({ box, viewport })}`);
    return box;
  };
  const assertCancelledStorage = async (page, resize) => {
    await frame(page);
    const before = await layout(page), count = await writes(page), box = await panel(page, 'schedule').boundingBox();
    const target = resize ? panel(page, 'schedule').locator(':scope > .pl-panel-resize') : handle(page, 'schedule');
    const grip = await target.boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(resize ? grip.x - 80 : grip.x + 110, resize ? grip.y - 70 : 80, { steps: 8 }); await frame(page);
    assert.equal(await writes(page), count, `${resize ? 'resizing' : 'dragging'} does not save temporary pointer geometry`);
    assert.deepEqual(await layout(page), before, 'held gestures retain only the preceding committed stored layout');
    await page.keyboard.press('Escape'); await page.mouse.up(); await frame(page);
    assert.deepEqual(await layout(page), before, 'Escape cannot leave a cancelled position in storage');
    const after = await panel(page, 'schedule').boundingBox();
    assert.ok(['x', 'y', 'width', 'height'].every(key => Math.abs(box[key] - after[key]) <= 2), 'cancel restores the original floating geometry');
  };
  const adjustDivider = async (page, divider, targetPanel, delta, cancel) => {
    await frame(page);
    const before = await layout(page), count = await writes(page), box = await panel(page, targetPanel).boundingBox();
    const grip = await divider.boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + delta, grip.y + grip.height / 2, { steps: 8 }); await frame(page);
    assert.equal(await writes(page), count, 'divider movement does not save temporary widths');
    assert.ok(Math.abs((await panel(page, targetPanel).boundingBox()).width - box.width) >= 25, 'held divider movement visibly changes the panel width');
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up(); await frame(page);
    if (cancel) {
      assert.ok(Math.abs((await panel(page, targetPanel).boundingBox()).width - box.width) <= 2, 'Escape restores the previous divider width');
      assert.deepEqual(await layout(page), before, 'cancelled divider width cannot replace the committed stored layout');
    } else {
      assert.notDeepEqual(await layout(page), before, 'releasing a moved divider commits the new width');
    }
  };
  const report = { scenario: 'persistent-layout', width };
  reports.push(report);
  try {
    let page = await open();
    await assertReachable(reset(page), 'Default layout is a visible direct action');
    const initialSchedule = await panel(page, 'schedule').boundingBox();
    let splitter = page.getByRole('separator', { name: 'Resize schedule', exact: true });
    await splitter.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await frame(page);
    assert.equal((await layout(page)).scheduleWidth, 420, 'shrinking past the schedule minimum saves its visible 420px width');
    const minimumSchedule = await stored(page);
    await page.close(); page = await open(minimumSchedule);
    assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - 420) <= 2, 'new document restores the schedule minimum without reverting to automatic width');
    splitter = page.getByRole('separator', { name: 'Resize schedule', exact: true });
    await splitter.focus(); await page.keyboard.press('End'); await page.keyboard.press('ArrowRight'); await frame(page);
    await adjustDivider(page, splitter, 'schedule', 60, true);
    await adjustDivider(page, splitter, 'schedule', 40, false);
    const preferredWidth = (await panel(page, 'schedule').boundingBox()).width;
    assert.ok(preferredWidth > initialSchedule.width + 100, 'a user can meaningfully enlarge the schedule');
    await page.waitForFunction(key => window.fixtureStored[key]?.scheduleWidth > 0, workspaceKey);
    const sizing = await stored(page);
    await page.close(); page = await open(sizing);
    assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - preferredWidth) <= 2, 'new document restores the chosen schedule divider width');
    assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'restoring schedule size invokes no native disclosure');

    await nav(page, 'find').click();
    const section = page.locator('#container_course_M0 input[type="checkbox"]').first();
    await section.check();
    await selectMenu(page, 'find', 'Dock: Left side');
    let dock = page.locator('[data-pl-dock-divider="left"]');
    await dock.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await frame(page);
    assert.equal((await layout(page)).dockSizes.left, 200, 'shrinking past the side-dock minimum saves its visible 200px width');
    const minimumSide = await stored(page);
    await page.close(); page = await open(minimumSide);
    assert.ok(Math.abs((await panel(page, 'find').boundingBox()).width - 200) <= 2, 'new document restores the side-dock minimum without reverting to automatic width');
    assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'restoring the narrow side dock invokes no native disclosure');
    assert.equal(await page.locator('#container_course_M0 input[type="checkbox"]').first().isChecked(), false, 'saved docking preferences do not replay the previous native section selection');
    dock = page.locator('[data-pl-dock-divider="left"]');
    await dock.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await frame(page);
    await adjustDivider(page, dock, 'find', -60, true);
    await adjustDivider(page, dock, 'find', -40, false);
    await hidePanel(page, 'find');
    await nav(page, 'classes').click();
    await page.locator('[data-pl-workspace-details]').first().click();
    await panel(page, 'classes').locator('.classPlanner_SectionTitle > button.planSectionToggle').click(); await frame(page);
    await selectMenu(page, 'schedule', 'Float panel');
    const resizeGrip = panel(page, 'schedule').locator(':scope > .pl-panel-resize');
    const beforeResize = await panel(page, 'schedule').boundingBox(), grip = await resizeGrip.boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(grip.x - 90, grip.y - 70, { steps: 8 }); await page.mouse.up(); await frame(page);
    const afterResize = await assertBounded(page, 'schedule');
    assert.ok(Math.abs(beforeResize.width - afterResize.width) + Math.abs(beforeResize.height - afterResize.height) > 40,
      'a committed floating resize changes the saved dimensions');
    await assertCancelledStorage(page, false);
    await assertCancelledStorage(page, true);
    await nav(page, 'optimizer').click(); await frame(page);
    assert.equal(await page.evaluate(() => window.fixtureNativeCalls.length), 1, 'only the user opening Optimizer invokes its disclosure');
    const navigationEdge = page.getByRole('separator', { name: 'Resize navigation', exact: true });
    for (const cancel of [true, false]) {
      const before = await layout(page), count = await writes(page), edge = await navigationEdge.boundingBox();
      await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2); await page.mouse.down();
      await page.mouse.move(edge.x - 45, edge.y + edge.height / 2, { steps: 6 }); await frame(page);
      assert.ok(await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible(), 'dragging the navigation edge previews collapsing the sidebar');
      assert.equal(await writes(page), count, 'the held navigation drag does not write a temporary preference');
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up(); await frame(page);
      if (cancel) {
        assert.ok(await page.getByRole('button', { name: 'Collapse navigation', exact: true }).isVisible(), 'Escape restores expanded navigation');
        assert.deepEqual(await layout(page), before, 'cancelled navigation collapse leaves stored layout unchanged');
      }
    }
    await page.waitForFunction(key => window.fixtureStored[key]?.navigationCollapsed === true, workspaceKey);
    const saved = await stored(page), savedLayout = saved[workspaceKey];
    const savedSchedule = savedLayout.panels.find(entry => entry.id === 'schedule');
    assert.equal(savedSchedule.placement, 'floating');
    assert.ok(Math.abs(savedSchedule.box.width - afterResize.width) <= 2 && Math.abs(savedSchedule.box.height - afterResize.height) <= 2, 'floating dimensions are committed after mouse release');
    assert.ok(savedLayout.panels.find(entry => entry.id === 'find')?.hidden, 'closed Find classes is retained');
    assert.ok(savedLayout.collapsedPanes.includes('plannerSectionClip'), 'local My classes folding is retained');
    assert.equal(savedLayout.module, 'optimizer', 'active public module is retained');
    assert.ok(savedLayout.dockSizes.left > 0, 'user adjusted side-dock width is retained');
    const allowedKeys = new Set(['version', 'panels', 'module', 'mainModule', 'navigationCollapsed', 'scheduleWidth', 'scheduleExpanded', 'dockSizes', 'collapsedPanes']);
    assert.ok(Object.keys(savedLayout).every(key => allowedKeys.has(key)), 'saved layout has only public presentation fields');
    assert.ok(savedLayout.panels.every(entry => ['classes', 'find', 'optimizer', 'study', 'personal', 'schedule', 'details'].includes(entry.id)
      && Object.keys(entry).every(key => ['id', 'placement', 'hidden', 'box'].includes(key))
      && (!entry.box || Object.entries(entry.box).every(([key, value]) => ['left', 'top', 'width', 'height'].includes(key) && Number.isFinite(value)))), 'panel entries contain no course identifiers, selections or page content');
    assert.doesNotMatch(JSON.stringify(savedLayout), /Example|EXAMPLE|9999999999|container_course|courseItem|Instructor|Hall|MWF|fixtureNativeReview/,
      'fictional account and course content never enters persistent layout');
    await assertIdentity(page); await page.close();

    page = await open(saved);
    assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'restoring active Optimizer never automatically opens its native body');
    assert.deepEqual(await page.evaluate(() => window.fixtureSubmits), [], 'new-document restoration never submits the native form');
    assert.equal(await page.locator('#panelOptimizer').isVisible(), false, 'restored Optimizer preserves its originally closed native state');
    assert.equal(await panel(page, 'schedule').getAttribute('data-pl-panel-placement'), 'floating');
    const restored = await assertBounded(page, 'schedule');
    assert.ok(['x', 'y', 'width', 'height'].every(key => Math.abs(restored[key] - afterResize[key]) <= 2), 'new document restores floating schedule position and dimensions');
    assert.ok(await panel(page, 'find').evaluate(node => node.classList.contains('pl-panel-hidden')), 'hidden Find classes survives reopening');
    assert.ok(await panel(page, 'classes').evaluate(node => node.classList.contains('pl-pane-collapsed')), 'local pane folding survives reopening');
    assert.ok(await page.getByRole('button', { name: 'Expand navigation', exact: true }).isVisible(), 'collapsed navigation survives reopening');
    assert.equal(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count(), 0, 'old course Details references are not restored into a new document');
    assert.equal(await page.locator('#container_course_M0 input[type="checkbox"]').first().isChecked(), false, 'native search selections are not replayed from layout storage');
    await assertIdentity(page);
    await page.getByRole('button', { name: 'Expand navigation', exact: true }).click(); await frame(page);
    await reset(page).click(); await frame(page);
    assert.equal(await page.locator('.pl-floating-panel,.pl-panel-hidden').count(), 0, 'Default layout immediately restores docked and visible panels');
    assert.equal(await panel(page, 'schedule').getAttribute('data-pl-panel-placement'), 'right', 'Default layout returns the calendar to its original side');
    assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - initialSchedule.width) <= 2, 'Default layout resets both expanded and custom widths');
    assert.equal(await panel(page, 'classes').evaluate(node => node.classList.contains('pl-pane-collapsed')), false, 'Default layout clears owned pane folds');
    assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'Default layout never opens a native collapsed module');
    assert.deepEqual(await page.evaluate(() => window.fixtureSubmits), [], 'Default layout never submits or alters the native plan');
    const defaults = await stored(page);
    assert.deepEqual(defaults['plannerLift.header.v1'], { compact: true }, 'Default layout leaves the compact-header preference unchanged');
    await page.screenshot({ path: resolve(output, 'persistent-default-layout-1440.png') });
    await page.close(); page = await open(defaults);
    assert.equal(await page.locator('.pl-floating-panel,.pl-panel-hidden').count(), 0, 'Default layout remains the default after another new document');
    assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - initialSchedule.width) <= 2, 'reset custom sizes do not reappear on the next visit');
    assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'reopening the reset layout never discloses modules');
    await assertIdentity(page); await page.close();

    const narrow = await browser.newPage({ viewport: { width: 390, height: 700 } });
    pages.push(narrow); checks.push(await setup(narrow, saved));
    await assertBounded(narrow, 'schedule');
    assert.deepEqual(await narrow.evaluate(() => window.fixtureNativeCalls), [], 'restoring a desktop layout on mobile does not disclose modules');
    assert.equal(await narrow.locator('[data-pl-workspace-details][aria-expanded="true"]').count(), 0);
    assert.ok(await narrow.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'saved desktop geometry causes no horizontal document overflow on mobile');
    await narrow.screenshot({ path: resolve(output, 'persistent-layout-narrow.png') });
    for (const check of checks) { assert.deepEqual(check.errors, [], 'persistence scenarios have no page errors'); assert.deepEqual(check.requests, [], 'persistence scenarios make no outgoing requests'); }
    report.passed = true; report.documents = checks.length;
  } catch (error) {
    report.passed = false; report.error = error.message;
    const page = pages.findLast(page => !page.isClosed());
    if (page) await page.screenshot({ path: resolve(output, 'persistent-layout-failure.png') });
    throw error;
  } finally {
    await Promise.all(pages.filter(page => !page.isClosed()).map(page => page.close()));
  }
}

/** Empty center space belongs to remaining docked panels, not an invisible pane. */
async function verifyAutofill(browser) {
  for (const width of [2048, 1440]) {
    const pages = [], checks = [], report = { scenario: 'empty-dock-autofill', width };
    reports.push(report);
    const open = async saved => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      pages.push(page); page.setDefaultTimeout(10000); checks.push(await setup(page, saved));
      return page;
    };
    const stored = page => page.evaluate(() => structuredClone(window.fixtureStored));
    const sizes = page => page.evaluate(key => {
      const value = window.fixtureStored[key];
      return { scheduleWidth: value.scheduleWidth, scheduleExpanded: value.scheduleExpanded, dockSizes: value.dockSizes };
    }, workspaceKey);
    const nav = (page, id) => page.locator(`.pl-workspace-nav [data-pl-module="${id}"]`);
    const keyDock = async (page, id, side) => {
      await handle(page, id).focus(); await page.keyboard.press(side === 'left' ? 'Alt+ArrowLeft' : 'Alt+ArrowRight'); await frame(page);
    };
    const fillsDeck = async (page, id) => {
      const deck = await page.locator('.pl-workspace-deck').boundingBox(), box = await panel(page, id).boundingBox();
      assert.ok(deck && box && ['x', 'y', 'width', 'height'].every(key => Math.abs(box[key] - deck[key]) <= 2),
        `${id} fills the full workspace when it is the only docked pane: ${JSON.stringify({ deck, box })}`);
      assert.equal(await page.locator('.pl-workspace-splitter:visible,[data-pl-dock-divider]:visible').count(), 0, 'a single filling pane has no stranded resizing gutter');
      assert.equal(await page.locator('.pl-workspace-dock-placeholder').isVisible(), false, 'an occupied side dock suppresses the empty-center placeholder');
      assert.equal(await page.locator('.pl-workspace-schedule-widen').isVisible(), false, 'the already-filling calendar hides Widen visually');
      await assertIdentity(page);
    };
    const fillsTwoSides = async page => {
      const deck = await page.locator('.pl-workspace-deck').boundingBox();
      const left = await panel(page, 'find').boundingBox(), right = await panel(page, 'schedule').boundingBox();
      const dividers = page.locator('.pl-workspace-splitter:visible,[data-pl-dock-divider]:visible');
      assert.equal(await dividers.count(), 1, 'two sides sharing unused center space expose exactly one divider');
      const divider = await dividers.boundingBox(), gap = right.x - left.x - left.width;
      assert.ok(Math.abs(left.x - deck.x) <= 2 && Math.abs(right.x + right.width - deck.x - deck.width) <= 2
        && Math.abs(gap - divider.width) <= 2 && Math.abs(left.width + divider.width + right.width - deck.width) <= 2
        && Math.abs(divider.x - left.x - left.width) <= 2,
        `left and right share the entire deck without an empty center: ${JSON.stringify({ deck, left, right, divider })}`);
      await assertReachable(dividers, 'the single shared divider is pointer reachable');
      assert.equal(await page.locator('.pl-workspace-schedule-widen').isVisible(), false, 'custom shared docks hide the default-layout Widen action visually');
      await assertIdentity(page);
    };
    try {
      let page = await open();
      const originalWidth = (await panel(page, 'schedule').boundingBox()).width;
      const splitter = page.getByRole('separator', { name: 'Resize schedule', exact: true });
      await splitter.focus(); await page.keyboard.press('Home');
      for (let index = 0; index < 4; index++) await page.keyboard.press('ArrowLeft');
      await frame(page);
      const preferredRight = (await panel(page, 'schedule').boundingBox()).width;
      await nav(page, 'find').click(); await hidePanel(page, 'find'); await nav(page, 'classes').click();
      await keyDock(page, 'schedule', 'left');
      const leftDivider = page.locator('[data-pl-dock-divider="left"]');
      await leftDivider.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await frame(page);
      const preferredLeft = (await panel(page, 'schedule').boundingBox()).width, beforeFill = await sizes(page);
      await hidePanel(page, 'classes');
      await fillsDeck(page, 'schedule');
      assert.deepEqual(await sizes(page), beforeFill, 'automatic expansion does not overwrite remembered side or schedule widths');
      const leftSaved = await stored(page);
      await page.screenshot({ path: resolve(output, `autofill-left-${width}.png`) });
      await page.close(); page = await open(leftSaved);
      await fillsDeck(page, 'schedule');
      assert.deepEqual(await sizes(page), beforeFill, 'restoring an automatically filled layout preserves user sizes');
      await nav(page, 'classes').click(); await frame(page);
      assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - preferredLeft) <= 2, 'reopening My classes restores the saved left-dock width');
      await keyDock(page, 'schedule', 'right');
      assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - preferredRight) <= 2, 'returning to the usual right side restores its custom schedule width');
      await hidePanel(page, 'classes'); await fillsDeck(page, 'schedule');
      await nav(page, 'find').click(); await frame(page);
      assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - preferredRight) <= 2, 'opening Find classes takes back its workspace and restores calendar width');
      await keyDock(page, 'find', 'left'); await fillsTwoSides(page);
      const twoSizes = await sizes(page), twoSaved = await stored(page);
      await page.screenshot({ path: resolve(output, `autofill-two-sides-${width}.png`) });
      await page.close(); page = await open(twoSaved);
      await fillsTwoSides(page);
      assert.deepEqual(await sizes(page), twoSizes, 'reopening two filling docks preserves the underlying preferred widths');
      await hidePanel(page, 'find'); await fillsDeck(page, 'schedule');
      await nav(page, 'classes').click(); await frame(page);
      assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - preferredRight) <= 2, 'reopening a main panel restores schedule width after either side closes');

      await hidePanel(page, 'classes');
      await nav(page, 'personal').click();
      await handle(page, 'personal').focus(); await page.keyboard.press('Alt+Shift+F'); await frame(page);
      await fillsDeck(page, 'schedule');
      assert.ok(await panel(page, 'personal').isVisible(), 'a floating Personal entries pane remains visible over the filling schedule');
      await assertNativeHeaderControls(page, 'personal'); await assertIdentity(page);
      await dockPanel(page, 'personal', 'main', 'from-filled-calendar');
      assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - preferredRight) <= 2, 'docking a floating pane into main returns calendar space');
      await floatPanel(page, 'personal');
      await fillsDeck(page, 'schedule');
      await dockPanel(page, 'personal', 'left', 'last-main-filled-calendar');
      const personal = await panel(page, 'personal').boundingBox(), schedule = await panel(page, 'schedule').boundingBox(), deck = await page.locator('.pl-workspace-deck').boundingBox();
      assert.ok(Math.abs(personal.x - deck.x) <= 2 && Math.abs(schedule.x + schedule.width - deck.x - deck.width) <= 2,
        'docking the last main pane to a side consumes the center through the same preview geometry');
      await hidePanel(page, 'personal'); await fillsDeck(page, 'schedule');
      await nav(page, 'find').click(); await frame(page); await fillsTwoSides(page);
      const sharedDivider = page.locator('[data-pl-dock-divider]:visible'), grip = await sharedDivider.boundingBox();
      const beforeSharedLeft = await panel(page, 'find').boundingBox(), beforeSharedRight = await panel(page, 'schedule').boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2 + 40, grip.y + grip.height / 2, { steps: 8 }); await page.mouse.up(); await frame(page);
      const afterSharedLeft = await panel(page, 'find').boundingBox(), afterSharedRight = await panel(page, 'schedule').boundingBox();
      assert.ok(Math.abs(afterSharedLeft.width - beforeSharedLeft.width - 40) <= 2 && Math.abs(afterSharedRight.width - beforeSharedRight.width + 40) <= 2,
        'dragging the shared divider visibly resizes both panels without making a center gap');
      await fillsTwoSides(page);
      const splitSaved = await stored(page), splitSizes = await sizes(page);
      await page.close(); page = await open(splitSaved);
      await fillsTwoSides(page);
      assert.ok(Math.abs((await panel(page, 'find').boundingBox()).width - afterSharedLeft.width) <= 2
        && Math.abs((await panel(page, 'schedule').boundingBox()).width - afterSharedRight.width) <= 2, 'an explicitly resized two-panel split survives reopening');
      assert.deepEqual(await sizes(page), splitSizes, 'restoring a resized split does not rewrite its saved preferences');
      await page.getByRole('button', { name: 'Default layout', exact: true }).click(); await frame(page);
      assert.equal(await page.locator('.pl-floating-panel,.pl-panel-hidden').count(), 0, 'Default layout still restores all panels from a filled layout');
      assert.ok(Math.abs((await panel(page, 'schedule').boundingBox()).width - originalWidth) <= 2, 'Default layout restores default calendar proportions');
      assert.ok(await panel(page, 'classes').isVisible(), 'Default layout restores the main browsing panel');
      await assertIdentity(page);
      assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'autofill, restoration and reset never trigger native disclosures');
      assert.deepEqual(await page.evaluate(() => window.fixtureSubmits), [], 'autofill never submits a native form');
      for (const check of checks) { assert.deepEqual(check.errors, [], 'autofill scenarios have no page errors'); assert.deepEqual(check.requests, [], 'autofill scenarios make no outgoing requests'); }
      report.passed = true;
    } catch (error) {
      report.passed = false; report.error = error.message;
      const page = pages.findLast(page => !page.isClosed());
      if (page) await page.screenshot({ path: resolve(output, `autofill-failure-${width}.png`) });
      throw error;
    } finally { await Promise.all(pages.filter(page => !page.isClosed()).map(page => page.close())); }
  }
}

async function verifyPanelPolish(browser) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10000);
    const checks = await setup(page), report = { scenario: 'navigation-details-schedule-polish', width };
    reports.push(report);
    const nav = id => page.locator(`.pl-workspace-nav [data-pl-module="${id}"]`);
    const toggleNavigation = async collapsed => {
      await page.getByRole('button', { name: `${collapsed ? 'Collapse' : 'Expand'} navigation`, exact: true }).click(); await frame(page);
      assert.equal(await page.locator('.pl-workspace-nav').evaluate(node => getComputedStyle(node).boxShadow), 'none', 'the owned navigation removes the inherited native nav shadow');
      assert.notEqual(await page.locator('#fixture-native-navigation').evaluate(node => getComputedStyle(node).boxShadow), 'none', 'the original UCLA navigation keeps its native shadow');
    };
    try {
      if (width < 1100) await nav('schedule').click();
      else await page.locator('.pl-workspace-schedule-widen').click();
      await frame(page);
      report.scheduleHeader = await assertScheduleHeader(page, width >= 1800);
      await page.screenshot({ path: resolve(output, `compact-schedule-${width}.png`) });
      if (width >= 1800) {
        await page.locator('#gridDiv').evaluate(node => { node.style.position = 'relative'; window.dispatchEvent(new Event('resize')); }); await frame(page);
        assert.equal(await page.locator('.pl-calendar-inline-tools').count(), 0, 'an unknown positioned native ancestor keeps the ordinary Schedule control row');
        await assertScheduleHeader(page);
        await page.locator('#gridDiv').evaluate(node => { node.style.removeProperty('position'); window.dispatchEvent(new Event('resize')); }); await frame(page);
        await assertScheduleHeader(page, true);
      }
      await page.getByRole('button', { name: 'Default layout', exact: true }).click(); await frame(page);
      await nav('classes').click();
      const details = page.locator('[data-pl-workspace-details]'), courseCloses = page.locator('.pl-workspace-preview-close:visible');
      await details.nth(0).click(); await frame(page);
      assert.equal(await close(page, 'details').isVisible(), false, 'one open course hides the duplicate group X');
      assert.equal(await courseCloses.count(), 1, 'one open course has exactly one visible Details X');
      await assertReachable(courseCloses.first(), 'the sole course close remains reachable');
      await courseCloses.first().click(); await frame(page);
      assert.equal(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count(), 0, 'the sole X closes its course details');
      assert.equal(await details.nth(0).evaluate(node => node === document.activeElement), true, 'closing the sole course returns focus to its Details button');
      await details.nth(0).click(); await details.nth(1).click(); await frame(page);
      assert.equal(await courseCloses.count(), 2, 'multiple courses retain their independent close controls');
      await assertReachable(close(page, 'details'), 'multiple courses expose a reachable group close');
      assert.equal(await close(page, 'details').getAttribute('aria-label'), 'Close all class details', 'the group close is distinguished from individual course closes');
      const secondClose = page.locator('tbody.courseItem').nth(1).locator('.pl-workspace-preview-close');
      await secondClose.focus(); await frame(page); await assertReachable(secondClose, 'each course close is reachable by focusing its projected native row');
      await secondClose.click(); await frame(page);
      assert.equal(await details.nth(0).getAttribute('aria-expanded'), 'true', 'closing the second course retains the first open course');
      assert.equal(await details.nth(1).getAttribute('aria-expanded'), 'false', 'the second close affects only its own course');
      assert.equal(await close(page, 'details').isVisible(), false, 'returning to one course removes the duplicate group X again');
      assert.equal(await courseCloses.count(), 1);
      await floatPanel(page, 'details');
      await courseCloses.first().focus(); await frame(page);
      assert.equal(await close(page, 'details').isVisible(), false, 'floating a single course also keeps only its individual X');
      await assertReachable(courseCloses.first(), 'the sole close remains reachable in floating Details');
      await page.screenshot({ path: resolve(output, `single-details-floating-${width}.png`) });
      await dockPanel(page, 'details', 'main', 'single-course-close');

      if (width >= 1100) {
        await handle(page, 'schedule').focus(); await page.keyboard.press('Alt+ArrowLeft'); await frame(page);
      }
      const beforeDeck = await page.locator('.pl-workspace-deck').boundingBox();
      await toggleNavigation(true);
      const collapsedDeck = await page.locator('.pl-workspace-deck').boundingBox();
      if (width >= 1280) assert.ok(collapsedDeck.x < beforeDeck.x - 40 && collapsedDeck.width > beforeDeck.width + 40, 'collapsing the sidebar gives its width back to the deck');
      if (width >= 1100) {
        const schedule = await panel(page, 'schedule').boundingBox(), main = await page.locator('.pl-workspace-main').boundingBox();
        assert.ok(Math.abs(schedule.x - collapsedDeck.x) <= 2 && Math.abs(schedule.y - collapsedDeck.y) <= 2 && Math.abs(schedule.height - collapsedDeck.height) <= 2,
          `the left dock uses the collapsed navigation geometry immediately: ${JSON.stringify({ schedule, collapsedDeck })}`);
        assert.ok(Math.abs(main.x + main.width - collapsedDeck.x - collapsedDeck.width) <= 2 && main.x >= schedule.x + schedule.width,
          'the main pane and left dock share the resized deck without overlap');
      }
      await assertDetailsProjection(page);
      await assertReachable(courseCloses.first(), 'course close remains reachable after navigation collapse');
      await page.screenshot({ path: resolve(output, `collapsed-navigation-details-${width}.png`) });
      await toggleNavigation(false); await assertDetailsProjection(page);
      if (width >= 1100) {
        const restored = await panel(page, 'schedule').boundingBox();
        assert.ok(Math.abs(restored.x - beforeDeck.x) <= 2, 'expanding navigation puts the left dock back at the restored deck edge');
      }

      await nav('schedule').click(); await floatPanel(page, 'schedule'); await nav('classes').click(); await frame(page);
      const floating = await panel(page, 'schedule').boundingBox();
      await toggleNavigation(true);
      const afterCollapse = await panel(page, 'schedule').boundingBox();
      assert.ok(['x', 'y', 'width', 'height'].every(key => Math.abs(afterCollapse[key] - floating[key]) <= 2), 'navigation collapse preserves the user-positioned floating panel');
      assert.ok(afterCollapse.x >= 0 && afterCollapse.y >= 0 && afterCollapse.x + afterCollapse.width <= width + 1 && afterCollapse.y + afterCollapse.height <= 901,
        'the floating calendar remains bounded after navigation collapse');
      await assertScheduleHeader(page); await assertDetailsProjection(page);
      await toggleNavigation(false);
      const afterExpand = await panel(page, 'schedule').boundingBox();
      assert.ok(['x', 'y', 'width', 'height'].every(key => Math.abs(afterExpand[key] - floating[key]) <= 2), 'navigation expansion also preserves the floating panel');
      await assertIdentity(page);
      assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'compact header, closes and navigation geometry invoke no native disclosures');
      assert.deepEqual(await page.evaluate(() => window.fixtureSubmits), [], 'presentation polish never submits the native form');
      assert.deepEqual(checks.errors, [], 'polish scenarios have no page errors'); assert.deepEqual(checks.requests, [], 'polish scenarios make no outgoing requests');
      report.passed = true;
    } catch (error) {
      report.passed = false; report.error = error.message;
      await page.screenshot({ path: resolve(output, `polish-failure-${width}.png`) });
      throw error;
    } finally { await page.close(); }
  }
}

const browser = await chromium.launch({ executablePath: process.env.BETTER_MYUCLA_CHROMIUM || undefined });
await mkdir(output, { recursive: true });
try {
  for (const width of polishOnly ? [] : widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
    page.setDefaultTimeout(10000);
    const checks = await setup(page), report = { width };
    try {
      const nav = id => page.locator(`.pl-workspace-nav [data-pl-module="${id}"]`);
      await assertIdentity(page);
      assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'mount does not open a native module');
      await assertNativeHeaderControls(page, 'classes');
      report.nativeHeader = await nativeHeaderGap(page, 'classes');
      const classesHeader = width >= 1100 ? await assertRoomyNativeHeader(page, 'classes') : await blankHeaderPoint(page, 'classes');
      await floatPanel(page, 'classes', classesHeader);
      await dockPanel(page, 'classes', 'main', 'native-header', await blankHeaderPoint(page, 'classes'));
      const nativeTitle = panel(page, 'classes').locator('.classPlanner_SectionTitle > button.planSectionToggle');
      await nativeTitle.click(); await frame(page);
      assert.ok(await panel(page, 'classes').evaluate(node => node.classList.contains('pl-pane-collapsed')), 'clicking the original native title still folds My classes');
      await nativeTitle.click(); await frame(page);
      assert.equal(await panel(page, 'classes').evaluate(node => node.classList.contains('pl-pane-collapsed')), false, 'clicking the original native title still reopens My classes');
      assert.equal(await panel(page, 'classes').getAttribute('data-pl-panel-placement'), 'main', 'native title clicks keep the panel docked');
      if (width < 1100) await page.locator('.pl-workspace-schedule-toggle').click();
      await assertNativeHeaderControls(page, 'schedule');
      await assertNoBottomDock(page, 'schedule');
      await assertLiveDragAndCancel(page, 'schedule', width, true);
      await floatPanel(page, 'schedule');
      await assertReachable(handle(page, 'schedule'), 'floating schedule header is pointer reachable');
      const beforeMove = await panel(page, 'schedule').boundingBox();
      const scheduleHandle = await handle(page, 'schedule').boundingBox();
      // Stay above all docking targets; a move onto a target would redock it.
      await drag(page, handle(page, 'schedule'), { x: Math.min(width - 35, scheduleHandle.x + scheduleHandle.width / 2 + 50), y: 90 });
      const afterMove = await panel(page, 'schedule').boundingBox();
      assert.ok(Math.abs(afterMove.x - beforeMove.x) + Math.abs(afterMove.y - beforeMove.y) > 10, 'floating calendar moves with a trusted pointer drag');
      report.floatingSchedule = afterMove;
      const resize = panel(page, 'schedule').locator(':scope > .pl-panel-resize');
      if (await resize.count() && await resize.isVisible()) {
        const before = await panel(page, 'schedule').boundingBox(), grip = await resize.boundingBox();
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
        await page.mouse.move(Math.max(80, grip.x - 70), Math.max(200, grip.y - 80), { steps: 10 }); await page.mouse.up(); await frame(page);
        const after = await panel(page, 'schedule').boundingBox();
        assert.ok(Math.abs(after.width - before.width) + Math.abs(after.height - before.height) > 20, 'floating schedule resizes with its grip');
      } else assert.fail('floating schedule has a visible resize grip');
      await assertIdentity(page);
      await page.screenshot({ path: resolve(output, `schedule-floating-${width}.png`) });
      await dockPanel(page, 'schedule', 'left');
      await assertReachable(handle(page, 'schedule'), 'left-docked schedule has an accessible handle');
      await dockPanel(page, 'schedule', 'right');
      const mainBeforeHide = await page.locator('.pl-workspace-main').boundingBox();
      await hidePanel(page, 'schedule');
      assert.equal(await panel(page, 'schedule').isVisible(), false, 'closed schedule is no longer displayed');
      if (width >= 1100) {
        const mainAfterHide = await page.locator('.pl-workspace-main').boundingBox();
        assert.ok(mainAfterHide.width > mainBeforeHide.width + 100, 'hiding the docked schedule gives its width back to the workspace');
      }
      await nav('schedule').click(); await frame(page);
      assert.ok(await panel(page, 'schedule').isVisible(), 'Schedule navigation reopens the hidden native calendar');
      if (width < 1100) await page.locator('[data-pl-mobile-view="main"]').click();
      await nav('classes').click();
      const details = page.locator('[data-pl-workspace-details]');
      await details.nth(0).click(); await details.nth(1).click();
      assert.equal(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count(), 2, 'two details remain open');
      await assertLiveDragAndCancel(page, 'details', width);
      await floatPanel(page, 'details');
      await nav('find').click();
      assert.ok(await panel(page, 'details').isVisible(), 'floating Details remains visible while finding classes');
      await page.locator('.pl-workspace-details-slot').evaluate(node => { node.scrollTop = 0; }); await frame(page);
      const action = page.locator('[data-fixture-detail-action="0"]'); await action.focus();
      await assertReachable(action, 'native section action is reachable inside floating Details');
      await action.click();
      const response = page.locator('tbody.courseItem').first().locator('.planClass select');
      await response.focus(); await assertReachable(response, 'returned native review is reachable inside floating Details');
      const actionBeforeHide = await action.boundingBox();
      await hidePanel(page, 'details');
      assert.equal(await action.isVisible(), false, 'hiding Details also hides the native fixed course rows');
      assert.equal(await action.evaluate((node, box) => { const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return hit === node || node.contains(hit); }, actionBeforeHide), false,
        'closed Details native actions cannot intercept pointer clicks');
      assert.equal(await page.locator('tbody.courseItem.pl-workspace-preview-card').count(), 2, 'closing the Details pane preserves its open course records');
      assert.equal(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count(), 0, 'hidden Details is correctly announced as collapsed');
      await nav('classes').click(); await details.nth(0).click(); await frame(page);
      assert.equal(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count(), 2, 'an already-open course Details button reopens the pane without toggling that course off');
      await response.focus(); await assertReachable(response, 'reopening Details restores the same native review control');
      await hidePanel(page, 'classes');
      await response.focus(); await frame(page);
      await assertReachable(response, 'floating Details stays usable when its My classes list is closed');
      await nav('classes').click(); await frame(page);
      await assertIdentity(page);
      await page.screenshot({ path: resolve(output, `details-floating-${width}.png`) });
      await dockPanel(page, 'details', 'main', 'normal-classes');
      await response.focus(); await assertReachable(response, 'native review remains reachable after docking Details');
      await floatPanel(page, 'details');
      await hidePanel(page, 'classes');
      await dockPanel(page, 'details', 'main', 'hidden-classes');
      assert.ok(await panel(page, 'classes').isVisible(), 'docking Details reopens its hidden My classes destination');
      await response.focus(); await assertReachable(response, 'Details docked into reopened My classes retains the native review');
      await floatPanel(page, 'details');
      if (width >= 1100) {
        await nav('classes').click(); await floatPanel(page, 'classes');
        await nav('find').click(); await floatPanel(page, 'find', nav('find'));
        assert.equal(await page.locator('.pl-workspace-dock-placeholder').isVisible(), false, 'detaching both primary modules gives the remaining calendar the empty space');
        const filledCalendar = await panel(page, 'schedule').boundingBox(), filledDeck = await page.locator('.pl-workspace-deck').boundingBox();
        assert.ok(Math.abs(filledCalendar.x - filledDeck.x) <= 2 && Math.abs(filledCalendar.width - filledDeck.width) <= 2, 'the remaining calendar fills the deck while both primary panes float');
        assert.equal(await page.locator('#panelOptimizer').isVisible(), false, 'detaching primary modules does not silently select unopened Optimizer');
        assert.deepEqual(await page.evaluate(() => window.fixtureNativeCalls), [], 'empty dock presentation invokes no native disclosure');
        await action.focus(); await frame(page);
        await assertReachable(action, 'native Details content comes forward while My classes and Find classes also float');
        await response.focus(); await frame(page);
        await assertReachable(response, 'native response comes forward without changing its original parent');
        await assertIdentity(page);
        await page.screenshot({ path: resolve(output, `multiple-floating-${width}.png`) });
        await dockPanel(page, 'details', 'main', 'floating-classes');
        assert.equal(await panel(page, 'classes').getAttribute('data-pl-panel-placement'), 'floating', 'docking Details preserves the floating My classes placement');
        await response.focus(); await assertReachable(response, 'native review remains reachable when Details docks inside floating My classes');
        await floatPanel(page, 'details');
        await hidePanel(page, 'classes');
        await dockPanel(page, 'details', 'main', 'hidden-floating-classes');
        assert.equal(await panel(page, 'classes').getAttribute('data-pl-panel-placement'), 'floating', 'docking Details reopens hidden floating My classes in its retained position');
        await response.focus(); await assertReachable(response, 'Details rejoined to hidden floating My classes preserves the reachable native review');
        await handle(page, 'details').focus(); await page.keyboard.press('Shift+F10');
        await page.getByRole('menuitem', { name: 'Reset layout', exact: true }).click();
        assert.equal(await page.locator('.pl-floating-panel').count(), 0, 'keyboard layout menu restores every panel');
      } else await dockPanel(page, 'details', 'main');
      await nav('find').click();
      const selected = page.locator('#container_course_M0 input[type="checkbox"]').first();
      await selected.check();
      await hidePanel(page, 'find');
      assert.equal(await panel(page, 'find').isVisible(), false, 'Find classes can be closed');
      await nav('find').click(); await frame(page);
      assert.ok(await selected.isChecked(), 'closing and reopening Find classes retains the native section selection');
      await assertNativeHeaderControls(page, 'find');
      await floatPanel(page, 'find', await blankHeaderPoint(page, 'find'));
      await nav('classes').click();
      assert.ok(await panel(page, 'find').isVisible(), 'floating Find classes remains accessible beside My classes');
      await assertIdentity(page);
      await page.screenshot({ path: resolve(output, `find-floating-${width}.png`) });
      await dockPanel(page, 'find', 'left');
      await assertReachable(handle(page, 'find'), 'Find classes remains reachable in a side dock');
      if (width >= 1100) {
        const divider = page.locator('[data-pl-dock-divider="left"]'), grip = await divider.boundingBox();
        const before = await panel(page, 'find').boundingBox();
        assert.ok(grip, 'docked Find classes has a visible resizing divider');
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
        await page.mouse.move(grip.x - 60, grip.y + grip.height / 2, { steps: 6 }); await page.mouse.up(); await frame(page);
        const after = await panel(page, 'find').boundingBox();
        assert.ok(Math.abs(before.width - after.width) > 20, 'docked Find classes width adjusts with a trusted divider drag');
      }
      await dockPanel(page, 'find', 'main');
      assert.deepEqual(await page.evaluate(() => window.fixtureSubmits), [], 'dragging, resizing and floating native content never submits the form');
      // Native opaque modules retain their original disclosure and form controls.
      for (const id of ['optimizer', 'study', 'personal']) {
        await nav(id).click();
        assert.ok(await page.locator(`[data-fixture-module="${id}"]`).isVisible(), `${id} body is accessible`);
        const field = page.locator(`[data-fixture-module="${id}"]`).locator('input,select').first();
        await field.evaluate(node => { if (node.type === 'checkbox') node.checked = true; else if (node.tagName === 'SELECT') node.selectedIndex = 1; else node.value = 'Example retained input'; });
        const selectedState = await field.evaluate(node => ({ value: node.value, checked: node.checked }));
        await hidePanel(page, id);
        assert.equal(await page.locator(`[data-fixture-module="${id}"]`).isVisible(), false, `${id} body disappears when its panel is closed`);
        await nav(id).click(); await frame(page);
        assert.deepEqual(await field.evaluate(node => ({ value: node.value, checked: node.checked })), selectedState, `${id} retains the same native inputs after reopening`);
        await assertNativeHeaderControls(page, id);
        await floatPanel(page, id, await blankHeaderPoint(page, id)); await nav('classes').click();
        assert.ok(await page.locator(`[data-fixture-module="${id}"]`).isVisible(), `${id} remains accessible while floating`);
        await assertIdentity(page); await dockPanel(page, id, 'main');
      }
      assert.equal(await page.evaluate(() => window.fixtureNativeCalls.length), 1, 'only explicit opening of initially collapsed fictional Optimizer invokes native disclosure');
      assert.deepEqual(await page.evaluate(() => window.fixtureSubmits), ['ctl00_MainContent_toggleOptimizer'], 'only the explicit native Optimizer disclosure can submit; layout gestures never submit');
      const collapse = page.getByRole('button', { name: 'Collapse navigation', exact: true });
      await collapse.click();
      await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
      if (width >= 1280) {
        const edge = page.getByRole('separator', { name: 'Resize navigation', exact: true }), box = await edge.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
        await page.mouse.move(box.x - 45, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
        await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
      }
      await assertReachable(nav('find'), 'module navigation reopens after being collapsed');
      await nav('classes').click();
      if (width < 1100) await page.locator('.pl-workspace-schedule-toggle').click();
      await floatPanel(page, 'schedule');
      const beforeRedraw = await panel(page, 'schedule').boundingBox();
      await hidePanel(page, 'schedule');
      await page.evaluate(() => window.fixtureRedraw());
      await page.waitForSelector('.pl-workspace-calendar.pl-floating-panel.pl-panel-hidden', { state: 'attached' }); await frame(page);
      assert.equal(await panel(page, 'schedule').isVisible(), false, 'same-context native redraw preserves a hidden panel');
      await nav('schedule').click(); await frame(page);
      const afterRedraw = await panel(page, 'schedule').boundingBox();
      assert.ok(Math.abs(afterRedraw.x - beforeRedraw.x) <= 2 && Math.abs(afterRedraw.y - beforeRedraw.y) <= 2, 'same-context full native redraw retains floating layout');
      await assertIdentity(page);
      await hidePanel(page, 'schedule');
      await nav('find').click(); await hidePanel(page, 'find');
      await page.emulateMedia({ media: 'print' });
      const print = await page.locator('.pl-workspace-calendar').evaluate(node => ({ position: getComputedStyle(node).position, visible: !!node.getClientRects().length }));
      assert.ok(print.visible && !['fixed', 'absolute'].includes(print.position), 'print removes floating bounds and keeps schedule content');
      assert.ok(await panel(page, 'find').isVisible(), 'print restores content from closed native modules');
      await page.emulateMedia({ media: 'screen' });
      assert.equal(await panel(page, 'schedule').isVisible(), false, 'leaving print keeps the user\'s hidden screen layout');
      await nav('classes').click();
      await handle(page, 'classes').focus(); await page.keyboard.press('Shift+F10');
      await page.getByRole('menuitem', { name: 'Reset layout', exact: true }).click();
      assert.equal(await page.locator('.pl-panel-hidden').count(), 0, 'Reset layout reopens all closed panes');
      await page.evaluate(() => window.fixtureRedraw(true));
      await page.waitForSelector('.pl-workspace-deck'); await frame(page);
      assert.equal(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count(), 0, 'new plan context discards old course Details');
      const overflow = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(overflow.content <= overflow.viewport + 1, `no document horizontal overflow: ${JSON.stringify(overflow)}`);
      await nav('find').click(); await hidePanel(page, 'find');
      await page.locator('.pl-workspace-original').click();
      await page.waitForSelector('.pl-workspace-deck', { state: 'detached' });
      assert.equal(await page.locator('[data-pl-panel-placement],.pl-floating-panel,.pl-panel-hidden,[data-pl-panel-close],[data-pl-panel-handle],[data-pl-dock-target],.pl-workspace-details-frame').count(), 0, 'Original layout removes all docking and closing presentation');
      assert.ok(await page.locator('.classPlanner_ClassSearchSection').isVisible(), 'Original layout restores a closed search module');
      await assertIdentity(page);
      assert.equal(await page.locator('#ctl00_MainContent_classPlanPanel > section').count(), 6, 'all original native sections return to their native parent');
      assert.deepEqual(checks.errors, [], 'no page errors'); assert.deepEqual(checks.requests, [], 'no outgoing fixture requests');
      assert.deepEqual(await page.evaluate(() => window.fixtureWrites.filter(keys => keys.some(key => !['plannerLift.layout.v1', 'plannerLift.header.v1', 'plannerLift.view.v1', 'plannerLift.workspace.v1'].includes(key)))), [], 'only existing preferences and the explicitly requested local layout are written');
      report.passed = true; reports.push(report);
    } catch (error) {
      report.passed = false; report.error = error.message; report.pageErrors = checks.errors; reports.push(report);
      await page.screenshot({ path: resolve(output, `failure-${width}.png`) });
      throw error;
    } finally { await page.close(); }
  }
  if (!polishOnly) { await verifyPersistence(browser); await verifyAutofill(browser); }
  await verifyPanelPolish(browser);
} finally {
  await browser.close();
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(reports, null, 2));
}
console.log(polishOnly ? `Panel polish passed at ${widths.join(', ')}px: compact native Schedule controls, no overlap, collapsed navigation geometry/shadow, floating bounds, native Details projection and independent close controls.` : `Flexible panels passed at ${widths.join(', ')}px: native header dragging/cancel with exact pointer following, full destination previews matching drops, no bottom docking, close/reopen and preserved selections, resize/dock, multiple details/native controls, modules, sidebar, redraws, printing and restoration. Persistence passed across fresh documents, cancelled drags/resizes, hidden/folded modules, widths, narrow restoration and durable Default layout without native disclosure or stored course content. Empty-center autofill passed at 2048/1440: one or two docked panels consume available space, previews match, custom sizes survive reload/reopening, floating controls remain accessible, and Default layout restores proportions. Panel polish passed for compact native Schedule controls, collapsed navigation geometry/shadow, floating bounds, native Details projection and independent close controls.`);
