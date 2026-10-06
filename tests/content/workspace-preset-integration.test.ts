// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerWorkspace } from "../../src/content/planner-workspace";
import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import { createDefaultGroups, type WorkspacePanelId } from "../../src/content/workspace-groups";
import { WORKSPACE_PRESETS, type WorkspacePresetId } from "../../src/content/workspace-presets";
import { normalizeWorkspaceLayout, type WorkspaceLayoutPreference } from "../../src/storage/workspace-layout";
// @ts-expect-error Shared production-browser fixture is JavaScript.
import { introductionFixtureHtml } from "../../harness/workspace-fixture.mjs";

describe("layout presets in the native planner workspace", () => {
  let workspace: PlannerWorkspace, adapter: MyUclaPlannerAdapter;
  const save = vi.fn(), nativeAction = vi.fn();
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  const el = (selector: string) => document.querySelector<HTMLElement>(selector)!;
  const click = (selector: string) => (el(selector) as HTMLButtonElement).click();
  const choose = (id: WorkspacePresetId) => click(`button[data-pl-layout-preset=${id}]`);
  const pane = (id: WorkspacePanelId) => el(`[data-pl-panel-placement]:has(> .pl-pane-title [data-pl-panel-handle=${id}])`);
  const active = (id: WorkspacePanelId) => el(`[data-pl-tab=${id}]`).getAttribute("aria-selected") === "true";
  const width = (id: WorkspacePanelId) => parseFloat(pane(id).style.getPropertyValue("--pl-dock-width"));
  const divider = () => [...document.querySelectorAll<HTMLElement>("[data-pl-dock-divider]")].find(node => !node.hidden)!;
  const selected = (id: WorkspacePresetId) => el(`[data-pl-layout-preset=${id}]`).getAttribute("aria-pressed") === "true";
  const latest = () => save.mock.calls.at(-1)![0] as WorkspaceLayoutPreference;
  const fixture = () => {
    document.body.innerHTML = new DOMParser().parseFromString(introductionFixtureHtml(), "text/html").body.innerHTML;
    document.querySelectorAll("button,input,a").forEach(control => control.addEventListener("click", nativeAction));
    document.querySelector("form")!.addEventListener("submit", event => event.preventDefault());
    workspace = new PlannerWorkspace(() => {}, save);
    adapter = new MyUclaPlannerAdapter(document);
  };
  const mount = () => {
    workspace.reconcile(document, adapter.inspectContract().courses);
    const deck = el(".pl-workspace-deck");
    Object.defineProperty(deck, "clientWidth", { value: 2000, configurable: true });
    vi.spyOn(deck, "getBoundingClientRect").mockReturnValue({ left: 180, top: 120, width: 2000, height: 700, right: 2180, bottom: 820, x: 180, y: 120, toJSON() {} });
    window.dispatchEvent(new Event("resize"));
  };
  const pointer = (node: EventTarget, type: string, x: number, y = 200) => {
    const event = new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    node.dispatchEvent(event);
  };

  beforeEach(() => {
    for (const name of ["showModal", "close"]) descriptors.set(name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
    vi.stubGlobal("innerWidth", 2240);
    save.mockClear(); nativeAction.mockClear(); fixture();
  });
  afterEach(() => {
    workspace.restore();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it("applies each picker layout while preserving Find, native controls and closed optional modules", async () => {
    const input = el("#searchTier0") as HTMLInputElement;
    input.value = "Fictional pending search";
    const controls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")];
    const before = controls.map(control => ({ control, parent: control.parentElement, form: control.form, value: control.value, checked: control instanceof HTMLInputElement ? control.checked : undefined }));
    el("#classOptimizerTitle").innerHTML = '<button id="ctl00_MainContent_toggleOptimizer" class="planSectionToggle link" onclick="shrink(\'panelOptimizer\'); __doPostBack(\'ctl00$MainContent$toggleOptimizer\',\'\')"><i class="icon-plus-sign"></i><label>Plan Optimizer</label></button>';
    const toggle = el("#ctl00_MainContent_toggleOptimizer") as HTMLButtonElement;
    toggle.onclick = () => { nativeAction(); return false; };
    const optimizer = el("#panelOptimizer"), parent = optimizer.parentElement, handler = toggle.onclick;
    optimizer.classList.add("hidden");
    mount(); click("[data-pl-tab=find]");

    for (const preset of WORKSPACE_PRESETS) {
      choose(preset.id); await Promise.resolve();
      expect(selected(preset.id)).toBe(true);
      expect(latest().layoutPreset).toBe(preset.id);
      expect(latest().module).toBe("find"); expect(active("find")).toBe(true);
      expect(pane("find").classList.contains("pl-module-active")).toBe(true);
      const browsing = preset.id === "single" ? "main" : preset.id === "schedule-left" ? "right" : "left";
      expect(pane("find").dataset.plPanelPlacement).toBe(browsing);
      expect(pane("schedule").dataset.plPanelPlacement).toBe(preset.id === "single" ? "main" : preset.id === "schedule-left" ? "left" : "right");
      if (preset.id !== "single") {
        expect(width("find")).toBeCloseTo(1988 * preset.ratios[browsing]!, 0);
        expect(width("find") + width("schedule") + 12).toBeCloseTo(2000, 0);
        expect(active("schedule")).toBe(true);
      }
      for (const id of ["optimizer", "study", "personal"] as const) expect(latest().groups.panels[id].open).toBe(false);
      for (const original of before) {
        expect(original.control.isConnected).toBe(true);
        expect(original.control.parentElement).toBe(original.parent); expect(original.control.form).toBe(original.form);
        expect(original.control.value).toBe(original.value);
        if (original.control instanceof HTMLInputElement) expect(original.control.checked).toBe(original.checked);
      }
      expect(optimizer.classList.contains("hidden")).toBe(true); expect(optimizer.parentElement).toBe(parent);
      expect(toggle.onclick).toBe(handler); expect(nativeAction).not.toHaveBeenCalled();
    }
    expect(adapter.inspectContract().ok).toBe(true);
    expect(JSON.stringify(latest())).not.toContain("Fictional pending search");
  });

  it("restores a saved preset on a fresh mount without selecting native controls or rewriting storage", async () => {
    mount(); click("[data-pl-tab=find]"); choose("schedule-left"); await Promise.resolve();
    const saved = normalizeWorkspaceLayout(latest())!;
    const oldWidth = width("schedule");
    workspace.restore(); fixture();
    const input = el("#searchTier0") as HTMLInputElement;
    input.value = "Fresh fictional field value";
    const parent = input.parentElement, form = input.form;
    workspace.setSavedLayout(saved); save.mockClear(); nativeAction.mockClear(); mount(); await Promise.resolve();
    expect(selected("schedule-left")).toBe(true);
    expect(active("find")).toBe(true); expect(active("schedule")).toBe(true);
    expect(pane("schedule").dataset.plPanelPlacement).toBe("left");
    expect(width("schedule")).toBeCloseTo(oldWidth, 0);
    expect(input.parentElement).toBe(parent); expect(input.form).toBe(form); expect(input.value).toBe("Fresh fictional field value");
    expect(save).not.toHaveBeenCalled(); expect(nativeAction).not.toHaveBeenCalled();
  });

  it("reopens Schedule when choosing a split after closing it", async () => {
    mount(); click("[data-pl-tab-close=schedule]"); choose("browse-wide"); await Promise.resolve();
    expect(latest().groups.panels.schedule.open).toBe(true);
    expect(active("schedule")).toBe(true);
    expect(pane("schedule").classList.contains("pl-panel-hidden")).toBe(false);
    expect(nativeAction).not.toHaveBeenCalled();
  });

  it("turns a preset into Custom at the current divider width without jumping to default proportions", async () => {
    mount(); click("[data-pl-tab=find]"); choose("browse-wide"); await Promise.resolve();
    const before = width("find"), handle = divider();
    expect(before).toBeCloseTo(1292.2, 0);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(width("find")).toBeCloseTo(Math.round(before) + 16, 0);
    expect(width("find") + width("schedule") + 12).toBeCloseTo(2000, 0);
    expect(latest().layoutPreset).toBeNull(); expect(selected("browse-wide")).toBe(false);
    expect(latest().dockSizes.left).toBeCloseTo(width("find"), 0);
    expect(el(".pl-settings-current").textContent).toContain("Custom");
    expect(nativeAction).not.toHaveBeenCalled();
  });

  it.each(["Escape", "blur", "pointercancel"])("restores the preset and its widths after a divider drag canceled by %s", async cancel => {
    mount(); choose("browse-wide"); await Promise.resolve();
    const before = width("classes"), handle = divider(); save.mockClear();
    pointer(handle, "pointerdown", 1400); pointer(document, "pointermove", 1480);
    expect(width("classes")).toBeGreaterThan(before + 70);
    expect(selected("browse-wide")).toBe(false);
    if (cancel === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    else if (cancel === "blur") window.dispatchEvent(new Event("blur"));
    else pointer(document, "pointercancel", 1480);
    await Promise.resolve();
    expect(width("classes")).toBeCloseTo(before, 0); expect(selected("browse-wide")).toBe(true);
    expect(save).not.toHaveBeenCalled(); expect(nativeAction).not.toHaveBeenCalled();
  });

  it("commits a dragged divider as a custom layout that survives a fresh mount", async () => {
    mount(); choose("schedule-wide"); await Promise.resolve();
    const before = width("classes");
    pointer(divider(), "pointerdown", 900); pointer(document, "pointermove", 1010); pointer(document, "pointerup", 1010);
    await Promise.resolve();
    expect(width("classes")).toBeCloseTo(Math.round(before) + 110, 0);
    const saved = normalizeWorkspaceLayout(latest())!, committed = width("classes");
    expect(saved.layoutPreset).toBeNull();
    workspace.restore(); fixture(); workspace.setSavedLayout(saved); mount();
    expect(width("classes")).toBeCloseTo(committed, 0);
    expect(nativeAction).not.toHaveBeenCalled();
  });

  it("uses Settings Default layout to clear the preset without clearing native selections", async () => {
    const input = el("#searchTier0") as HTMLInputElement; input.value = "Fictional unsent selection";
    mount(); choose("schedule-left"); click(".pl-settings-default"); await Promise.resolve();
    expect(latest().groups).toEqual(createDefaultGroups()); expect(latest().layoutPreset).toBeNull();
    expect(input.value).toBe("Fictional unsent selection"); expect(active("classes")).toBe(true);
    expect([...document.querySelectorAll("[data-pl-layout-preset][aria-pressed=true]")]).toHaveLength(0);
    expect(nativeAction).not.toHaveBeenCalled();
  });

  it("removes Settings on Original layout and leaves stale controls and document keys inactive", async () => {
    const nativeInput = el("#searchTier0"), parent = nativeInput.parentElement;
    mount(); choose("balanced"); click(".pl-workspace-settings"); await Promise.resolve();
    const trigger = el(".pl-workspace-settings"), preset = el("[data-pl-layout-preset=single]"), reset = el(".pl-settings-default");
    const dialog = el(".pl-workspace-settings-dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    click(".pl-workspace-original"); save.mockClear();
    trigger.click(); preset.click(); reset.click();
    const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(key); await Promise.resolve();
    expect(document.querySelector(".pl-workspace-settings-dialog")).toBeNull();
    expect(document.querySelector(".pl-workspace-settings")).toBeNull();
    expect(document.querySelector(".pl-workspace-deck")).toBeNull();
    expect(dialog.open).toBe(false); expect(key.defaultPrevented).toBe(false);
    expect(nativeInput.isConnected).toBe(true); expect(nativeInput.parentElement).toBe(parent);
    expect(save).not.toHaveBeenCalled(); expect(nativeAction).not.toHaveBeenCalled();
    expect(adapter.inspectContract().ok).toBe(true);
  });
});
