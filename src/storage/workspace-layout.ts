import type { PanelLayoutSnapshot } from "../content/panel-layout";

export const WORKSPACE_LAYOUT_KEY = "plannerLift.workspace.v1";
const PANEL_IDS = ["classes", "find", "optimizer", "study", "personal", "schedule", "details"] as const;
const MODULE_IDS = ["classes", "find", "optimizer", "study", "personal", "information"] as const;
const PANE_IDS = ["plannerSectionClip", "plannerSectionCal", "classSearchTitle"] as const;
export type WorkspaceModule = typeof MODULE_IDS[number];

/** Presentation only: no course ids, plan ids, text, selections or native values. */
export interface WorkspaceLayoutPreference extends PanelLayoutSnapshot {
  version: 1;
  module: WorkspaceModule;
  mainModule: WorkspaceModule;
  navigationCollapsed: boolean;
  scheduleWidth: number | null;
  scheduleExpanded: boolean;
  dockSizes: Partial<Record<"left" | "right", number>>;
  collapsedPanes: string[];
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const bounded = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : null;
const moduleId = (value: unknown): WorkspaceModule => MODULE_IDS.includes(value as WorkspaceModule) ? value as WorkspaceModule : "classes";

/** Rebuild the schema from an allowlist on both read and write. */
export function normalizeWorkspaceLayout(value: unknown): WorkspaceLayoutPreference | null {
  const candidate = record(value);
  if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.panels)) return null;
  const panels: PanelLayoutSnapshot["panels"] = [], seen = new Set<string>();
  const occupied = new Set<string>();
  for (const value of candidate.panels.slice(0, 32)) {
    const panel = record(value);
    if (!panel || !PANEL_IDS.includes(panel.id as never) || seen.has(panel.id as string)) continue;
    const id = panel.id as string;
    let placement = panel.placement;
    if (!["main", "left", "right", "floating"].includes(placement as string) || (id === "schedule" && placement === "main") || (id === "details" && placement !== "main" && placement !== "floating")) continue;
    // Invalid overlapping saved docks must never make a module unreachable.
    if (panel.hidden !== true && (placement === "left" || placement === "right")) {
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
  const sizes = record(candidate.dockSizes), left = bounded(sizes?.left, 200, 16384), right = bounded(sizes?.right, 200, 16384);
  return {
    version: 1, panels, module: moduleId(candidate.module), mainModule: moduleId(candidate.mainModule),
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
    return normalizeWorkspaceLayout(stored[WORKSPACE_LAYOUT_KEY]);
  } catch { return null; }
}

let writes: Promise<void> = Promise.resolve();
/** Serialize committed changes so a slow earlier write cannot undo Default layout. */
export function saveWorkspaceLayout(value: WorkspaceLayoutPreference): Promise<void> {
  const preference = normalizeWorkspaceLayout(value);
  if (!preference || !globalThis.chrome?.storage?.local) return Promise.resolve();
  writes = writes.then(async () => {
    try { await chrome.storage.local.set({[WORKSPACE_LAYOUT_KEY]: preference}); } catch { /* Private/offline contexts may deny storage. */ }
  });
  return writes;
}
