import type { PanelDock } from "./panel-layout";
import {
  activeGroupTab, isWorkspacePanelId, WORKSPACE_DOCKS, WORKSPACE_PANEL_IDS,
  type WorkspaceGroups, type WorkspacePanelId
} from "./workspace-groups";

export type WorkspacePresetId = "single" | "balanced" | "browse-wide" | "schedule-wide" | "schedule-left";
export interface WorkspacePresetDiagramPane {
  kind: "browsing" | "schedule" | "tabs";
  /** Fraction of usable content width, excluding the divider. */
  share: number;
}
export interface WorkspacePresetDefinition {
  id: WorkspacePresetId;
  label: string;
  description: string;
  /** Left-to-right visual order; contains public layout labels only. */
  diagram: readonly WorkspacePresetDiagramPane[];
  ratios: Readonly<Partial<Record<PanelDock, number>>>;
}

export const WORKSPACE_PRESETS: readonly WorkspacePresetDefinition[] = [
  {id:"single",label:"One pane",description:"Keep all open tabs together in one full-width pane.",
    diagram:[{kind:"tabs",share:1}],ratios:{main:1}},
  {id:"balanced",label:"Balanced",description:"Browse classes and view the schedule side by side.",
    diagram:[{kind:"browsing",share:.5},{kind:"schedule",share:.5}],ratios:{left:.5,right:.5}},
  {id:"browse-wide",label:"Browse wide",description:"Give classes more room, with the schedule on the right.",
    diagram:[{kind:"browsing",share:.65},{kind:"schedule",share:.35}],ratios:{left:.65,right:.35}},
  {id:"schedule-wide",label:"Schedule wide",description:"Give the schedule more room, with classes on the left.",
    diagram:[{kind:"browsing",share:.35},{kind:"schedule",share:.65}],ratios:{left:.35,right:.65}},
  {id:"schedule-left",label:"Schedule on the left",description:"Keep the schedule on the left and browse classes on the right.",
    diagram:[{kind:"schedule",share:.4},{kind:"browsing",share:.6}],ratios:{left:.4,right:.6}}
];

export interface WorkspacePresetResult {
  state: WorkspaceGroups;
  /** Convert using usable width, then retain existing readable-width floors. */
  ratios: Partial<Record<PanelDock, number>>;
  /** Tab to focus on compact layouts; never a request to activate native UI. */
  active: WorkspacePanelId;
}

function chooseActive(source:WorkspaceGroups,next:WorkspaceGroups,preferred:WorkspacePanelId|undefined,browsingOnly:boolean):WorkspacePanelId {
  const allowed=(id:unknown):id is WorkspacePanelId=>isWorkspacePanelId(id)&&next.panels[id].open&&(!browsingOnly||id!=="schedule");
  // The caller knows which pane was focused when two groups were both visible.
  if(allowed(preferred)&&source.panels[preferred].open)return preferred;
  for(const dock of WORKSPACE_DOCKS){const active=activeGroupTab(source,dock);if(allowed(active))return active;}
  // Each preset guarantees a usable fallback before this function is called.
  return next.order.find(allowed)!;
}

/** Pure presentation transformation. Unknown preset ids make no changes. */
export function applyWorkspacePreset(state:WorkspaceGroups,id:unknown,preferredActive?:WorkspacePanelId):WorkspacePresetResult|null {
  const preset=WORKSPACE_PRESETS.find(preset=>preset.id===id);if(!preset)return null;
  const single=preset.id==="single",browsingDock:PanelDock=single?"main":preset.id==="schedule-left"?"right":"left";
  const scheduleDock:PanelDock=single?"main":browsingDock==="left"?"right":"left";
  const next:WorkspaceGroups={version:1,order:[...state.order],active:{left:null,main:null,right:null},
    panels:Object.fromEntries(WORKSPACE_PANEL_IDS.map(panel=>[panel,{placement:panel==="schedule"?scheduleDock:browsingDock,open:state.panels[panel].open}])) as WorkspaceGroups["panels"]};
  if(single){
    // A schedule-only workspace remains schedule-only. An entirely closed one
    // gets a useful starting tab without opening optional native modules.
    if(!WORKSPACE_PANEL_IDS.some(panel=>next.panels[panel].open))next.panels.classes.open=true;
  }else{
    if(!WORKSPACE_PANEL_IDS.some(panel=>panel!=="schedule"&&next.panels[panel].open)){
      next.panels.classes.open=true;next.panels.find.open=true;
    }
    next.panels.schedule.open=true;
    next.active[scheduleDock]="schedule";
  }
  const active=chooseActive(state,next,preferredActive,!single);next.active[browsingDock]=active;
  return {state:next,ratios:{...preset.ratios},active};
}
