// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeWorkspaceLayout, readWorkspaceLayout, saveWorkspaceLayout, WORKSPACE_LAYOUT_KEY, LEGACY_WORKSPACE_LAYOUT_KEY } from "../../src/storage/workspace-layout";
import { mergeWorkspaceTab } from "../../src/content/workspace-groups";

const layout = () => normalizeWorkspaceLayout({version:1, panels:[{id:"schedule",placement:"floating",box:{left:350,top:120,width:700,height:500}}],module:"find",mainModule:"find",navigationCollapsed:true,scheduleWidth:900,scheduleExpanded:false,dockSizes:{left:450},collapsedPanes:["plannerSectionClip"]})!;
afterEach(() => vi.unstubAllGlobals());

describe("local workspace preference", () => {
  it("round-trips only whitelisted presentation fields", async () => {
    const stored:Record<string,unknown>={};
    vi.stubGlobal("chrome",{storage:{local:{get:async(key:string)=>({[key]:stored[key]}),set:async(value:Record<string,unknown>)=>Object.assign(stored,value)}}});
    const source={...layout(),account:"discard",term:"discard",courseIds:["discard"],panels:[...layout().panels,{id:"private-course-id",placement:"main"}]};
    await saveWorkspaceLayout(source as unknown as ReturnType<typeof layout>);
    expect(stored).toEqual({[WORKSPACE_LAYOUT_KEY]:layout()});
    expect(await readWorkspaceLayout()).toEqual(layout());
    expect(JSON.stringify(stored)).not.toContain("discard");
  });

  it("round-trips only the five public preset ids and discards unknown preset metadata", async () => {
    const stored:Record<string,unknown>={};
    vi.stubGlobal("chrome",{storage:{local:{get:async(key:string)=>({[key]:stored[key]}),set:async(value:Record<string,unknown>)=>Object.assign(stored,value)}}});
    for(const id of ["single","balanced","browse-wide","schedule-wide","schedule-left"] as const){
      const source={...layout(),layoutPreset:id,presetName:"discard-private-label",presetCourses:["discard-private-course"]};
      await saveWorkspaceLayout(source);
      expect((await readWorkspaceLayout())!.layoutPreset).toBe(id);
      expect(stored[WORKSPACE_LAYOUT_KEY]).toEqual({...layout(),layoutPreset:id});
      expect(JSON.stringify(stored)).not.toContain("discard-private");
    }
    for(const unknown of [undefined,null,"custom","BALANCED"," balanced ","private-course-id",{id:"balanced"},["balanced"],1]){
      const normalized=normalizeWorkspaceLayout({...layout(),layoutPreset:unknown})!;
      expect(normalized.layoutPreset).toBeNull();
      await saveWorkspaceLayout(normalized);
      expect((await readWorkspaceLayout())!.layoutPreset).toBeNull();
    }
    expect(normalizeWorkspaceLayout({version:1,panels:[]})!.layoutPreset).toBeNull();
  });

  it("ignores unknown versions and malformed entries and bounds geometry", () => {
    for(const value of [null,{},true,{version:2,panels:[]},{version:1,panels:"bad"}])expect(normalizeWorkspaceLayout(value)).toBeNull();
    const result=normalizeWorkspaceLayout({...layout(),version:1,module:"unknown",mainModule:7,navigationCollapsed:"true",scheduleWidth:Infinity,dockSizes:{left:-3,right:99999},collapsedPanes:["course-id","classSearchTitle","classSearchTitle"],panels:[
      {id:"details",placement:"left"},{id:"schedule",placement:"main"},{id:"find",placement:"floating",box:{left:NaN,top:0,width:500,height:500}},
      {id:"classes",placement:"left"},{id:"find",placement:"right"},{id:"personal",placement:"left"}
    ]})!;
    expect(result.module).toBe("classes");expect(result.mainModule).toBe("classes");expect(result.navigationCollapsed).toBe(false);
    expect(result.scheduleWidth).toBeNull();expect(result.dockSizes).toEqual({});expect(result.collapsedPanes).toEqual(["classSearchTitle"]);
    expect(result.panels.find(panel=>panel.id==='find')).toEqual({id:"find",placement:"floating",hidden:false});
    expect(result.panels.find(panel=>panel.id==='classes')).toEqual({id:"classes",placement:"left",hidden:false});
    expect(result.panels.find(panel=>panel.id==='personal')).toEqual({id:"personal",placement:"main",hidden:true});
    expect(result.version).toBe(2);expect(result.groups).toBeDefined();
  });

  it("serializes a reset behind a delayed earlier write", async () => {
    let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),stored:unknown[]=[];
    const set=vi.fn(async(value:Record<string,unknown>)=>{if(!stored.length)await gate;stored.push(value[WORKSPACE_LAYOUT_KEY]);});
    vi.stubGlobal("chrome",{storage:{local:{set}}});
    const first=saveWorkspaceLayout(layout());await Promise.resolve();
    const reset=normalizeWorkspaceLayout({version:1,panels:[{id:"schedule",placement:"right"}]})!;
    const second=saveWorkspaceLayout(reset);await Promise.resolve();expect(set).toHaveBeenCalledTimes(1);
    release();await Promise.all([first,second]);expect(stored).toEqual([layout(),reset]);
  });

  it("fails safely when storage is unavailable or denied", async () => {
    vi.stubGlobal("chrome",undefined);expect(await readWorkspaceLayout()).toBeNull();await saveWorkspaceLayout(layout());
    vi.stubGlobal("chrome",{storage:{local:{get:async()=>{throw Error("denied");},set:async()=>{throw Error("denied");}}}});
    expect(await readWorkspaceLayout()).toBeNull();await expect(saveWorkspaceLayout(layout())).resolves.toBeUndefined();
  });

  it("migrates the old key without altering the rollback snapshot and writes only v2",async()=>{
    const legacy={version:1,panels:[{id:'schedule',placement:'left'},{id:'classes',placement:'right'},{id:'find',placement:'main',hidden:true}],module:'classes',mainModule:'classes'};
    const stored:Record<string,unknown>={[LEGACY_WORKSPACE_LAYOUT_KEY]:legacy},set=vi.fn(async(value:Record<string,unknown>)=>Object.assign(stored,value));
    vi.stubGlobal('chrome',{storage:{local:{get:async(key:string)=>({[key]:stored[key]}),set}}});
    const migrated=(await readWorkspaceLayout())!;expect(migrated.version).toBe(2);expect(migrated.groups.panels.find).toEqual({placement:'right',open:false});expect(set).not.toHaveBeenCalled();
    await saveWorkspaceLayout(migrated);expect(stored[LEGACY_WORKSPACE_LAYOUT_KEY]).toBe(legacy);expect(stored[WORKSPACE_LAYOUT_KEY]).toEqual(migrated);
    expect(set.mock.calls[0][0]).not.toHaveProperty(LEGACY_WORKSPACE_LAYOUT_KEY);
  });

  it("preserves shared dock membership and Details geometry using groups as authority",()=>{
    const current=layout(),groups=mergeWorkspaceTab(current.groups,'find','main');
    groups.panels.schedule={placement:'main',open:true};groups.active.main='find';
    const normalized=normalizeWorkspaceLayout({...current,groups,panels:[...current.panels,{id:'details',placement:'floating',box:{left:20,top:30,width:650,height:450},hidden:true}]})!;
    expect(normalized.panels.find(panel=>panel.id==='schedule')!.placement).toBe('main');expect(normalized.panels.find(panel=>panel.id==='find')!.placement).toBe('main');
    expect(normalized.groups.active.main).toBe('find');expect(normalized.panels.find(panel=>panel.id==='details')).toEqual({id:'details',placement:'floating',box:{left:20,top:30,width:650,height:450},hidden:true});
    expect(normalizeWorkspaceLayout({...current,groups:{version:99,panels:{}}})).toBeNull();
  });

  it("falls back from an invalid v2 record and prefers a valid v2 over v1",async()=>{
    const legacy={version:1,panels:[],module:'classes'},stored:Record<string,unknown>={[LEGACY_WORKSPACE_LAYOUT_KEY]:legacy,[WORKSPACE_LAYOUT_KEY]:{version:2,panels:[],groups:null}};
    vi.stubGlobal('chrome',{storage:{local:{get:async(key:string)=>({[key]:stored[key]})}}});
    expect((await readWorkspaceLayout())!.module).toBe('classes');stored[WORKSPACE_LAYOUT_KEY]=layout();expect(await readWorkspaceLayout()).toEqual(layout());
  });
});
