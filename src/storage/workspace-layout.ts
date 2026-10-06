import type { PanelLayoutSnapshot } from "../content/panel-layout";
import { migrateLegacyGroups, normalizeWorkspaceGroups, WORKSPACE_PANEL_IDS, type WorkspaceGroups } from "../content/workspace-groups";
import { WORKSPACE_PRESETS, type WorkspacePresetId } from "../content/workspace-presets";

export const WORKSPACE_LAYOUT_KEY = "plannerLift.workspace.v2";
export const LEGACY_WORKSPACE_LAYOUT_KEY = "plannerLift.workspace.v1";
const PANEL_IDS = ["classes", "find", "optimizer", "study", "personal", "schedule", "details"] as const;
const MODULE_IDS = ["classes", "find", "optimizer", "study", "personal", "information"] as const;
const PANE_IDS = ["plannerSectionClip", "plannerSectionCal", "classSearchTitle"] as const;
export type WorkspaceModule = typeof MODULE_IDS[number];

/** Presentation only: no course ids, plan ids, text, selections or native values. */
export interface WorkspaceLayoutPreference extends PanelLayoutSnapshot {
  version: 2;
  groups: WorkspaceGroups;
  module: WorkspaceModule;
  mainModule: WorkspaceModule;
  navigationCollapsed: boolean;
  scheduleWidth: number | null;
  scheduleExpanded: boolean;
  dockSizes: Partial<Record<"left" | "right", number>>;
  collapsedPanes: string[];
  /** Optional public preset id; ratios adapt to the available viewport. */
  layoutPreset: WorkspacePresetId | null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const bounded = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : null;
const moduleId = (value: unknown): WorkspaceModule => MODULE_IDS.includes(value as WorkspaceModule) ? value as WorkspaceModule : "classes";

/** Rebuild the schema from an allowlist on both read and write. */
export function normalizeWorkspaceLayout(value: unknown): WorkspaceLayoutPreference | null {
  const candidate = record(value);
  if (!candidate || (candidate.version !== 1 && candidate.version !== 2) || !Array.isArray(candidate.panels)) return null;
  const panels: PanelLayoutSnapshot["panels"] = [], seen = new Set<string>();
  const occupied = new Set<string>();
  for (const value of candidate.panels.slice(0, 32)) {
    const panel = record(value);
    if (!panel || !PANEL_IDS.includes(panel.id as never) || seen.has(panel.id as string)) continue;
    const id = panel.id as string;
    let placement = panel.placement;
    if (!["main", "left", "right", "floating"].includes(placement as string) || (candidate.version===1 && id === "schedule" && placement === "main") || (id === "details" && placement !== "main" && placement !== "floating")) continue;
    // Invalid overlapping saved docks must never make a module unreachable.
    if (candidate.version===1 && panel.hidden !== true && (placement === "left" || placement === "right")) {
      if (occupied.has(placement)) placement = id === "schedule" ? "floating" : "main";
      else occupied.add(placement);
    }
    const source = record(panel.box);
    const left = bounded(source?.left, 0, 32768), top = bounded(source?.top, 0, 32768);
    const width = bounded(source?.width, 120, 16384), height = bounded(source?.height, 80, 16384);
    const box = left !== null && top !== null && width !== null && height !== null ? {left, top, width, height} : undefined;
    panels.push({id, placement: placement as PanelLayoutSnapshot["panels"][number]["placement"], ...(box ? {box} : {}), hidden: panel.hidden === true});
    seen.add(id);
  }
  const groups=candidate.version===1?migrateLegacyGroups({...candidate,panels}):normalizeWorkspaceGroups(candidate.groups);
  if(!groups)return null;
  // Group membership is authoritative. Geometry remains bounded per public
  // panel; projected Details keeps its separate, existing snapshot contract.
  for(const id of WORKSPACE_PANEL_IDS){
    let panel=panels.find(panel=>panel.id===id);
    if(!panel){panel={id,placement:groups.panels[id].placement};panels.push(panel);}
    panel.placement=groups.panels[id].placement;panel.hidden=!groups.panels[id].open;
  }
  const sizes = record(candidate.dockSizes), left = bounded(sizes?.left, 200, 16384), right = bounded(sizes?.right, 200, 16384);
  return {
    version: 2, groups, panels, module: moduleId(candidate.module), mainModule: moduleId(candidate.mainModule),
    layoutPreset: WORKSPACE_PRESETS.find(preset => preset.id === candidate.layoutPreset)?.id ?? null,
    navigationCollapsed: candidate.navigationCollapsed === true,
    scheduleWidth: bounded(candidate.scheduleWidth, 420, 16384), scheduleExpanded: candidate.scheduleExpanded === true,
    dockSizes: {...(left === null ? {} : {left}), ...(right === null ? {} : {right})},
    collapsedPanes: Array.isArray(candidate.collapsedPanes) ? [...new Set(candidate.collapsedPanes.filter((id): id is string => PANE_IDS.includes(id as never)))] : []
  };
}

export async function readWorkspaceLayout(): Promise<WorkspaceLayoutPreference | null> {
  if (!globalThis.chrome?.storage?.local) return null;
  try {
    const stored = await chrome.storage.local.get(WORKSPACE_LAYOUT_KEY);
    const current=record(stored[WORKSPACE_LAYOUT_KEY]);
    if(current?.version===2){const normalized=normalizeWorkspaceLayout(current);if(normalized)return normalized;}
    const legacy=await chrome.storage.local.get(LEGACY_WORKSPACE_LAYOUT_KEY);
    const previous=record(legacy[LEGACY_WORKSPACE_LAYOUT_KEY]);
    return previous?.version===1?normalizeWorkspaceLayout(previous):null;
  } catch { return null; }
}

let writes: Promise<void> = Promise.resolve();
/** Serialize committed changes so a slow earlier write cannot undo Default layout. */
export function saveWorkspaceLayout(value: WorkspaceLayoutPreference): Promise<void> {
  const preference = normalizeWorkspaceLayout(value);
  if (value?.version!==2 || !preference || !globalThis.chrome?.storage?.local) return Promise.resolve();
  writes = writes.then(async () => {
    try { await chrome.storage.local.set({[WORKSPACE_LAYOUT_KEY]: preference}); } catch { /* Private/offline contexts may deny storage. */ }
  });
  return writes;
}
