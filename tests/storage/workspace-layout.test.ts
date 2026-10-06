// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeWorkspaceLayout, readWorkspaceLayout, saveWorkspaceLayout, WORKSPACE_LAYOUT_KEY } from "../../src/storage/workspace-layout";

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

  it("ignores unknown versions and malformed entries and bounds geometry", () => {
    for(const value of [null,{},true,{version:2,panels:[]},{version:1,panels:"bad"}])expect(normalizeWorkspaceLayout(value)).toBeNull();
    const result=normalizeWorkspaceLayout({...layout(),module:"unknown",mainModule:7,navigationCollapsed:"true",scheduleWidth:Infinity,dockSizes:{left:-3,right:99999},collapsedPanes:["course-id","classSearchTitle","classSearchTitle"],panels:[
      {id:"details",placement:"left"},{id:"schedule",placement:"main"},{id:"find",placement:"floating",box:{left:NaN,top:0,width:500,height:500}},
      {id:"classes",placement:"left"},{id:"find",placement:"right"},{id:"personal",placement:"left"}
    ]})!;
    expect(result.module).toBe("classes");expect(result.mainModule).toBe("classes");expect(result.navigationCollapsed).toBe(false);
    expect(result.scheduleWidth).toBeNull();expect(result.dockSizes).toEqual({});expect(result.collapsedPanes).toEqual(["classSearchTitle"]);
    expect(result.panels).toEqual([{id:"find",placement:"floating",hidden:false},{id:"classes",placement:"left",hidden:false},{id:"personal",placement:"main",hidden:false}]);
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
});
