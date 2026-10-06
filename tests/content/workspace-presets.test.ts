import { describe, expect, it } from "vitest";
import {
  closeWorkspaceTab, createDefaultGroups, floatWorkspaceTab, normalizeWorkspaceGroups,
  openGroupTabs, readableGroupWidths, selectWorkspaceTab, visibleDockGroups, WORKSPACE_PANEL_IDS,
  type WorkspaceGroups
} from "../../src/content/workspace-groups";
import { applyWorkspacePreset, WORKSPACE_PRESETS, type WorkspacePresetId } from "../../src/content/workspace-presets";

const closed=()=>WORKSPACE_PANEL_IDS.reduce((state,id)=>closeWorkspaceTab(state,id),createDefaultGroups());
const freeze=(state:WorkspaceGroups)=>{
  state.order=Object.freeze(state.order) as unknown as WorkspaceGroups["order"];
  for(const panel of Object.values(state.panels))Object.freeze(panel);
  Object.freeze(state.panels);Object.freeze(state.active);return Object.freeze(state);
};

describe("workspace layout presets",()=>{
  it("exposes five unique labeled visual choices with complete width shares",()=>{
    expect(WORKSPACE_PRESETS.map(preset=>preset.id)).toEqual(['single','balanced','browse-wide','schedule-wide','schedule-left']);
    for(const preset of WORKSPACE_PRESETS){
      expect(preset.label.length).toBeGreaterThan(0);expect(preset.description.length).toBeGreaterThan(0);
      expect(preset.diagram.length).toBe(preset.id==='single'?1:2);
      expect(preset.diagram.reduce((sum,pane)=>sum+pane.share,0)).toBeCloseTo(1);
      expect(Object.values(preset.ratios).reduce((sum,share)=>sum+share,0)).toBeCloseTo(1);
    }
  });

  it.each(WORKSPACE_PRESETS.map(preset=>preset.id))("applies %s without changing order, closed optional modules or the input",id=>{
    let source=floatWorkspaceTab(selectWorkspaceTab(createDefaultGroups(),'personal'),'find');
    source.order=['personal','find','schedule','study','classes','optimizer'];
    const before=JSON.stringify(source);freeze(source);
    const result=applyWorkspacePreset(source,id,'find')!;
    expect(result.active).toBe('find');expect(result.state.order).toEqual(source.order);
    expect(result.state.panels.optimizer.open).toBe(false);expect(result.state.panels.study.open).toBe(false);
    expect(result.state.panels.personal.open).toBe(true);expect(result.state.panels.find.placement).not.toBe('floating');
    expect(visibleDockGroups(result.state)).toHaveLength(id==='single'?1:2);
    expect(normalizeWorkspaceGroups(result.state)).toEqual(result.state);
    expect(JSON.stringify(source)).toBe(before);expect(result.state.order).not.toBe(source.order);
    for(const panel of WORKSPACE_PANEL_IDS)expect(result.state.panels[panel]).not.toBe(source.panels[panel]);
  });

  it.each([
    ['balanced',.5,.5,'left','right'],['browse-wide',.65,.35,'left','right'],
    ['schedule-wide',.35,.65,'left','right'],['schedule-left',.4,.6,'right','left']
  ] as const)("%s supplies the requested visual arrangement and readable ratios",(id,left,right,browsingDock,scheduleDock)=>{
    const result=applyWorkspacePreset(createDefaultGroups(),id)!;
    expect(result.ratios).toEqual({left,right});expect(result.state.panels.classes.placement).toBe(browsingDock);
    expect(result.state.panels.find.placement).toBe(browsingDock);expect(result.state.panels.schedule.placement).toBe(scheduleDock);
    expect(result.state.active[scheduleDock]).toBe('schedule');expect(result.state.active[browsingDock]).toBe('classes');
    const usable=2000,widths=readableGroupWidths(result.state,usable+12,{left:usable*left,right:usable*right})!;
    expect(widths.left).toBeCloseTo(usable*left);expect(widths.right).toBeCloseTo(usable*right);
    // Presets do not bypass the existing native-content minimum widths.
    expect(readableGroupWidths(result.state,991,{left:991*left,right:991*right})).toBeNull();
  });

  it("preserves a selected optional browsing tab without reopening closed Classes or Find",()=>{
    const source=selectWorkspaceTab(closed(),'optimizer');
    const result=applyWorkspacePreset(source,'balanced','optimizer')!;
    expect(result.active).toBe('optimizer');expect(openGroupTabs(result.state,'left')).toEqual(['optimizer']);
    expect(result.state.panels.classes.open).toBe(false);expect(result.state.panels.find.open).toBe(false);
    expect(openGroupTabs(result.state,'right')).toEqual(['schedule']);
  });

  it("reopens Classes and Find only when a split has no open browsing tab",()=>{
    const result=applyWorkspacePreset(selectWorkspaceTab(closed(),'schedule'),'schedule-left','schedule')!;
    expect(openGroupTabs(result.state,'right')).toEqual(['classes','find']);expect(result.active).toBe('classes');
    expect(openGroupTabs(result.state,'left')).toEqual(['schedule']);
    expect(['optimizer','study','personal'].every(id=>!result.state.panels[id as 'optimizer'].open)).toBe(true);
  });

  it("uses a current active browsing tab when the preferred tab is closed or is Schedule",()=>{
    const source=closeWorkspaceTab(selectWorkspaceTab(createDefaultGroups(),'find'),'classes');
    for(const preferred of ['classes','schedule',undefined] as const){
      const result=applyWorkspacePreset(source,'browse-wide',preferred)!;
      expect(result.active).toBe('find');expect(result.state.active.left).toBe('find');expect(result.state.panels.classes.open).toBe(false);
    }
  });

  it("single pane preserves open choices, including schedule-only and closed Schedule",()=>{
    const onlySchedule=applyWorkspacePreset(selectWorkspaceTab(closed(),'schedule'),'single','schedule')!;
    expect(openGroupTabs(onlySchedule.state,'main')).toEqual(['schedule']);expect(onlySchedule.active).toBe('schedule');
    const noSchedule=applyWorkspacePreset(closeWorkspaceTab(createDefaultGroups(),'schedule'),'single','find')!;
    expect(noSchedule.state.panels.schedule.open).toBe(false);expect(openGroupTabs(noSchedule.state,'main')).toEqual(['classes','find']);
    expect(noSchedule.state.active.main).toBe('find');expect(noSchedule.ratios).toEqual({main:1});
  });

  it("an entirely closed single layout starts with Classes while leaving optional modules closed",()=>{
    const result=applyWorkspacePreset(closed(),'single')!;
    expect(openGroupTabs(result.state,'main')).toEqual(['classes']);expect(result.active).toBe('classes');
  });

  it("returns independent ratios and states on repeated applications",()=>{
    const source=createDefaultGroups(),first=applyWorkspacePreset(source,'balanced')!;
    first.ratios.left=.9;first.state.panels.classes.open=false;
    const second=applyWorkspacePreset(source,'balanced')!;
    expect(second.ratios).toEqual({left:.5,right:.5});expect(second.state.panels.classes.open).toBe(true);
    expect(WORKSPACE_PRESETS.find(preset=>preset.id==='balanced')!.ratios.left).toBe(.5);
  });

  it.each(['unknown','Balanced','__proto__',null,undefined,{},1])("rejects unknown preset %s without changing state",id=>{
    const source=freeze(createDefaultGroups()),before=JSON.stringify(source);
    expect(applyWorkspacePreset(source,id as WorkspacePresetId)).toBeNull();expect(JSON.stringify(source)).toBe(before);
  });
});
