import type { PanelDock, PanelPlacement } from "./panel-layout";

/** Public UI identifiers only. Details and Information keep their native hosts. */
export const WORKSPACE_PANEL_IDS = ["classes", "find", "optimizer", "study", "personal", "schedule"] as const;
export type WorkspacePanelId = typeof WORKSPACE_PANEL_IDS[number];
export const WORKSPACE_DOCKS = ["left", "main", "right"] as const;
export const WORKSPACE_GROUP_GAP = 12;
export const WORKSPACE_MAX_DOCK_GROUPS = 2;

export interface WorkspaceGroups {
  version: 1;
  /** A bounded ordering of public tabs, including closed tabs for reopening. */
  order: WorkspacePanelId[];
  panels: Record<WorkspacePanelId, {placement: PanelPlacement; open: boolean}>;
  active: Record<PanelDock, WorkspacePanelId | null>;
}

/** Floors concern a pane's useful content, rather than a decorative column. */
export const WORKSPACE_PANEL_MIN_WIDTH: Readonly<Record<WorkspacePanelId, number>> = {
  classes: 420, find: 560, optimizer: 480, study: 480, personal: 420, schedule: 420
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const isWorkspacePanelId = (value: unknown): value is WorkspacePanelId => WORKSPACE_PANEL_IDS.includes(value as WorkspacePanelId);
const isDock = (value: unknown): value is PanelDock => WORKSPACE_DOCKS.includes(value as PanelDock);
const isPlacement = (value: unknown): value is PanelPlacement => isDock(value) || value === "floating";

export function createDefaultGroups(): WorkspaceGroups {
  return {
    version: 1, order: [...WORKSPACE_PANEL_IDS],
    panels: {
      classes: {placement:"main",open:true}, find: {placement:"main",open:true},
      optimizer: {placement:"main",open:false}, study: {placement:"main",open:false}, personal: {placement:"main",open:false},
      schedule: {placement:"right",open:true}
    },
    active: {left:null,main:"classes",right:"schedule"}
  };
}

export function openGroupTabs(state: WorkspaceGroups, dock: PanelDock): WorkspacePanelId[] {
  return state.order.filter(id => state.panels[id].open && state.panels[id].placement === dock);
}

export function activeGroupTab(state: WorkspaceGroups, dock: PanelDock): WorkspacePanelId | null {
  const tabs = openGroupTabs(state, dock), active = state.active[dock];
  return active && tabs.includes(active) ? active : tabs[0] || null;
}

function settleActive(state: WorkspaceGroups): WorkspaceGroups {
  for (const dock of WORKSPACE_DOCKS) state.active[dock] = activeGroupTab(state, dock);
  return state;
}

export function visibleDockGroups(state: WorkspaceGroups): PanelDock[] {
  return WORKSPACE_DOCKS.filter(dock=>openGroupTabs(state,dock).length);
}

function browsingDock(state: WorkspaceGroups): PanelDock {
  const occupied=visibleDockGroups(state);
  for(const id of ['classes','find'] as const){const dock=state.panels[id].placement;if(isDock(dock)&&occupied.includes(dock))return dock;}
  return occupied.find(dock=>openGroupTabs(state,dock).some(id=>id!=='schedule'))||occupied[0]||'main';
}

/** A legacy third column becomes another browsing tab rather than a thin pane. */
function limitDockGroups(state: WorkspaceGroups): WorkspaceGroups {
  const occupied=visibleDockGroups(state);if(occupied.length<=WORKSPACE_MAX_DOCK_GROUPS)return settleActive(state);
  const browsing=browsingDock(state),schedule=state.panels.schedule;
  const other=schedule.open&&isDock(schedule.placement)&&schedule.placement!==browsing?schedule.placement:occupied.find(dock=>dock!==browsing);
  for(const dock of occupied)if(dock!==browsing&&dock!==other){
    const active=state.active[dock];
    for(const id of WORKSPACE_PANEL_IDS)if(state.panels[id].placement===dock)state.panels[id].placement=browsing;
    if(active&&state.panels[active].open)state.active[browsing]=active;
  }
  return settleActive(state);
}

function copy(state: WorkspaceGroups): WorkspaceGroups {
  return {version:1,order:[...state.order],panels:Object.fromEntries(WORKSPACE_PANEL_IDS.map(id=>[id,{...state.panels[id]}])) as WorkspaceGroups["panels"],active:{...state.active}};
}

/** Rebuild from an allowlist: never accept page text, ids, coordinates or controls. */
export function normalizeWorkspaceGroups(value: unknown): WorkspaceGroups | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.panels)) return null;
  const state = createDefaultGroups();
  for (const id of WORKSPACE_PANEL_IDS) {
    const panel = value.panels[id];
    if (isRecord(panel) && isPlacement(panel.placement) && typeof panel.open === "boolean") {
      state.panels[id] = {placement:panel.placement,open:panel.open};
    }
  }
  const order = Array.isArray(value.order) ? value.order.slice(0,32).filter(isWorkspacePanelId) : [];
  state.order = [...new Set([...order,...WORKSPACE_PANEL_IDS])];
  const active = isRecord(value.active) ? value.active : {};
  for (const dock of WORKSPACE_DOCKS) state.active[dock] = isWorkspacePanelId(active[dock]) ? active[dock] : null;
  return limitDockGroups(state);
}

