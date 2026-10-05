// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerAppearance } from "../../src/content/planner-appearance";
import { PlannerWorkspace } from "../../src/content/planner-workspace";
import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import { APPEARANCE_KEY } from "../../src/storage/appearance";
// @ts-expect-error Shared fictional production-browser fixture.
import { introductionFixtureHtml, futureQuarterFixtureHtml } from "../../harness/workspace-fixture.mjs";

const flush = async () => { for (let n=0; n<5; n++) await Promise.resolve(); };
describe("scoped planner appearance", () => {
  let appearance: PlannerAppearance, workspace: PlannerWorkspace;
  let preference: unknown, dark = false;
  let change: (value: unknown, area?: string) => void, system: (value: boolean) => void;
  let storageListeners: Set<(changes: Record<string, {newValue?: unknown}>, area: string) => void>, mediaListeners: Set<() => void>;
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(introductionFixtureHtml(), "text/html").body.innerHTML;
    document.documentElement.removeAttribute("data-pl-appearance"); preference = undefined; dark = false;
    storageListeners = new Set(); mediaListeners = new Set();
    vi.stubGlobal("chrome", { storage: { local: { get: async () => ({ [APPEARANCE_KEY]: preference }), set: vi.fn(async () => {}) }, onChanged: {
      addListener: (fn: never) => storageListeners.add(fn), removeListener: (fn: never) => storageListeners.delete(fn),
    } } });
    vi.stubGlobal("matchMedia", () => ({ get matches() { return dark; }, addEventListener: (_: string, fn: never) => mediaListeners.add(fn), removeEventListener: (_: string, fn: never) => mediaListeners.delete(fn) }));
    change = (value, area="local") => storageListeners.forEach(fn => fn({ [APPEARANCE_KEY]: { newValue: value } }, area));
    system = value => { dark = value; mediaListeners.forEach(fn => fn()); };
    workspace = new PlannerWorkspace(); appearance = new PlannerAppearance();
  });
  afterEach(() => { appearance.dispose(); workspace.restore(); document.documentElement.removeAttribute("data-pl-appearance"); vi.unstubAllGlobals(); });
  const mount = () => workspace.reconcile(document, new MyUclaPlannerAdapter(document).inspectContract().courses);
  const theme = () => document.documentElement.getAttribute("data-pl-appearance");

  it("follows System only while the recognized enhanced workspace is active, restoring Original and disposal", async () => {
    system(true); appearance.start(); await flush(); expect(theme()).toBeNull();
    const masthead = document.querySelector("layout-headerwrap")!, markup = masthead.outerHTML;
    mount(); await flush(); expect(theme()).toBe("dark");
    system(false); expect(theme()).toBe("light");
    document.querySelector<HTMLButtonElement>(".pl-workspace-original")!.click(); await flush(); expect(theme()).toBeNull();
    document.querySelector<HTMLButtonElement>(".pl-workspace-return")!.click(); await flush(); expect(theme()).toBe("light");
    expect(masthead.outerHTML).toBe(markup);
    appearance.dispose(); expect(theme()).toBeNull(); expect(storageListeners.size).toBe(0); expect(mediaListeners.size).toBe(0);
    system(true); change("dark"); document.body.append(document.createElement("div")); await flush(); expect(theme()).toBeNull();
  });

  it("honors explicit choices, ignores other storage areas, and restores a preexisting root attribute", async () => {
    document.documentElement.setAttribute("data-pl-appearance", "native"); preference = "light"; system(true);
    appearance.start(); mount(); await flush(); expect(theme()).toBe("light");
    system(false); system(true); expect(theme()).toBe("light");
    change("dark", "sync"); expect(theme()).toBe("light"); change("dark"); expect(theme()).toBe("dark");
    change({ malformed: "dark" }); expect(theme()).toBe("dark"); system(false); expect(theme()).toBe("light");
    workspace.restore(); await flush(); expect(theme()).toBe("native");
  });

  it("also supports the independently recognized future-quarter introduction", async () => {
    document.body.innerHTML = new DOMParser().parseFromString(futureQuarterFixtureHtml(), "text/html").body.innerHTML;
    preference = "dark"; appearance.start(); workspace.reconcileIntroductionOnly(document); await flush();
    expect(document.querySelector(".pl-intro-toolbar")).not.toBeNull(); expect(theme()).toBe("dark");
    workspace.restore(); await flush(); expect(theme()).toBeNull();
  });

  it("does not let a stale initial read override a newer choice or repaint after disposal", async () => {
    let resolve!: (value: unknown) => void;
    chrome.storage.local.get = (() => new Promise<unknown>(done => { resolve = done; })) as typeof chrome.storage.local.get;
    appearance.start(); mount(); change("dark"); expect(theme()).toBe("dark");
    resolve({ [APPEARANCE_KEY]: "light" }); await flush(); expect(theme()).toBe("dark");
    appearance.dispose(); appearance = new PlannerAppearance(); appearance.start();
    appearance.dispose(); resolve({ [APPEARANCE_KEY]: "dark" }); await flush(); expect(theme()).toBeNull();
  });

  it("does not rewrite the attribute for unrelated DOM updates or create a mutation loop", async () => {
    preference = "dark"; appearance.start(); mount(); await flush();
    const changes: MutationRecord[] = [], watch = new MutationObserver(records => changes.push(...records));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pl-appearance"] });
    for (let n=0; n<8; n++) { const node=document.createElement("div"); node.className="example"; document.body.append(node); }
    await flush(); expect(changes).toHaveLength(0); expect(theme()).toBe("dark"); watch.disconnect();
  });
});
