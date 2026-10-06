// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerWorkspace } from "../../src/content/planner-workspace";
import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import { normalizeWorkspaceLayout } from "../../src/storage/workspace-layout";
// @ts-expect-error Shared browser fixture is plain JavaScript.
import { workspaceFixtureHtml } from "../../harness/workspace-fixture.mjs";

describe("navigation geometry and details closing",()=>{
  let workspace:PlannerWorkspace,adapter:MyUclaPlannerAdapter;
  const element=(selector:string)=>document.querySelector<HTMLElement>(selector)!;
  const button=(selector:string)=>document.querySelector<HTMLButtonElement>(selector)!;
  const rect=(left:number,width:number)=>({left,top:150,width,height:600,right:left+width,bottom:750,x:left,y:150,toJSON(){}});
  beforeEach(()=>{
    document.body.innerHTML=new DOMParser().parseFromString(workspaceFixtureHtml(),"text/html").body.innerHTML;
    vi.stubGlobal("innerWidth",1600);workspace=new PlannerWorkspace();adapter=new MyUclaPlannerAdapter(document);
    document.querySelector("form")!.addEventListener("submit",event=>event.preventDefault());
  });
  afterEach(()=>{workspace.restore();vi.restoreAllMocks();vi.unstubAllGlobals();});

  it("uses the new navigation width in the same layout pass for pointer and keyboard toggles",()=>{
    workspace.setSavedLayout(normalizeWorkspaceLayout({version:1,panels:[{id:"classes",placement:"main",hidden:true},{id:"find",placement:"main",hidden:true},{id:"schedule",placement:"left"}]}));
    workspace.reconcile(document,adapter.inspectContract().courses);
    const deck=element(".pl-workspace-deck"),calendar=element(".pl-workspace-calendar");
    vi.spyOn(deck,"getBoundingClientRect").mockImplementation(()=>element(".pl-workspace-host").classList.contains("pl-navigation-collapsed")?rect(88,1312):rect(200,1200));
    window.dispatchEvent(new Event("resize"));
    const bounds=()=>["left","width"].map(key=>parseFloat(calendar.style.getPropertyValue(`--pl-dock-${key}`)));
    expect(bounds()).toEqual([200,1200]);
    button(".pl-navigation-toggle").click();expect(bounds()).toEqual([88,1312]);
    element(".pl-navigation-divider").dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true,cancelable:true}));
    expect(bounds()).toEqual([200,1200]);
    const pointer=(node:EventTarget,type:string,x:number)=>{
      const event=new MouseEvent(type,{button:0,clientX:x,clientY:180,bubbles:true,cancelable:true});
      Object.defineProperty(event,"pointerId",{value:1});node.dispatchEvent(event);
    };
    pointer(element(".pl-navigation-divider"),"pointerdown",200);pointer(document,"pointermove",160);
    expect(bounds()).toEqual([88,1312]);
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    expect(bounds()).toEqual([200,1200]);
  });

  it("shows one close for one course and distinct individual/group closes for multiple courses",()=>{
    workspace.reconcile(document,adapter.inspectContract().courses);
    const courses=adapter.inspectContract().courses.slice(0,2),group=button('[data-pl-panel-close="details"]');
    const native=courses.map(course=>course.node.querySelector("table.coursetable")!);
    const parents=native.map(table=>table.parentElement),clicked=vi.fn();
    native.forEach(table=>table.querySelectorAll("input,button,a").forEach(control=>control.addEventListener("click",clicked)));
    const trigger=(index:number)=>courses[index].node.querySelector<HTMLButtonElement>("[data-pl-workspace-details]")!;
    const close=(index:number)=>courses[index].node.querySelector<HTMLButtonElement>(".pl-workspace-preview-close")!;
    trigger(0).click();
    expect(group.hidden).toBe(true);expect(close(0).hidden).toBe(false);expect(close(0).getAttribute("aria-label")).toBe("Close details");
    trigger(1).click();
    expect(group.hidden).toBe(false);expect(group.getAttribute("aria-label")).toBe("Close all class details");
    expect(close(0).getAttribute("aria-label")).toMatch(/^Close details for /);
    expect(close(1).getAttribute("aria-label")).not.toBe(close(0).getAttribute("aria-label"));
    close(0).click();expect(group.hidden).toBe(true);expect(close(1).getAttribute("aria-label")).toBe("Close details");
    expect(document.activeElement).toBe(trigger(0));
    trigger(0).click();group.click();expect(element(".pl-workspace-details-frame").hidden).toBe(true);
    trigger(1).click();expect(element(".pl-workspace-details-frame").hidden).toBe(false);expect(group.hidden).toBe(false);
    expect(native.every((table,index)=>table.parentElement===parents[index])).toBe(true);expect(clicked).not.toHaveBeenCalled();
  });

  it("fits native calendar switches into the header only when their bounds and containing block are compatible",()=>{
    const grid=element("#gridDiv"),menu=element(".plannerMenuLinks"),header=element("#plannerSectionCal");
    menu.classList.add("classPlanner_SectionMenu","checkboxStateHolder");grid.prepend(menu);
    const switchControl=document.createElement("input");switchControl.type="checkbox";menu.append(switchControl);
    header.innerHTML='<button type="button" id="ctl00_MainContent_toggleGrid" class="planSectionToggle">Weekly Schedule</button>';
    const original=document.body.innerHTML;
    workspace.reconcile(document,adapter.inspectContract().courses);
    const section=element(".pl-workspace-calendar"),control=menu.querySelector<HTMLInputElement>("input")!;
    const parent=control.parentElement,form=control.form,clicked=vi.fn();control.addEventListener("click",clicked);control.checked=true;
    const box=(left:number,width:number,height:number)=>({...rect(left,width),height,bottom:150+height});
    vi.spyOn(section,"getBoundingClientRect").mockReturnValue(box(200,1200,600));
    const headerBox=vi.spyOn(header,"getBoundingClientRect").mockReturnValue(box(200,1200,52));
    vi.spyOn(button("#ctl00_MainContent_toggleGrid"),"getBoundingClientRect").mockReturnValue(box(240,170,44));
    vi.spyOn(section.querySelector<HTMLElement>(".pl-panel-grip")!,"getBoundingClientRect").mockReturnValue(box(210,24,32));
    vi.spyOn(section.querySelector<HTMLElement>(".pl-pane-toggle")!,"getBoundingClientRect").mockReturnValue(box(1310,42,44));
    vi.spyOn(section.querySelector<HTMLElement>(".pl-panel-close")!,"getBoundingClientRect").mockReturnValue(box(1360,32,32));
    vi.spyOn(menu,"getBoundingClientRect").mockReturnValue(box(422,780,28));
    let offsetParent:HTMLElement=section,scrollWidth=780;
    Object.defineProperty(menu,"offsetParent",{get:()=>offsetParent,configurable:true});
    Object.defineProperty(menu,"scrollWidth",{get:()=>scrollWidth,configurable:true});
    window.dispatchEvent(new Event("resize"));
    expect(section.classList.contains("pl-calendar-inline-tools")).toBe(true);
    expect(section.style.getPropertyValue("--pl-calendar-tools-left")).toBe("222px");
    expect(section.style.getPropertyValue("--pl-calendar-tools-width")).toBe("876px");
    expect(section.style.getPropertyValue("--pl-calendar-tools-top")).toBe("12px");
    section.scrollTop=80;section.dispatchEvent(new Event("scroll"));
    expect(section.style.getPropertyValue("--pl-calendar-tools-top")).toBe("92px");
    offsetParent=grid;window.dispatchEvent(new Event("resize"));expect(section.classList.contains("pl-calendar-inline-tools")).toBe(false);
    offsetParent=section;scrollWidth=1000;window.dispatchEvent(new Event("resize"));expect(section.classList.contains("pl-calendar-inline-tools")).toBe(false);
    scrollWidth=780;headerBox.mockReturnValue(box(200,500,52));window.dispatchEvent(new Event("resize"));expect(section.classList.contains("pl-calendar-inline-tools")).toBe(false);
    expect(menu.parentElement).toBe(grid);expect(control.parentElement).toBe(parent);expect(control.form).toBe(form);expect(control.checked).toBe(true);expect(clicked).not.toHaveBeenCalled();
    control.checked=false;workspace.restore();expect(document.body.innerHTML).toBe(original);
  });
});