/** Upgrade v0.18.x singleton placements without inventing six visible tabs. */
export function migrateLegacyGroups(value: unknown): WorkspaceGroups {
  const state = createDefaultGroups();
  if (!isRecord(value)) return state;
  const legacy = new Map<WorkspacePanelId,Record<string,unknown>>();
  if (Array.isArray(value.panels)) for (const panel of value.panels.slice(0,32)) {
    if (isRecord(panel) && isWorkspacePanelId(panel.id) && isPlacement(panel.placement) && !legacy.has(panel.id)) legacy.set(panel.id,panel);
  }
  for (const id of WORKSPACE_PANEL_IDS) {
    const panel = legacy.get(id), placement = panel?.placement;
    if (isPlacement(placement)) state.panels[id].placement = placement;
    const selected = value.module === id || value.mainModule === id;
    state.panels[id].open = panel?.hidden !== true && (id === "classes" || id === "find" || id === "schedule" || selected || (isPlacement(placement) && placement !== "main"));
  }
  // Before tab groups, a closed Find pane often retained the default main slot
  // while Classes had moved to an edge. Reopening it should return to browsing,
  // not create an accidental, narrow third column. Explicit v2 splits remain.
  if (legacy.get("find")?.hidden === true && state.panels.find.placement !== "floating" && state.panels.classes.placement !== "floating") {
    state.panels.find.placement = state.panels.classes.placement;
  }
  state.active = {left:null,main:null,right:null};
  for (const selected of [value.mainModule,value.module]) if (isWorkspacePanelId(selected)) {
    const panel = state.panels[selected];
    if (panel.open && isDock(panel.placement)) state.active[panel.placement] = selected;
  }
  return limitDockGroups(state);
}

/** Opening is selection in the remembered group, never an implicit split. */
export function selectWorkspaceTab(state: WorkspaceGroups, id: WorkspacePanelId): WorkspaceGroups {
  if (!isWorkspacePanelId(id)) return state;
  const next = copy(state), panel = next.panels[id]; panel.open = true;
  if(visibleDockGroups(next).length>WORKSPACE_MAX_DOCK_GROUPS)return mergeWorkspaceTab(state,id,browsingDock(state));
  if (isDock(panel.placement)) next.active[panel.placement] = id;
  return settleActive(next);
}

export function closeWorkspaceTab(state: WorkspaceGroups, id: WorkspacePanelId): WorkspaceGroups {
  if (!isWorkspacePanelId(id) || !state.panels[id].open) return state;
  const next = copy(state), placement = next.panels[id].placement;
  if (isDock(placement) && next.active[placement] === id) {
    const tabs = openGroupTabs(state,placement), index = tabs.indexOf(id);
    next.active[placement] = tabs[index+1] || tabs[index-1] || null;
  }
  next.panels[id].open = false;
  return settleActive(next);
}

/** Center drops group tabs in place; original native DOM need not move. */
export function mergeWorkspaceTab(state: WorkspaceGroups, id: WorkspacePanelId, target: PanelDock, index?: number): WorkspaceGroups {
  if (!isWorkspacePanelId(id) || !isDock(target)) return state;
  const next = copy(state); next.panels[id] = {placement:target,open:true};
  if(visibleDockGroups(next).length>WORKSPACE_MAX_DOCK_GROUPS)return state;
  // Drop indices come from the visible tab strip; closed remembered siblings
  // must not shift the insertion point away from the shown indicator.
  const order = next.order.filter(panel=>panel!==id), peers = order.filter(panel=>next.panels[panel].placement===target&&next.panels[panel].open);
  const position = typeof index === "number" && Number.isFinite(index) ? Math.max(0,Math.floor(index)) : peers.length;
  const before = peers[position], after = peers.at(-1);
  order.splice(before?order.indexOf(before):after?order.indexOf(after)+1:order.length,0,id); next.order = order;
  next.active[target] = id;
  return settleActive(next);
}

