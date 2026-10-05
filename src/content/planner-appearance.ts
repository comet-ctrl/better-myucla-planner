import { plannerPageUrl } from "../adapters/myucla-adapter";
import { subscribeAppearance, type ResolvedAppearance } from "../appearance";

const ATTRIBUTE = "data-pl-appearance";
const WIDGET_THEME = `@media screen {
  .iweWidgetTitle { background: #202d3c !important; color: #e7eef7 !important; border-color: #394c61 !important; }
  .iweWidgetTitle :is(h1,h2,h3,h4,h5,h6,span,button) { color: #e7eef7 !important; background-color: transparent !important; }
  .iweWidgetTitle a { color: #99ccff !important; }
}`;

/** Theme only a recognized enhanced planner. Native layout stays authoritative. */
export class PlannerAppearance {
  private stopPreference: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private resolved: ResolvedAppearance | null = null;
  private original: string | null = null;
  private applied = false;
  private started = false;
  private widgets = new Map<ShadowRoot, {style: HTMLStyleElement; observer: MutationObserver}>();
  constructor(private readonly doc: Document = document) {}

  start(): void {
    const view = this.doc.defaultView;
    if (this.started || !view || !this.doc.body || view.location.origin + view.location.pathname !== plannerPageUrl) return;
    this.started = true;
    this.stopPreference = subscribeAppearance(state => { this.resolved = state.resolved; this.render(); }, view);
    this.observer = new MutationObserver(() => this.render());
    // The theme attribute is on HTML; the observer watches BODY class/child
    // changes only. Applying a theme cannot feed back into this observer.
    this.observer.observe(this.doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    void view.customElements?.whenDefined("iwe-widget").then(() => { if (this.started) this.render(); });
  }

  private enhanced(): boolean {
    return !!this.doc.querySelector("form#aspnetForm .classPlannerWrapper.pl-workspace-host .pl-workspace-deck, form#aspnetForm #layoutContentArea.pl-planner-introduction .pl-intro-toolbar[data-planner-lift-owned]");
  }

  private render(): void {
    if (!this.started) return;
    if (!this.resolved || !this.enhanced()) { this.restore(); return; }
    const root = this.doc.documentElement;
    if (!this.applied) { this.original = root.getAttribute(ATTRIBUTE); this.applied = true; }
    if (root.getAttribute(ATTRIBUTE) !== this.resolved) root.setAttribute(ATTRIBUTE, this.resolved);
    this.renderWidgets();
  }

  private renderWidgets(): void {
    const active = new Set<ShadowRoot>();
    if (this.resolved === "dark") {
      for (const widget of this.doc.querySelectorAll("#layoutContentArea.pl-planner-introduction right-sidebar.pl-intro-sidebar-open iwe-widget")) {
        const shadow = widget.shadowRoot;
        // Only the observed native title shape. Read structure, never contents.
        const title = shadow?.querySelector("div.iweWidgetTitle");
        if (!shadow || title?.parentNode !== shadow) continue;
        active.add(shadow);
        let entry = this.widgets.get(shadow);
        if (!entry) {
          const style = this.doc.createElement("style");
          style.dataset.plannerLiftOwned = "true"; style.textContent = WIDGET_THEME;
          const observer = new MutationObserver(() => this.render());
          entry = {style, observer}; this.widgets.set(shadow, entry);
          observer.observe(shadow, {childList: true, subtree: true});
        }
        if (entry.style.parentNode !== shadow) shadow.append(entry.style);
      }
    }
    for (const [shadow, entry] of this.widgets) if (!active.has(shadow)) {
      entry.observer.disconnect(); entry.style.remove(); this.widgets.delete(shadow);
    }
  }

  private restore(): void {
    for (const entry of this.widgets.values()) { entry.observer.disconnect(); entry.style.remove(); }
    this.widgets.clear();
    if (!this.applied) return;
    if (this.original === null) this.doc.documentElement.removeAttribute(ATTRIBUTE);
    else this.doc.documentElement.setAttribute(ATTRIBUTE, this.original);
    this.applied = false; this.original = null;
  }

  dispose(): void {
    this.started = false; this.observer?.disconnect(); this.observer = null;
    this.stopPreference?.(); this.stopPreference = null; this.resolved = null;
    this.restore();
  }
}
