/** In-memory presentation only. Native panels and controls never change parent. */
export type PanelDock = "main" | "left" | "right";
export type PanelPlacement = PanelDock | "floating";
export interface PanelBox { left: number; top: number; width: number; height: number; }
export interface PanelDockTarget { hit: PanelBox; preview: PanelBox; }
export interface PanelDropOperation { kind: "merge" | "split"; dock: PanelDock; index?: number; }
export interface PanelDropTarget extends PanelDockTarget { operation: PanelDropOperation; }
export interface PanelLayoutSnapshot { panels: { id: string; placement: PanelPlacement; box?: PanelBox; hidden?: boolean }[]; }
export interface PanelRegistration {
  id: string; label: string; element: HTMLElement; handle: HTMLElement; defaultDock: PanelDock;
  allowedDocks?: readonly PanelDock[];
  /** Viewport rectangles captured before a gesture changes the workspace. */
  getDockTargets?: () => Partial<Record<PanelDock, PanelDockTarget>>;
  /** Ordered explicit grouping targets; edges can split while centers merge. */
  getDropTargets?: () => PanelDropTarget[];
  canDrop?: (operation: PanelDropOperation) => boolean;
  /** Explicit user intent only; never called by snapshot restoration or resize. */
  onActivate?: () => void;
}
/** Drag/geometry are transient display updates; commit is a completed user resize. */
export type PanelLayoutChangeReason = "placement" | "geometry" | "visibility" | "reset" | "drag" | "commit";
type Change = (id: string, placement: PanelPlacement, reason: PanelLayoutChangeReason, operation?: PanelDropOperation) => void;
interface SavedStyle { name: string; value: string; priority: string; }
interface HandleState {
  node: HTMLElement; title: string | null; tabIndex: string | null; marker: string | null; hadClass: boolean; hadClassAttribute: boolean;
  down: (event: PointerEvent) => void; key: (event: KeyboardEvent) => void;
  double: (event: MouseEvent) => void; context: (event: MouseEvent) => void;
}
interface Panel extends PanelRegistration {
  placement: PanelPlacement; box?: PanelBox; hidden: boolean; handles: HandleState[]; resize: HTMLButtonElement;
  originalPlacement: string | null; originalFloating: boolean; originalHidden: boolean; originalDragging: boolean;
  hadStyle: boolean; hadClassAttribute: boolean;
  styles: SavedStyle[];
}
interface Gesture {
  panel: Panel; pointerId: number; source: HTMLElement; startX: number; startY: number;
  original: PanelBox; offsetX: number; offsetY: number; resize: boolean; started: boolean;
  before: { placement: PanelPlacement; box?: PanelBox; hidden: boolean; styles: SavedStyle[]; dragging: boolean; resizeHidden: boolean };
  targets: PanelDropTarget[]; legacyTargets:boolean; overlay?: HTMLElement; target?: PanelDropTarget;
}
const OWNED = "data-planner-lift-owned";
const DOCKS: readonly PanelDock[] = ["main", "left", "right"];
const HIT_PRIORITY: readonly PanelDock[] = ["left", "right", "main"];
const BOX_PROPERTIES = ["--pl-panel-left", "--pl-panel-top", "--pl-panel-width", "--pl-panel-height", "--pl-panel-z"];
const LABELS: Record<PanelDock, string> = { main: "Main workspace", left: "Left side", right: "Right side" };
const INTERACTIVE = "button,input,select,textarea,a,summary,label,[contenteditable]:not([contenteditable='false']),[tabindex]:not([tabindex='-1']),[role='button'],[role='link'],[role='checkbox'],[role='radio'],[role='switch'],[role='tab'],[role='combobox'],[role='listbox'],[role='option'],[role='slider'],[role='spinbutton'],[role='textbox'],[role^='menuitem']";
const HEADER_SURFACES = ".popover,.clickover,dialog,[role='dialog'],[role='alertdialog'],[popover]";