/** Floating remains one native panel per window in this milestone. */
export function floatWorkspaceTab(state: WorkspaceGroups, id: WorkspacePanelId): WorkspaceGroups {
  if (!isWorkspacePanelId(id)) return state;
  const next = copy(state); next.panels[id] = {placement:"floating",open:true};
  return settleActive(next);
}

export function minimumGroupWidth(state: WorkspaceGroups, dock: PanelDock): number {
  // A tab switch should not squeeze Find into the width of a compact class list.
  return Math.max(0,...openGroupTabs(state,dock).map(id=>WORKSPACE_PANEL_MIN_WIDTH[id]));
}

export function readableGroupWidths(state: WorkspaceGroups, availableWidth: number, preferred: Partial<Record<PanelDock,number>> = {}): Record<PanelDock,number> | null {
  if (!Number.isFinite(availableWidth) || availableWidth < 0) return null;
  const widths: Record<PanelDock,number> = {left:0,main:0,right:0};
  const docks = WORKSPACE_DOCKS.filter(dock=>openGroupTabs(state,dock).length);
  if (!docks.length) return widths;
  if (docks.length>WORKSPACE_MAX_DOCK_GROUPS) return null;
  // At narrow widths a single pane uses the viewport and its native overflow.
  if (docks.length === 1) { widths[docks[0]] = availableWidth; return widths; }
  const usable = availableWidth - WORKSPACE_GROUP_GAP * (docks.length - 1);
  const minimum = docks.reduce((sum,dock)=>sum+minimumGroupWidth(state,dock),0);
  if (usable < minimum) return null;
  const extra = usable-minimum;
  const desired = docks.map(dock=>{
    const value = preferred[dock];
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0,Math.min(32768,value)-minimumGroupWidth(state,dock)) : 0;
  });
  const desiredTotal = desired.reduce((sum,value)=>sum+value,0);
  docks.forEach((dock,index)=>{widths[dock]=minimumGroupWidth(state,dock)+(desiredTotal>extra?desired[index]*extra/desiredTotal:desired[index]+(extra-desiredTotal)/docks.length);});
  return widths;
}

export interface SplitWorkspaceResult { state: WorkspaceGroups; accepted: boolean; reason?: "occupied" | "space" | "limit" | "invalid"; }

/** Edge drops create a separate readable pane, or leave the committed layout. */
export function splitWorkspaceTab(state: WorkspaceGroups, id: WorkspacePanelId, target: PanelDock, availableWidth: number): SplitWorkspaceResult {
  if (!isWorkspacePanelId(id) || !isDock(target)) return {state,accepted:false,reason:"invalid"};
  const proposed=copy(state);
  // Edges describe a position on screen, not a permanently occupied group id.
  // Remove the dragged tab first: splitting its own group or exchanging two
  // singleton panes both leave just one remaining group to place beside it.
  proposed.panels[id]={placement:"floating",open:true};
  if (openGroupTabs(proposed,target).length) {
    if (target==="main" || visibleDockGroups(proposed).length>1) return {state,accepted:false,reason:"occupied"};
    const remaining:PanelDock=target==="left"?"right":"left";
    const active=activeGroupTab(proposed,target);
    // Closed siblings still belong to this group when the user reopens them.
    // Move the whole remaining group without changing its order or selection.
    for(const peer of WORKSPACE_PANEL_IDS) if(proposed.panels[peer].placement===target) proposed.panels[peer].placement=remaining;
    proposed.active[remaining]=active;proposed.active[target]=null;
  }
  proposed.panels[id]={placement:target,open:true};
  if(visibleDockGroups(proposed).length>WORKSPACE_MAX_DOCK_GROUPS)return {state,accepted:false,reason:"limit"};
  const next = mergeWorkspaceTab(proposed,id,target);
  if (!readableGroupWidths(next,availableWidth)) return {state,accepted:false,reason:"space"};
  return {state:next,accepted:true};
}
