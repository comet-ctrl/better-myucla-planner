import { describe, expect, it } from "vitest";
import {
  activeGroupTab, closeWorkspaceTab, createDefaultGroups, floatWorkspaceTab,
  mergeWorkspaceTab, migrateLegacyGroups, minimumGroupWidth, normalizeWorkspaceGroups,
  openGroupTabs, readableGroupWidths, selectWorkspaceTab, splitWorkspaceTab,
  WORKSPACE_DOCKS, WORKSPACE_GROUP_GAP, WORKSPACE_PANEL_IDS
} from "../../src/content/workspace-groups";

describe("bounded workspace tab groups",()=>{
  it("starts with browsing tabs together, a schedule and no unopened native modules",()=>{
    const state=createDefaultGroups();
    expect(openGroupTabs(state,'main')).toEqual(['classes','find']);expect(openGroupTabs(state,'right')).toEqual(['schedule']);expect(openGroupTabs(state,'left')).toEqual([]);
    expect(activeGroupTab(state,'main')).toBe('classes');
    expect(['optimizer','study','personal'].map(id=>state.panels[id as 'optimizer'].open)).toEqual([false,false,false]);
  });

  it("migrates the hidden Find legacy case into the remembered Classes browsing group",()=>{
    const state=migrateLegacyGroups({version:1,module:'classes',mainModule:'classes',panels:[
      {id:'classes',placement:'right'}, {id:'schedule',placement:'left'}, {id:'find',placement:'main',hidden:true},
      {id:'optimizer',placement:'main'}, {id:'study',placement:'main'}, {id:'personal',placement:'main'},
      {id:'details',placement:'floating',box:{left:3,top:4,width:500,height:500}}
    ]});
    expect(state.panels.find).toEqual({placement:'right',open:false});expect(openGroupTabs(state,'main')).toEqual([]);
    const opened=selectWorkspaceTab(state,'find');
    expect(openGroupTabs(opened,'right')).toEqual(['classes','find']);expect(activeGroupTab(opened,'right')).toBe('find');
    expect(openGroupTabs(opened,'main')).toEqual([]);expect(opened.panels.schedule.placement).toBe('left');
  });

  it("migration keeps native modules closed unless selected or explicitly detached",()=>{
    const state=migrateLegacyGroups({module:'optimizer',mainModule:'optimizer',panels:[
      {id:'optimizer',placement:'main'}, {id:'study',placement:'floating'}, {id:'personal',placement:'right',hidden:true},
      {id:'find',placement:'floating',hidden:true}, {id:'classes',placement:'left'}
    ]});
    expect(state.panels.optimizer.open).toBe(true);expect(state.panels.study.open).toBe(true);expect(state.panels.personal.open).toBe(false);
    expect(state.panels.find).toEqual({placement:'floating',open:false});expect(state.active.left).toBe('optimizer');
    expect(selectWorkspaceTab(state,'find').panels.find.placement).toBe('floating');
  });

  it("folds an existing legacy third column into browsing while retaining the selected tab",()=>{
    const state=migrateLegacyGroups({module:'find',mainModule:'find',panels:[{id:'classes',placement:'left'},{id:'find',placement:'main'},{id:'schedule',placement:'right'}]});
    expect(state.panels.classes.placement).toBe('left');expect(state.panels.find.placement).toBe('left');expect(state.active.left).toBe('find');
    expect(openGroupTabs(state,'main')).toEqual([]);expect(state.panels.schedule.placement).toBe('right');
  });

  it("reopens a closed third-slot tab in browsing instead of creating a third column",()=>{
    const state=createDefaultGroups();state.panels.optimizer={placement:'left',open:false};
    const opened=selectWorkspaceTab(state,'optimizer');expect(opened.panels.optimizer).toEqual({placement:'main',open:true});
    expect(opened.active.main).toBe('optimizer');expect(openGroupTabs(opened,'left')).toEqual([]);expect(opened.panels.schedule.placement).toBe('right');
  });

  it("normalizes only public ids, valid placements and booleans; repairs invalid active tabs",()=>{
    const state=normalizeWorkspaceGroups({version:1,order:['find','unknown','find','classes'],panels:{
      classes:{placement:'left',open:true,privateText:'discard'},find:{placement:'left',open:true},schedule:{placement:'right',open:false},
      optimizer:{placement:'arbitrary-tree',open:true},privateCourse:{placement:'main',open:true}
    },active:{left:'schedule',main:'privateCourse',right:'schedule'},courseId:'discard'})!;
    expect(state.order).toHaveLength(6);expect(new Set(state.order)).toEqual(new Set(WORKSPACE_PANEL_IDS));
    expect(state.active).toEqual({left:'find',main:null,right:null});expect(state.panels.optimizer.open).toBe(false);
    expect(JSON.stringify(state)).not.toMatch(/discard|private|arbitrary/);
    expect(normalizeWorkspaceGroups({version:2,panels:{}})).toBeNull();expect(normalizeWorkspaceGroups({version:1,panels:[]})).toBeNull();
  });

  it("center drop merges and activates a tab without closing its neighbors",()=>{
    const original=createDefaultGroups(),before=JSON.stringify(original),merged=mergeWorkspaceTab(original,'find','right');
    expect(openGroupTabs(merged,'right')).toEqual(['schedule','find']);expect(merged.active.right).toBe('find');
    expect(openGroupTabs(merged,'main')).toEqual(['classes']);expect(merged.active.main).toBe('classes');
    expect(JSON.stringify(original)).toBe(before);
    const first=mergeWorkspaceTab(merged,'find','right',0);expect(openGroupTabs(first,'right')).toEqual(['find','schedule']);
  });

  it("closing a tab selects its neighbor and reopening returns to the same group",()=>{
    let state=mergeWorkspaceTab(createDefaultGroups(),'optimizer','main',1);
    expect(openGroupTabs(state,'main')).toEqual(['classes','optimizer','find']);
    state=closeWorkspaceTab(state,'optimizer');expect(state.active.main).toBe('find');expect(state.panels.optimizer.placement).toBe('main');
    state=selectWorkspaceTab(state,'optimizer');expect(state.active.main).toBe('optimizer');expect(openGroupTabs(state,'main')).toEqual(['classes','optimizer','find']);
    state=closeWorkspaceTab(state,'find');state=closeWorkspaceTab(state,'optimizer');state=closeWorkspaceTab(state,'classes');
    expect(state.active.main).toBeNull();expect(openGroupTabs(state,'main')).toEqual([]);
  });

  it("inserts at the displayed tab index even when closed remembered siblings precede it",()=>{
    const state=selectWorkspaceTab(createDefaultGroups(),'study');
    expect(openGroupTabs(state,'main')).toEqual(['classes','find','study']);
    const end=mergeWorkspaceTab(state,'schedule','main',3);
    expect(openGroupTabs(end,'main')).toEqual(['classes','find','study','schedule']);
    const middle=mergeWorkspaceTab(state,'schedule','main',2);
    expect(openGroupTabs(middle,'main')).toEqual(['classes','find','schedule','study']);
    expect(middle.panels.optimizer).toEqual({placement:'main',open:false});
    expect(middle.order).toContain('optimizer');expect(state.order).toEqual(createDefaultGroups().order);
  });

  it("floating is a singleton and closing never forgets its last placement",()=>{
    const state=floatWorkspaceTab(createDefaultGroups(),'find');
    expect(state.panels.find).toEqual({placement:'floating',open:true});expect(openGroupTabs(state,'main')).toEqual(['classes']);
    const closed=closeWorkspaceTab(state,'find');expect(closed.panels.find).toEqual({placement:'floating',open:false});
    expect(selectWorkspaceTab(closed,'find').panels.find).toEqual({placement:'floating',open:true});
  });

  it("explicit splits are retained by normalization and later tab reopening",()=>{
    const result=splitWorkspaceTab(closeWorkspaceTab(createDefaultGroups(),'schedule'),'find','left',1600);expect(result.accepted).toBe(true);
    const restored=normalizeWorkspaceGroups(result.state)!;
    const reopened=selectWorkspaceTab(closeWorkspaceTab(restored,'find'),'find');
    expect(reopened.panels.find.placement).toBe('left');expect(reopened.panels.classes.placement).toBe('main');
    expect(reopened.active.left).toBe('find');
  });

  it("rejects a third pane and enforces readable widths for two panes",()=>{
    const defaultState=createDefaultGroups();expect(splitWorkspaceTab(defaultState,'find','left',3000).reason).toBe('limit');
    const original=closeWorkspaceTab(defaultState,'schedule');
    const narrow=splitWorkspaceTab(original,'find','left',991);
    expect(narrow).toEqual({state:original,accepted:false,reason:'space'});expect(narrow.state).toBe(original);
    const exact=splitWorkspaceTab(original,'find','left',992);expect(exact.accepted).toBe(true);
    expect(readableGroupWidths(exact.state,992)).toEqual({left:560,main:420,right:0});
  });

  it("does not split an occupied edge when two other groups would remain; a center drop can group there",()=>{
    const state=createDefaultGroups(),result=splitWorkspaceTab(state,'find','right',3000);
    expect(result).toEqual({state,accepted:false,reason:'occupied'});
    const merged=mergeWorkspaceTab(state,'find','right');expect(openGroupTabs(merged,'right')).toEqual(['schedule','find']);
  });

  it.each(['left','right'] as const)("splits either tab toward its own occupied %s edge",target=>{
    let state=closeWorkspaceTab(createDefaultGroups(),'find');
    state=mergeWorkspaceTab(state,'classes',target);state=mergeWorkspaceTab(state,'schedule',target);
    const before=JSON.stringify(state),opposite=target==='left'?'right':'left';
    for(const id of ['classes','schedule'] as const){
      const result=splitWorkspaceTab(state,id,target,1440),other=id==='classes'?'schedule':'classes';
      expect(result.accepted).toBe(true);expect(openGroupTabs(result.state,target)).toEqual([id]);
      expect(openGroupTabs(result.state,opposite)).toEqual([other]);
      expect(activeGroupTab(result.state,target)).toBe(id);expect(activeGroupTab(result.state,opposite)).toBe(other);
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it("moves the remaining group's closed tabs, selection and visible order together",()=>{
    let state=mergeWorkspaceTab(createDefaultGroups(),'schedule','main');
    state=mergeWorkspaceTab(state,'classes','left');
    state=mergeWorkspaceTab(state,'find','left');state=mergeWorkspaceTab(state,'schedule','left');
    state=mergeWorkspaceTab(state,'optimizer','left',1);state=closeWorkspaceTab(state,'find');
    state=selectWorkspaceTab(state,'optimizer');
    const before=JSON.stringify(state),remaining=openGroupTabs(state,'left').filter(id=>id!=='schedule');
    const result=splitWorkspaceTab(state,'schedule','left',1600);
    expect(result.accepted).toBe(true);expect(openGroupTabs(result.state,'left')).toEqual(['schedule']);
    expect(openGroupTabs(result.state,'right')).toEqual(remaining);expect(result.state.active.right).toBe('optimizer');
    expect(result.state.panels.find).toEqual({placement:'right',open:false});
    const reopened=selectWorkspaceTab(result.state,'find');expect(reopened.panels.find.placement).toBe('right');
    expect(openGroupTabs(reopened,'left')).toEqual(['schedule']);expect(JSON.stringify(state)).toBe(before);
  });

  it.each(['left','right'] as const)("exchanges two singleton groups when a tab is split toward occupied %s",target=>{
    let state=closeWorkspaceTab(createDefaultGroups(),'find');
    state=mergeWorkspaceTab(state,'classes','left');
    const id=target==='left'?'schedule':'classes',other=id==='classes'?'schedule':'classes',opposite=target==='left'?'right':'left';
    const before=JSON.stringify(state),result=splitWorkspaceTab(state,id,target,1000);
    expect(result.accepted).toBe(true);expect(openGroupTabs(result.state,target)).toEqual([id]);
    expect(openGroupTabs(result.state,opposite)).toEqual([other]);expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects an unreadable same-edge split without relocating any committed group",()=>{
    let state=closeWorkspaceTab(createDefaultGroups(),'find');
    state=mergeWorkspaceTab(state,'classes','left');state=mergeWorkspaceTab(state,'schedule','left');
    const before=JSON.stringify(state),rejected=splitWorkspaceTab(state,'schedule','left',851);
    expect(rejected).toEqual({state,accepted:false,reason:'space'});expect(rejected.state).toBe(state);
    expect(JSON.stringify(state)).toBe(before);
    const exact=splitWorkspaceTab(state,'schedule','left',852);
    expect(exact.accepted).toBe(true);expect(readableGroupWidths(exact.state,852)).toEqual({left:420,main:0,right:420});
  });

  it("retains occupied-main rejection and rejects a third pane from the same edge",()=>{
    const original=createDefaultGroups();
    expect(splitWorkspaceTab(original,'schedule','main',2000)).toEqual({state:original,accepted:false,reason:'occupied'});
    let state=mergeWorkspaceTab(closeWorkspaceTab(original,'find'),'classes','left');
    state=mergeWorkspaceTab(state,'find','left');
    const before=JSON.stringify(state),result=splitWorkspaceTab(state,'find','left',3000);
    expect(result).toEqual({state,accepted:false,reason:'occupied'});expect(JSON.stringify(state)).toBe(before);
  });

  it("ignores closed tabs in width floors but reserves readable Find width in an open browsing group",()=>{
    const state=createDefaultGroups();expect(minimumGroupWidth(state,'main')).toBe(560);
    expect(minimumGroupWidth(closeWorkspaceTab(state,'find'),'main')).toBe(420);
    expect(readableGroupWidths(state,991)).toBeNull();expect(readableGroupWidths(state,992)).toEqual({left:0,main:560,right:420});
  });

  it("fills available space without mutating preferences and respects readable floors",()=>{
    const state=splitWorkspaceTab(closeWorkspaceTab(createDefaultGroups(),'schedule'),'find','left',1800).state,before=JSON.stringify(state),preferred={left:800,main:300,right:600};
    const widths=readableGroupWidths(state,1800,preferred)!;
    expect(WORKSPACE_DOCKS.reduce((sum,dock)=>sum+widths[dock],0)+WORKSPACE_GROUP_GAP).toBeCloseTo(1800);
    for(const dock of WORKSPACE_DOCKS)expect(widths[dock]).toBeGreaterThanOrEqual(minimumGroupWidth(state,dock));
    expect(JSON.stringify(state)).toBe(before);expect(preferred).toEqual({left:800,main:300,right:600});
  });

  it("single panes fill narrow screens and closed workspaces have no occupied columns",()=>{
    let state=closeWorkspaceTab(closeWorkspaceTab(createDefaultGroups(),'find'),'schedule');
    expect(readableGroupWidths(state,390)).toEqual({left:0,main:390,right:0});
    state=closeWorkspaceTab(state,'classes');expect(readableGroupWidths(state,390)).toEqual({left:0,main:0,right:0});
    expect(readableGroupWidths(state,Infinity)).toBeNull();expect(readableGroupWidths(state,-10)).toBeNull();
  });
});