export class PanelLayoutController {
  private panels = new Map<string, Panel>();
  private gesture: Gesture | null = null;
  private dragFrame: number | null = null;
  private dragPoint: { x: number; y: number } | null = null;
  private menu: HTMLElement | null = null;
  private menuTrigger: HTMLElement | null = null;
  private clickSuppression: { node: HTMLElement; until: number } | null = null;
  private activatingPlacement = 0;
  private layer = 0;
  private disposed = false;
  constructor(private doc: Document, private host: HTMLElement, private onChange: Change = () => {}) {
    doc.addEventListener("pointermove", this.move, { passive: false });
    doc.addEventListener("pointerup", this.up);
    doc.addEventListener("pointercancel", this.cancelPointer);
    doc.addEventListener("keydown", this.escape, true);
    doc.addEventListener("pointerdown", this.outside, true);
    doc.addEventListener("click", this.suppressClick, true);
    doc.defaultView?.addEventListener("resize", this.viewportResize);
    doc.defaultView?.addEventListener("blur", this.cancel);
  }

  addPanel(registration: PanelRegistration): void {
    if (this.disposed || registration.element.ownerDocument !== this.doc || registration.handle.ownerDocument !== this.doc) return;
    this.removePanel(registration.id);
    const resize = this.doc.createElement("button");
    resize.type = "button"; resize.className = "pl-panel-resize"; resize.setAttribute(OWNED, "");
    resize.setAttribute("aria-label", `Resize ${registration.label}`);
    resize.title = "Drag to resize. Use arrow keys to resize with the keyboard.";
    resize.hidden = true;
    const panel: Panel = { ...registration, placement: registration.defaultDock, hidden: false, handles: [], resize,
      originalPlacement: registration.element.getAttribute("data-pl-panel-placement"),
      originalFloating: registration.element.classList.contains("pl-floating-panel"),
      originalHidden: registration.element.classList.contains("pl-panel-hidden"),
      originalDragging: registration.element.classList.contains("pl-panel-dragging"),
      hadStyle: registration.element.hasAttribute("style"), hadClassAttribute: registration.element.hasAttribute("class"),
      styles: BOX_PROPERTIES.map(name => ({ name, value: registration.element.style.getPropertyValue(name), priority: registration.element.style.getPropertyPriority(name) })) };
    this.panels.set(registration.id, panel);
    registration.element.setAttribute("data-pl-panel-placement", registration.defaultDock);
    registration.element.append(resize);
    resize.addEventListener("pointerdown", event => this.begin(panel, resize, event, true));
    resize.addEventListener("keydown", event => {
      if (!panel.box || panel.placement !== "floating" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const step = event.shiftKey ? 40 : 16;
      const box = { ...panel.box };
      box.width += event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      box.height += event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      this.applyBox(panel, box); this.onChange(panel.id, panel.placement, "commit");
    });
    this.addHandle(registration.id, registration.handle);
  }

  addHandle(id: string, node: HTMLElement): void {
    const panel = this.panels.get(id);
    if (!panel || panel.handles.some(handle => handle.node === node) || node.ownerDocument !== this.doc) return;
    const state: HandleState = { node, title: node.getAttribute("title"), tabIndex: node.getAttribute("tabindex"),
      marker: node.getAttribute("data-pl-panel-handle"), hadClass: node.classList.contains("pl-panel-handle"), hadClassAttribute: node.hasAttribute("class"),
      down: event => this.begin(panel, node, event, false),
      key: event => this.handleKey(panel, node, event),
      double: event => {
        if (event.button !== 0 || !this.isHandleTarget(node, event.target)) return;
        event.preventDefault(); event.stopPropagation(); this.toggle(panel);
      },
      context: event => {
        if (!this.isHandleTarget(node, event.target)) return;
        event.preventDefault(); event.stopPropagation(); this.openMenu(panel, node, event.clientX, event.clientY);
      }
    };
    node.classList.add("pl-panel-handle"); node.setAttribute("data-pl-panel-handle", id);
    node.title = `${panel.label}: drag to move; double-click to float or dock; right-click for layout options.`;
    if (!node.matches(INTERACTIVE) && !node.hasAttribute("tabindex")) node.tabIndex = 0;
    node.addEventListener("pointerdown", state.down); node.addEventListener("keydown", state.key);
    node.addEventListener("dblclick", state.double); node.addEventListener("contextmenu", state.context);
    panel.handles.push(state);
  }

  removePanel(id: string): void {
    const panel = this.panels.get(id); if (!panel) return;
    if (this.gesture?.panel === panel) this.cancel();
    if (this.menu?.dataset.plPanelMenu === id) this.closeMenu(false);
    for (const handle of panel.handles) {
      handle.node.removeEventListener("pointerdown", handle.down); handle.node.removeEventListener("keydown", handle.key);
      handle.node.removeEventListener("dblclick", handle.double); handle.node.removeEventListener("contextmenu", handle.context);
      if (!handle.hadClass) handle.node.classList.remove("pl-panel-handle");
      if (!handle.hadClassAttribute && !handle.node.className) handle.node.removeAttribute("class");
      this.restoreAttribute(handle.node, "title", handle.title); this.restoreAttribute(handle.node, "tabindex", handle.tabIndex);
      this.restoreAttribute(handle.node, "data-pl-panel-handle", handle.marker);
    }
    panel.resize.remove(); this.restoreAttribute(panel.element, "data-pl-panel-placement", panel.originalPlacement);
    panel.element.classList.toggle("pl-floating-panel", panel.originalFloating);
    panel.element.classList.toggle("pl-panel-hidden", panel.originalHidden);
    panel.element.classList.toggle("pl-panel-dragging", panel.originalDragging);
    if (!panel.hadClassAttribute && !panel.element.className) panel.element.removeAttribute("class");
    for (const style of panel.styles) {
      if (style.value) panel.element.style.setProperty(style.name, style.value, style.priority);
      else panel.element.style.removeProperty(style.name);
    }
    if (!panel.hadStyle && !panel.element.style.cssText) panel.element.removeAttribute("style");
    this.panels.delete(id);
  }

  getPlacement(id: string): PanelPlacement | undefined { return this.panels.get(id)?.placement; }
  /** Includes activation and queued frames, before any transient styles paint. */
  isInteracting(): boolean { return this.gesture?.started ?? false; }
  isFloating(id: string): boolean { return this.getPlacement(id) === "floating"; }
  isHidden(id: string): boolean { return this.panels.get(id)?.hidden ?? false; }
  hidePanel(id: string): void {
    const panel = this.panels.get(id); if (!panel || panel.hidden) return;
    if (this.gesture?.panel === panel) this.cancel();
    this.setHidden(panel, true); this.onChange(id, panel.placement, "visibility");
  }
  showPanel(id: string, activate = false): void {
    const panel = this.panels.get(id); if (!panel) return;
    if (activate) panel.onActivate?.();
    if (this.panels.get(id) !== panel || !panel.element.isConnected || !panel.hidden) return;
    this.setHidden(panel, false);
    if (!this.activatingPlacement) this.onChange(id, panel.placement, "visibility");
  }
  bringToFront(id: string): void {
    const panel = this.panels.get(id); if (!panel || panel.placement !== "floating") return;
    this.raise(panel); this.onChange(id, "floating", "geometry");
  }
  floatPanel(id: string, requested?: PanelBox, activate = true): void {
    const panel = this.panels.get(id); if (!panel) return;
    if (activate) this.activateForPlacement(panel);
    if (this.panels.get(id) !== panel || !panel.element.isConnected) return;
    if (activate) this.setHidden(panel, false);
    const box = this.validBox(requested) ? requested : panel.box ?? this.initialBox(panel);
    panel.placement = "floating"; panel.element.classList.add("pl-floating-panel");
    panel.element.setAttribute("data-pl-panel-placement", "floating"); panel.resize.hidden = false;
    this.applyBox(panel, box); this.raise(panel); this.onChange(id, "floating", "placement");
  }
  dockPanel(id: string, placement: PanelDock = "main", activate = true, operation:PanelDropOperation={kind:"merge",dock:placement}): void {
    const panel = this.panels.get(id); if (!panel || !this.allowed(panel).includes(placement)) return;
    if(activate&&panel.canDrop&&!panel.canDrop(operation))return;
    if (activate) this.activateForPlacement(panel);
    if (this.panels.get(id) !== panel || !panel.element.isConnected) return;
    if (activate) this.setHidden(panel, false);
    panel.placement = placement; panel.element.classList.remove("pl-floating-panel"); panel.resize.hidden = true;
    panel.element.setAttribute("data-pl-panel-placement", placement);
    this.onChange(id, placement, "placement", operation);
  }
  snapshot(): PanelLayoutSnapshot {
    return { panels: [...this.panels.values()].map(panel => {
      // A native redraw must restore the committed layout, not a half-finished drag.
      const state = this.gesture?.panel === panel ? this.gesture.before : panel;
      return { id: panel.id, placement: state.placement, ...(state.box ? { box: { ...state.box } } : {}), ...(state.hidden ? { hidden: true } : {}) };
    }) };
  }
  restoreSnapshot(snapshot: PanelLayoutSnapshot): void {
    for (const state of snapshot.panels) {
      const panel = this.panels.get(state.id); if (!panel) continue;
      if (this.validBox(state.box)) this.applyBox(panel, state.box);
      if (state.placement === "floating") this.floatPanel(state.id, this.validBox(state.box) ? state.box : undefined, false);
      else if (DOCKS.includes(state.placement)) this.dockPanel(state.id, state.placement, false);
      if (state.hidden === true) this.hidePanel(state.id); else this.showPanel(state.id);
    }
  }
  reset(): void {
    this.cancelGesture(false); this.closeMenu(false);
    for (const panel of this.panels.values()) {
      panel.box = undefined; panel.placement = panel.defaultDock;
      this.setHidden(panel, false);
      panel.element.classList.remove("pl-floating-panel"); panel.resize.hidden = true;
      panel.element.setAttribute("data-pl-panel-placement", panel.defaultDock);
    }
    this.onChange("", "main", "reset");
  }
  cancelActiveDrag(): void { this.cancel(); }
  restore(): void {
    if (this.disposed) return;
    this.cancel(); this.closeMenu(false);
    for (const id of [...this.panels.keys()]) this.removePanel(id);
    this.doc.removeEventListener("pointermove", this.move); this.doc.removeEventListener("pointerup", this.up);
    this.doc.removeEventListener("pointercancel", this.cancelPointer); this.doc.removeEventListener("keydown", this.escape, true);
    this.doc.removeEventListener("pointerdown", this.outside, true); this.doc.removeEventListener("click", this.suppressClick, true);
    this.doc.defaultView?.removeEventListener("resize", this.viewportResize); this.doc.defaultView?.removeEventListener("blur", this.cancel);
    this.disposed = true;
  }

  private allowed(panel: Panel): readonly PanelDock[] { return panel.allowedDocks?.filter(dock => DOCKS.includes(dock)) ?? DOCKS; }
  private activateForPlacement(panel: Panel): void {
    // Navigation may reveal a closed pane. Do not announce its OLD dock while
    // an explicit float/dock/drag is still deciding the intended placement.
    this.activatingPlacement++;
    try { panel.onActivate?.(); } finally { this.activatingPlacement--; }
  }
  private setHidden(panel: Panel, hidden: boolean): void {
    panel.hidden = hidden; panel.element.classList.toggle("pl-panel-hidden", hidden);
  }
  private restoreAttribute(node: HTMLElement, name: string, value: string | null): void {
    if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
  }
  private isHandleTarget(handle: HTMLElement, target: EventTarget | null): boolean {
    if (!(target instanceof Element) || !handle.contains(target)) return false;
    // Native Help lives inside some module headers. Its text and scrollable
    // body remain an independent surface, even when they contain no controls.
    const surface = target.closest(HEADER_SURFACES);
    if (surface && handle.contains(surface)) return false;
    const nearestHandle = target.closest("[data-pl-panel-handle]");
    if (nearestHandle && nearestHandle !== handle) return false;
    const interactive = target.closest(INTERACTIVE);
    return !interactive || interactive === handle;
  }
  private handleKey(panel: Panel, handle: HTMLElement, event: KeyboardEvent): void {
    if (!this.isHandleTarget(handle, event.target)) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault(); event.stopPropagation();
      const box = handle.getBoundingClientRect(); this.openMenu(panel, handle, box.left, box.bottom); return;
    }
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const destinations: Record<string, PanelDock> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "main" };
    if (event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault(); event.stopPropagation(); this.toggle(panel);
    } else if (!event.shiftKey && destinations[event.key] && this.allowed(panel).includes(destinations[event.key])) {
      event.preventDefault(); event.stopPropagation(); this.dockPanel(panel.id, destinations[event.key]);
    }
  }
  private toggle(panel: Panel): void {
    if (panel.placement === "floating") this.dockPanel(panel.id, panel.defaultDock); else this.floatPanel(panel.id);
  }
  private begin(panel: Panel, source: HTMLElement, event: PointerEvent, resize: boolean): void {
    if (this.gesture || event.button !== 0 || event.isPrimary === false || !panel.element.isConnected || !this.isHandleTarget(source, event.target)) return;
    if (resize && panel.placement !== "floating") return;
    this.closeMenu(false);
    const original = { ...(panel.placement === "floating" && panel.box ? panel.box : this.initialBox(panel)) };
    const direct = panel.element.contains(source) && !panel.hidden;
    const bounds = panel.placement === "floating" && panel.box ? panel.box : panel.element.getBoundingClientRect();
    this.gesture = { panel, pointerId: event.pointerId, source, startX: event.clientX, startY: event.clientY,
      original, resize, started: false,
      offsetX: direct ? Math.max(0, Math.min(event.clientX - bounds.left, original.width)) : Math.min(original.width / 2, 120),
      offsetY: direct ? Math.max(0, Math.min(event.clientY - bounds.top, original.height)) : 22,
      before: { placement: panel.placement, box: panel.box ? { ...panel.box } : undefined, hidden: panel.hidden,
        dragging: panel.element.classList.contains("pl-panel-dragging"), resizeHidden: panel.resize.hidden,
        styles: BOX_PROPERTIES.map(name => ({ name, value: panel.element.style.getPropertyValue(name), priority: panel.element.style.getPropertyPriority(name) })) },
      // Leaving a dock can resize the workspace. Its targets stay still throughout this gesture.
      targets: resize ? [] : this.captureTargets(panel),legacyTargets:!panel.getDropTargets };
  }
  private move = (event: PointerEvent): void => {
    const gesture = this.gesture; if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!gesture.panel.element.isConnected || !gesture.source.isConnected) { this.cancel(); return; }
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
    if (!gesture.started && Math.hypot(dx, dy) < 6) return;
    event.preventDefault();
    if (!gesture.started) {
      gesture.started = true;
      if (!gesture.resize) this.activateForPlacement(gesture.panel);
      if (this.gesture !== gesture || !gesture.panel.element.isConnected || !gesture.source.isConnected) { this.cancel(); return; }
      try { gesture.source.setPointerCapture(event.pointerId); } catch { /* Unsupported or cancelled pointer. */ }
      if (!gesture.resize) {
        const panel = gesture.panel;
        this.setHidden(panel, false); panel.placement = "floating";
        panel.element.classList.add("pl-floating-panel", "pl-panel-dragging");
        panel.element.setAttribute("data-pl-panel-placement", "floating"); panel.resize.hidden = true;
        this.raise(panel); this.createDragTargets(gesture);
      }
    }
    // Pointer devices can emit several events per display frame. Keep only the
    // latest position so projection/layout work runs at the browser's paint rate.
    this.dragPoint = { x: event.clientX, y: event.clientY };
    if (this.dragFrame !== null) return;
    const view = this.doc.defaultView;
    if (!view) { this.renderDrag(); return; }
    this.dragFrame = view.requestAnimationFrame(() => {
      this.dragFrame = null;
      this.renderDrag();
    });
  };
  private renderDrag(): void {
    const gesture = this.gesture, point = this.dragPoint;
    this.dragPoint = null;
    if (!gesture?.started || !point) return;
    if (!gesture.panel.element.isConnected || !gesture.source.isConnected) { this.cancel(); return; }
    if (gesture.resize) {
      this.applyBox(gesture.panel, { ...gesture.original,
        width: gesture.original.width + point.x - gesture.startX,
        height: gesture.original.height + point.y - gesture.startY });
    } else {
      // A tall/wide panel must still follow the grabbed point. Constraining its
      // position during movement makes it feel stuck against the viewport edge.
      // The final floating placement is bounded again by floatPanel on release.
      this.applyBox(gesture.panel, { ...gesture.original, left: point.x - gesture.offsetX, top: point.y - gesture.offsetY }, false);
    }
    this.onChange(gesture.panel.id, "floating", "drag");
    if (this.gesture === gesture && !gesture.resize) this.showTarget(gesture, this.dockAt(gesture, point.x, point.y));
  }
  private clearDragFrame(): void {
    if (this.dragFrame !== null) this.doc.defaultView?.cancelAnimationFrame(this.dragFrame);
    this.dragFrame = null; this.dragPoint = null;
  }
  private up = (event: PointerEvent): void => {
    const gesture = this.gesture; if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!gesture.panel.element.isConnected || !gesture.source.isConnected) { this.cancel(); return; }
    if (gesture.started) {
      this.clickSuppression = { node: gesture.source, until: Date.now() + 500 };
      // A release may arrive before the pending frame, or at a newer position.
      // Commit that exact position synchronously and leave no delayed writes.
      this.clearDragFrame();
      this.dragPoint = { x: event.clientX, y: event.clientY }; this.renderDrag();
      if (this.gesture !== gesture) return;
      if (!gesture.resize) {
        const target = this.dockAt(gesture, event.clientX, event.clientY);
        if(target&&gesture.panel.canDrop&&!gesture.panel.canDrop(target.operation)){this.cancel();return;}
        this.finishGesture();
        if (target) this.dockPanel(gesture.panel.id, target.operation.dock, false, target.operation);
        else this.floatPanel(gesture.panel.id, { ...gesture.original,
          left: event.clientX - gesture.offsetX, top: event.clientY - gesture.offsetY }, false);
      } else {
        this.finishGesture();
        this.onChange(gesture.panel.id, "floating", "commit");
      }
    }
    this.finishGesture();
  };
  private cancelPointer = (event: PointerEvent): void => { if (event.pointerId === this.gesture?.pointerId) this.cancel(); };
  private cancel = (): void => { this.cancelGesture(); };
  private cancelGesture(notify = true): void {
    const gesture = this.gesture;
    if (gesture?.started) {
      const panel = gesture.panel, state = gesture.before;
      panel.placement = state.placement; panel.box = state.box ? { ...state.box } : undefined;
      this.setHidden(panel, state.hidden);
      panel.element.classList.toggle("pl-floating-panel", state.placement === "floating");
      panel.element.setAttribute("data-pl-panel-placement", state.placement); panel.resize.hidden = state.resizeHidden;
      for (const style of state.styles) {
        if (style.value) panel.element.style.setProperty(style.name, style.value, style.priority);
        else panel.element.style.removeProperty(style.name);
      }
      this.clickSuppression = { node: gesture.source, until: Date.now() + 500 };
    }
    this.finishGesture();
    if (notify && gesture?.started && gesture.panel.element.isConnected) this.onChange(gesture.panel.id, gesture.panel.placement, "geometry");
  }
  private finishGesture(): void {
    this.clearDragFrame();
    const gesture = this.gesture; if (!gesture) return;
    gesture.panel.element.classList.toggle("pl-panel-dragging", gesture.before.dragging);
    gesture.overlay?.remove();
    try { gesture.source.releasePointerCapture(gesture.pointerId); } catch { /* No active capture. */ }
    this.gesture = null;
  }
  private createDragTargets(gesture: Gesture): void {
    const overlay = this.doc.createElement("div"); overlay.className = "pl-panel-drop-overlay";
    overlay.setAttribute(OWNED, ""); overlay.setAttribute("aria-hidden", "true");
    this.doc.body.append(overlay); gesture.overlay = overlay;
  }
  private showTarget(gesture: Gesture, target: PanelDropTarget | undefined): void {
    if (gesture.target === target) return;
    gesture.target = target; gesture.overlay?.replaceChildren();
    if (!target || !gesture.overlay) return;
    const preview = this.doc.createElement("div"); preview.className = "pl-panel-drop-preview";
    preview.dataset.plDockTarget = target.operation.dock;
    preview.dataset.plDropOperation = target.operation.kind;
    if (!gesture.legacyTargets) {
      const label=this.doc.createElement("span");label.className="pl-panel-drop-label";
      label.textContent=target.operation.kind==="split"?`Split ${target.operation.dock}`:"Group tabs";
      preview.append(label);
    }
    const box = target.preview;
    Object.assign(preview.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    gesture.overlay.append(preview);
  }
  private captureTargets(panel: Panel): PanelDropTarget[] {
    const supplied = panel.getDockTargets?.(), targets:PanelDropTarget[]=[];
    const candidates=panel.getDropTargets?.()||HIT_PRIORITY.filter(dock=>this.allowed(panel).includes(dock)).map(dock=>({...(supplied?supplied[dock]:this.defaultTarget(dock)),operation:{kind:"merge" as const,dock}}));
    for (const target of candidates) {
      if(!target?.operation||!this.allowed(panel).includes(target.operation.dock)||!["merge","split"].includes(target.operation.kind))continue;
      if (!target || !this.validBox(target.hit) || !this.validBox(target.preview) || target.hit.width <= 0 || target.hit.height <= 0 || target.preview.width <= 0 || target.preview.height <= 0) continue;
      // Copy both boxes: a workspace callback may reuse objects during reflow.
      targets.push({hit:{...target.hit},preview:{...target.preview},operation:{...target.operation}});
    }
    return targets;
  }
  private defaultTarget(dock: PanelDock): PanelDockTarget {
    const viewport = this.viewport(); const host = this.host.getBoundingClientRect();
    const left = Math.max(12, Math.min(host.left, viewport.width - 48));
    const top = Math.max(12, Math.min(host.top, viewport.height - 48));
    const width = Math.max(24, Math.min(host.width || viewport.width - 24, viewport.width - left - 12));
    const height = Math.max(24, Math.min(host.height || viewport.height - 24, viewport.height - top - 12));
    if (dock === "left") return { hit: { left, top, width: width * .25, height }, preview: { left, top, width: width * .42, height } };
    if (dock === "right") return { hit: { left: left + width * .75, top, width: width * .25, height }, preview: { left: left + width * .58, top, width: width * .42, height } };
    return { hit: { left: left + width * .34, top: top + height * .3, width: width * .32, height: height * .28 }, preview: { left, top, width, height } };
  }
  private dockAt(gesture: Gesture, x: number, y: number): PanelDropTarget | undefined {
    const contains = (target: PanelDropTarget, margin = 0): boolean => {
      const box = target.hit;
      return !!box && x >= box.left - margin && x <= box.left + box.width + margin && y >= box.top - margin && y <= box.top + box.height + margin;
    };
    // Side destinations win over a main workspace that overlaps them. Keep an
    // active side steady at its edge instead of flickering into the main pane.
    const side = gesture.legacyTargets?gesture.targets.find(target=>target.operation.dock!=="main"&&contains(target)):gesture.targets.find(target => target.operation.kind==="split"&&contains(target));
    if (side) return side;
    // Retain an edge while moving a few pixels sideways, but never carry a
    // body split into the tab strip above it: that strip is for grouping/order.
    const current=gesture.target;
    const withinSplitHeight=!current||gesture.legacyTargets||current.operation.kind!=="split"
      ||(y>=current.hit.top&&y<=current.hit.top+current.hit.height);
    if (current && withinSplitHeight && contains(current, 12)) return current;
    return gesture.targets.find(target=>contains(target));
  }
  private initialBox(panel: Panel): PanelBox {
    const rect = panel.element.getBoundingClientRect(), viewport = this.viewport();
    return this.bound({ left: Math.max(32, rect.left), top: Math.max(32, rect.top), width: rect.width || Math.min(600, viewport.width * .65), height: rect.height || Math.min(520, viewport.height * .7) });
  }
  private validBox(box: PanelBox | undefined): box is PanelBox { return !!box && [box.left, box.top, box.width, box.height].every(Number.isFinite); }
  private viewport(): { width: number; height: number } {
    return { width: Math.max(48, this.doc.defaultView?.innerWidth ?? 1024), height: Math.max(48, this.doc.defaultView?.innerHeight ?? 768) };
  }
  private bound(box: PanelBox): PanelBox {
    const viewport = this.viewport(), maxWidth = viewport.width - 24, maxHeight = viewport.height - 24;
    const width = Math.max(Math.min(280, maxWidth), Math.min(box.width, maxWidth));
    const height = Math.max(Math.min(180, maxHeight), Math.min(box.height, maxHeight));
    return { left: Math.max(12, Math.min(box.left, viewport.width - width - 12)), top: Math.max(12, Math.min(box.top, viewport.height - height - 12)), width, height };
  }
  private applyBox(panel: Panel, requested: PanelBox, constrainPosition = true): void {
    panel.box = this.bound(requested);
    if (!constrainPosition) { panel.box.left = requested.left; panel.box.top = requested.top; }
    for (const key of ["left", "top", "width", "height"] as const) {
      const name = `--pl-panel-${key}`, value = `${panel.box[key]}px`;
      if (panel.element.style.getPropertyValue(name) !== value) panel.element.style.setProperty(name, value);
    }
  }
  private raise(panel: Panel): void {
    if (this.layer >= 79) {
      const floating = [...this.panels.values()].filter(item => item.placement === "floating").sort((a, b) =>
        Number(a.element.style.getPropertyValue("--pl-panel-z")) - Number(b.element.style.getPropertyValue("--pl-panel-z")));
      this.layer = 0;
      for (const item of floating) item.element.style.setProperty("--pl-panel-z", String(130 + this.layer++));
    }
    panel.element.style.setProperty("--pl-panel-z", String(130 + this.layer++));
  }
  private viewportResize = (): void => {
    this.cancel(); this.closeMenu(false);
    for (const panel of this.panels.values()) if (panel.placement === "floating" && panel.box) {
      this.applyBox(panel, panel.box); this.onChange(panel.id, "floating", "geometry");
    }
  };
  private suppressClick = (event: MouseEvent): void => {
    if (this.gesture?.started) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const suppression = this.clickSuppression;
    if (!suppression || suppression.until < Date.now()) { this.clickSuppression = null; return; }
    if (this.isHandleTarget(suppression.node, event.target)) {
      event.preventDefault(); event.stopImmediatePropagation(); this.clickSuppression = null;
    }
  };
  private outside = (event: PointerEvent): void => {
    if (this.gesture?.started) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (this.menu && event.target instanceof Node && !this.menu.contains(event.target)) this.closeMenu(false);
    if (event.target instanceof Node) for (const panel of this.panels.values()) {
      if (panel.placement === "floating" && panel.element.contains(event.target)) {
        // A drag raises the panel only once it passes its threshold; cancellation restores its old layer.
        if (panel.handles.some(handle => this.isHandleTarget(handle.node, event.target)) || event.target === panel.resize) continue;
        this.raise(panel); this.onChange(panel.id, "floating", "geometry");
      }
    }
  };
  private escape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || (!this.gesture && !this.menu)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (this.gesture) this.cancel(); else this.closeMenu(true);
  };
  private openMenu(panel: Panel, trigger: HTMLElement, x: number, y: number): void {
    this.cancel(); this.closeMenu(false);
    const menu = this.doc.createElement("div"); menu.className = "pl-panel-layout-menu"; menu.dataset.plPanelMenu = panel.id;
    menu.setAttribute(OWNED, ""); menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", `${panel.label} layout`);
    const add = (label: string, action: () => void, current = false) => {
      const button = this.doc.createElement("button"); button.type = "button"; button.textContent = label;
      button.setAttribute("role", "menuitemradio"); button.setAttribute("aria-checked", String(current));
      button.addEventListener("click", () => { this.closeMenu(true); action(); }); menu.append(button);
    };
    add("Float panel", () => this.floatPanel(panel.id), panel.placement === "floating");
    for (const dock of this.allowed(panel)) add(`Dock: ${LABELS[dock]}`, () => this.dockPanel(panel.id, dock), panel.placement === dock);
    add(panel.hidden ? "Show panel" : "Hide panel", () => panel.hidden ? this.showPanel(panel.id, true) : this.hidePanel(panel.id));
    const visibility = menu.lastElementChild!; visibility.setAttribute("role", "menuitem"); visibility.removeAttribute("aria-checked");
    add("Reset layout", () => this.reset());
    const reset = menu.lastElementChild!; reset.setAttribute("role", "menuitem"); reset.removeAttribute("aria-checked");
    menu.addEventListener("keydown", event => {
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>("button")], index = buttons.indexOf(this.doc.activeElement as HTMLButtonElement);
      if (event.key === "Tab") { this.closeMenu(true); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus({ preventScroll: true });
    });
    const viewport = this.viewport();
    menu.style.left = `${Math.max(12, Math.min(x, viewport.width - 244))}px`;
    menu.style.top = `${Math.max(12, Math.min(y, viewport.height - 300))}px`;
    this.doc.body.append(menu); this.menu = menu; this.menuTrigger = trigger;
    menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }
  private closeMenu(focus: boolean): void {
    const trigger = this.menuTrigger; this.menu?.remove(); this.menu = null; this.menuTrigger = null;
    if (focus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
}
