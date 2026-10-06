// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerWorkspace } from "../../src/content/planner-workspace";
import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
// @ts-expect-error Shared fictional browser fixture is plain JavaScript.
import { workspaceFixtureHtml } from "../../harness/workspace-fixture.mjs";

describe("workspace screen geometry around printing", () => {
  let workspace: PlannerWorkspace, adapter: MyUclaPlannerAdapter;
  let print = false, deckLeft = 200, frameId = 0;
  const mediaListeners = new Set<() => void>(), frames = new Map<number, FrameRequestCallback>();
  const save = vi.fn(), nativeAction = vi.fn();
  const el = (selector: string) => document.querySelector<HTMLElement>(selector)!;
  const rect = (left: number): DOMRect => ({ left, top: 150, width: 1200, height: 600, right: left + 1200, bottom: 750, x: left, y: 150, toJSON() {} });
  const paneLeft = () => Number.parseFloat(el(".pl-workspace-plan").style.getPropertyValue("--pl-dock-left"));
  const media = (matches: boolean) => { print = matches; for (const listener of mediaListeners) listener(); };
  const flushFrame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); };
  const actions = () => document.querySelector<HTMLDetailsElement>(".pl-workspace-plan-actions")!;

  beforeEach(() => {
    print = false; deckLeft = 200; frameId = 0; mediaListeners.clear(); frames.clear(); save.mockClear(); nativeAction.mockClear();
    vi.stubGlobal("innerWidth", 1600);
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      media: query, get matches() { return query === "print" && print; },
      addEventListener: (_type: string, listener: () => void) => { if (query === "print") mediaListeners.add(listener); },
      removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
    })));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++frameId, callback); return frameId; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
    document.body.innerHTML = new DOMParser().parseFromString(workspaceFixtureHtml(), "text/html").body.innerHTML;
    document.querySelectorAll("input,button,a").forEach(node => node.addEventListener("click", nativeAction));
    document.querySelector("form")!.addEventListener("submit", event => { event.preventDefault(); nativeAction(); });
    workspace = new PlannerWorkspace(() => {}, save); adapter = new MyUclaPlannerAdapter(document);
    workspace.reconcile(document, adapter.inspectContract().courses);
    vi.spyOn(el(".pl-workspace-deck"), "getBoundingClientRect").mockImplementation(() => rect(deckLeft));
    window.dispatchEvent(new Event("resize"));
    expect(paneLeft()).toBe(200);
  });
  afterEach(() => { workspace.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("keeps screen coordinates during print events and remeasures after the next screen frame", async () => {
    const native = [...document.querySelectorAll<HTMLInputElement>("input")].map(node => ({ node, parent: node.parentElement, form: node.form, value: node.value }));
    const tabs = [...document.querySelectorAll("[data-pl-tab]")].map(node => node.getAttribute("aria-selected"));
    window.dispatchEvent(new Event("beforeprint")); expect(actions().open).toBe(true);
    deckLeft = 52; window.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("scroll"));
    workspace.reconcile(document, adapter.inspectContract().courses);
    expect(paneLeft()).toBe(200);
    deckLeft = 240; window.dispatchEvent(new Event("afterprint")); window.dispatchEvent(new Event("afterprint"));
    expect(actions().open).toBe(false); expect(paneLeft()).toBe(200); expect(frames.size).toBe(1);
    flushFrame(); expect(paneLeft()).toBe(240);
    expect([...document.querySelectorAll("[data-pl-tab]")].map(node => node.getAttribute("aria-selected"))).toEqual(tabs);
    for (const { node, parent, form, value } of native) { expect(node.isConnected).toBe(true); expect(node.parentElement).toBe(parent); expect(node.form).toBe(form); expect(node.value).toBe(value); }
    await Promise.resolve(); expect(nativeAction).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it("also restores geometry when only print media changes, without a window print event", () => {
    actions().open = true;
    media(true); deckLeft = 52; window.dispatchEvent(new Event("resize"));
    expect(paneLeft()).toBe(200);
    deckLeft = 260; media(false); flushFrame();
    expect(paneLeft()).toBe(260); expect(actions().open).toBe(true);
    expect(nativeAction).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it("waits for screen media if afterprint fires while print styles are still active", () => {
    window.dispatchEvent(new Event("beforeprint")); media(true); deckLeft = 52;
    window.dispatchEvent(new Event("afterprint")); flushFrame();
    expect(paneLeft()).toBe(200);
    deckLeft = 280; media(false); flushFrame(); expect(paneLeft()).toBe(280);
    expect(actions().open).toBe(false);
  });

  it("removes print listeners and cancels a queued relayout on Original restoration", () => {
    const plan = el(".pl-workspace-plan"), extras = actions();
    media(true); media(false); expect(frames.size).toBe(1); expect(mediaListeners.size).toBe(1);
    workspace.restore(); expect(frames.size).toBe(0); expect(mediaListeners.size).toBe(0);
    expect(plan.style.getPropertyValue("--pl-dock-left")).toBe("");
    deckLeft = 52; media(true); window.dispatchEvent(new Event("beforeprint")); window.dispatchEvent(new Event("afterprint")); flushFrame();
    expect(plan.style.getPropertyValue("--pl-dock-left")).toBe(""); expect(extras.open).toBe(false);
    expect(document.querySelector(".pl-workspace-deck")).toBeNull();
    expect(nativeAction).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
});
