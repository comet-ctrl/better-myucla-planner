// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerWorkspace } from "../../src/content/planner-workspace";
import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import { normalizeWorkspaceLayout } from "../../src/storage/workspace-layout";
// @ts-expect-error Shared browser fixture is plain JavaScript.
import { workspaceFixtureHtml } from "../../harness/workspace-fixture.mjs";

describe("remembered workspace presentation",()=>{
  let workspace:PlannerWorkspace,adapter:MyUclaPlannerAdapter;
  const save=vi.fn();
  const mount=()=>workspace.reconcile(document,adapter.inspectContract().courses);
  const button=(selector:string)=>document.querySelector<HTMLButtonElement>(selector)!;
  beforeEach(()=>{
    document.body.innerHTML=new DOMParser().parseFromString(workspaceFixtureHtml(),"text/html").body.innerHTML;
    vi.stubGlobal("innerWidth",1440);save.mockClear();workspace=new PlannerWorkspace(()=>{},save);adapter=new MyUclaPlannerAdapter(document);
    document.querySelector("form")!.addEventListener("submit",event=>event.preventDefault());
  });
  afterEach(()=>{workspace.restore();vi.unstubAllGlobals();});
  it("restores module, floats, hidden panels and folds without native clicks or storage writes",async()=>{
    const click=vi.fn();document.querySelectorAll("button,input,a").forEach(node=>node.addEventListener("click",click));
    const native=[...document.querySelectorAll("input,select")];
    workspace.setSavedLayout(normalizeWorkspaceLayout({version:1,panels:[{id:"schedule",placement:"floating",box:{left:300,top:100,width:700,height:500}},{id:"find",placement:"main",hidden:true}],module:"optimizer",mainModule:"optimizer",navigationCollapsed:true,scheduleWidth:800,dockSizes:{left:360},collapsedPanes:["plannerSectionClip"]}));
    mount();await Promise.resolve();
    expect(document.querySelector(".pl-workspace-calendar")!.getAttribute("data-pl-panel-placement")).toBe("floating");
    expect(document.querySelector(".pl-workspace-search")!.classList.contains("pl-panel-hidden")).toBe(true);
    expect(document.querySelector(".pl-workspace-plan")!.classList.contains("pl-pane-collapsed")).toBe(true);
    expect(document.querySelector(".pl-workspace-host")!.getAttribute("data-pl-module")).toBe("optimizer");
    expect(document.querySelector(".pl-workspace-host")!.classList.contains("pl-navigation-collapsed")).toBe(true);
    expect(document.querySelector("#panelOptimizer")!.classList.contains("hidden")).toBe(true);
    expect([...document.querySelectorAll("input,select")]).toEqual(native);expect(click).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
  });
  it("saves user choices together, survives restore/remount and keeps course details ephemeral",async()=>{
    mount();const course=adapter.inspectContract().courses[0];button('[data-pl-workspace-details]').click();
    button('[data-pl-panel-close=schedule]').click();button('.pl-navigation-toggle').click();button('button[data-pl-module=find]').click();
    await Promise.resolve();expect(save).toHaveBeenCalledTimes(1);
    const saved=save.mock.calls[0][0];expect(saved.module).toBe("find");expect(saved.navigationCollapsed).toBe(true);
    expect(saved.panels.find((panel:{id:string})=>panel.id==="schedule").hidden).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(course.id);expect(JSON.stringify(saved)).not.toContain(course.label);
    workspace.restore();mount();expect(document.querySelector(".pl-workspace-calendar")!.classList.contains("pl-panel-hidden")).toBe(true);
    expect(document.querySelector(".pl-workspace-host")!.classList.contains("pl-navigation-collapsed")).toBe(true);
    expect(document.querySelector(".pl-workspace-host")!.getAttribute("data-pl-module")).toBe("find");
    expect(document.querySelectorAll(".pl-workspace-detail-space")).toHaveLength(0);
  });
  it("saves the visible minimum when keyboard resizing reaches the boundary",async()=>{
    mount();const divider=document.querySelector<HTMLElement>('.pl-workspace-splitter')!;
    for(const key of ['Home','ArrowRight'])divider.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
    await Promise.resolve();expect(save.mock.calls.at(-1)![0].scheduleWidth).toBe(420);
  });
  it("cancels navigation-tab activation before the first frame without saving it later",async()=>{
    mount();button('.pl-navigation-toggle').click();await Promise.resolve();save.mockClear();
    const pointer=(node:EventTarget,type:string,x:number,y:number)=>{
      const event=new MouseEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});
      Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});node.dispatchEvent(event);
    };
    pointer(button('button[data-pl-module=find]'),'pointerdown',50,200);pointer(document,'pointermove',75,225);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    await Promise.resolve();expect(save).not.toHaveBeenCalled();
    button('.pl-navigation-toggle').click();await Promise.resolve();
    expect(save.mock.calls.at(-1)![0].module).toBe('classes');expect(save.mock.calls.at(-1)![0].mainModule).toBe('classes');
    expect(save.mock.calls.at(-1)![0].panels.find((panel:{id:string})=>panel.id==='find').placement).toBe('main');
  });
  it.each(['module','navigation','schedule'] as const)("native redraw cancels uncommitted %s presentation before taking its snapshot",async(kind)=>{
    workspace.setSavedLayout(normalizeWorkspaceLayout({version:1,panels:[],module:'classes',mainModule:'classes',scheduleWidth:600}));
    mount();
    const pointer=(node:EventTarget,type:string,x:number,y:number)=>{
      const event=new MouseEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});
      Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});node.dispatchEvent(event);
    };
    const handle=kind==='module'?button('button[data-pl-module=find]'):document.querySelector<HTMLElement>(kind==='navigation'?'.pl-navigation-divider':'.pl-workspace-splitter')!;
    pointer(handle,'pointerdown',600,200);pointer(document,'pointermove',560,230);
    const fixture=new DOMParser().parseFromString(workspaceFixtureHtml(),'text/html');
    if(kind==='schedule'){
      // A course-table update keeps the workspace controller mounted.
      const table=adapter.inspectContract().courses[0].node.querySelector('table.coursetable')!;
      table.replaceWith(document.importNode(fixture.querySelector('table.coursetable')!,true));
    } else document.getElementById('ctl00_MainContent_classPlanPanel')!.replaceWith(document.importNode(fixture.getElementById('ctl00_MainContent_classPlanPanel')!,true));
    mount();await Promise.resolve();
    expect(document.querySelector('.pl-workspace-host')!.getAttribute('data-pl-module')).toBe('classes');
    expect(document.querySelector('.pl-workspace-host')!.classList.contains('pl-navigation-collapsed')).toBe(false);
    expect(document.querySelector('.pl-workspace-splitter')!.getAttribute('aria-valuenow')).toBe('600');
    expect(save).not.toHaveBeenCalled();
    // Releasing the old pointer after redraw must not commit a stale gesture.
    pointer(document,'pointerup',560,230);await Promise.resolve();expect(save).not.toHaveBeenCalled();
    button('.pl-navigation-toggle').click();await Promise.resolve();
    expect(save.mock.calls.at(-1)![0].module).toBe('classes');expect(save.mock.calls.at(-1)![0].scheduleWidth).toBe(600);
  });
  it("Default layout restores placement and sizing but preserves native selections, handlers and open details",async()=>{
    workspace.setSavedLayout(normalizeWorkspaceLayout({version:1,panels:[{id:"schedule",placement:"floating",box:{left:300,top:100,width:700,height:500}},{id:"find",placement:"left",hidden:true}],module:"classes",mainModule:"classes",navigationCollapsed:true,scheduleWidth:900,scheduleExpanded:true,dockSizes:{left:350},collapsedPanes:[]}));
    mount();button('[data-pl-workspace-details]').click();
    const course=adapter.inspectContract().courses[0],table=course.node.querySelector("table.coursetable"),parent=table!.parentElement;
    const native=[...document.querySelectorAll<HTMLInputElement>("input")],state=native.map(input=>({node:input,value:input.value,checked:input.checked})),clicked=vi.fn();
    document.querySelectorAll("button:not([data-planner-lift-owned]),input,a").forEach(node=>node.addEventListener("click",clicked));
    button('.pl-workspace-default').click();await Promise.resolve();
    const saved=save.mock.calls.at(-1)![0];expect(saved.module).toBe("classes");expect(saved.navigationCollapsed).toBe(false);expect(saved.scheduleWidth).toBeNull();expect(saved.scheduleExpanded).toBe(false);expect(saved.dockSizes).toEqual({});expect(saved.collapsedPanes).toEqual([]);
    expect(saved.panels.find((panel:{id:string})=>panel.id==="schedule")).toEqual({id:"schedule",placement:"right",hidden:false});
    expect(saved.panels.every((panel:{hidden:boolean})=>!panel.hidden)).toBe(true);
    expect(course.node.querySelector("table.coursetable")).toBe(table);expect(table!.parentElement).toBe(parent);expect(document.querySelectorAll(".pl-workspace-detail-space")).toHaveLength(1);
    expect(state.map(({node})=>({node,value:node.value,checked:node.checked}))).toEqual(state);expect(clicked).not.toHaveBeenCalled();
  });
});
