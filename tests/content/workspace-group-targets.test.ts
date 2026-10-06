// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import { type PanelBox, type PanelDock, type PanelDropTarget } from "../../src/content/panel-layout";
import { PlannerWorkspace } from "../../src/content/planner-workspace";
import { createDefaultGroups, openGroupTabs, type WorkspacePanelId } from "../../src/content/workspace-groups";
import { normalizeWorkspaceLayout } from "../../src/storage/workspace-layout";
// @ts-expect-error Shared fictional browser fixture is plain JavaScript.
import { workspaceFixtureHtml } from "../../harness/workspace-fixture.mjs";

// Inspect the calculated targets directly: JSDOM has no native hit-testing or
// clipping, so the fixture supplies the actual rectangles of scrolled tabs.
interface TargetGeometry {
  dockGeometry(): {wholeBoxes:Record<PanelDock,PanelBox>};
  groupDropTargets(id:WorkspacePanelId): PanelDropTarget[];
}

describe("workspace tab strip drop geometry", () => {
  let workspace:PlannerWorkspace,geometry:TargetGeometry;
  const groups=createDefaultGroups();
  for(const id of ["optimizer","study","personal"] as const)groups.panels[id].open=true;
  const rect=(box:PanelBox):DOMRect=>({...box,x:box.left,y:box.top,right:box.left+box.width,bottom:box.top+box.height,toJSON(){}});
  const setTabRects=(scrollLeft=0)=>{
    const {wholeBoxes}=geometry.dockGeometry();
    for(const dock of ["main","right"] as const){
      const box=wholeBoxes[dock],strip=document.querySelector<HTMLElement>(`[data-pl-group="${dock}"]`)!;
      vi.spyOn(strip,"getBoundingClientRect").mockReturnValue(rect(box));
      strip.scrollLeft=dock==="main"?scrollLeft:0;
      openGroupTabs(groups,dock).forEach((id,index)=>{
        const tab=document.querySelector<HTMLElement>(`[data-pl-tab="${id}"]`)!.parentElement!;
        vi.spyOn(tab,"getBoundingClientRect").mockReturnValue(rect({left:box.left+6+index*230-(dock==="main"?scrollLeft:0),top:box.top+4,width:226,height:34}));
      });
    }
    return wholeBoxes;
  };
  beforeEach(()=>{
    vi.stubGlobal("innerWidth",1800);vi.stubGlobal("innerHeight",1000);
    const fixture=new DOMParser().parseFromString(workspaceFixtureHtml(),"text/html");document.body.innerHTML=fixture.body.innerHTML;
    document.querySelector("form")!.addEventListener("submit",event=>event.preventDefault());
    workspace=new PlannerWorkspace();workspace.setSavedLayout(normalizeWorkspaceLayout({version:2,groups,panels:[],module:"classes",mainModule:"classes"}));
    const adapter=new MyUclaPlannerAdapter(document);expect(adapter.inspectContract().ok).toBe(true);
    workspace.reconcile(document,adapter.inspectContract().courses);
    const deck=document.querySelector<HTMLElement>(".pl-workspace-deck")!;
    vi.spyOn(deck,"getBoundingClientRect").mockReturnValue(rect({left:180,top:120,width:1400,height:700}));
    Object.defineProperty(deck,"clientWidth",{value:1400,configurable:true});window.dispatchEvent(new Event("resize"));
    geometry=workspace as unknown as TargetGeometry;
  });
  afterEach(()=>{workspace.restore();vi.restoreAllMocks();vi.unstubAllGlobals();});

  it.each([0,460])("clips tab insertion targets to the visible group after scrolling %ipx", scrollLeft=>{
    const boxes=setTabRects(scrollLeft),targets=geometry.groupDropTargets("schedule");
    const mergeTargets=targets.filter(target=>target.operation.kind==="merge");expect(mergeTargets.length).toBeGreaterThan(0);
    for(const target of mergeTargets){
      const box=boxes[target.operation.dock];
      expect(target.hit.width).toBeGreaterThan(0);
      expect(target.hit.left).toBeGreaterThanOrEqual(box.left);
      expect(target.hit.left+target.hit.width).toBeLessThanOrEqual(box.left+box.width);
    }
  });

  it("does not let clipped main tabs intercept a drop on the neighboring group header",()=>{
    const boxes=setTabRects(),x=boxes.right.left+100,y=boxes.right.top+20;
    const targets=geometry.groupDropTargets("classes");
    const first=targets.find(target=>x>=target.hit.left&&x<=target.hit.left+target.hit.width&&y>=target.hit.top&&y<=target.hit.top+target.hit.height);
    expect(first?.operation.kind).toBe("merge");expect(first?.operation.dock).toBe("right");
  });

  it("keeps short-window native panels within the visible bottom and grows them as the header scrolls away",()=>{
    vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',600);
    const deck=document.querySelector<HTMLElement>('.pl-workspace-deck')!;
    const bounds=vi.spyOn(deck,'getBoundingClientRect').mockReturnValue(rect({left:16,top:408,width:358,height:500}));
    document.querySelector<HTMLButtonElement>('button[data-pl-module=optimizer]')!.click();
    const pane=document.querySelector<HTMLElement>('.classPlanner_ClassOptimizerSection')!;
    const field=pane.querySelector('input')!,parent=field.parentElement;
    const bottom=()=>parseFloat(pane.style.getPropertyValue('--pl-dock-top'))+parseFloat(pane.style.getPropertyValue('--pl-dock-height'));
    expect(bottom()).toBe(600);expect(parseFloat(pane.style.getPropertyValue('--pl-dock-height'))).toBe(152);
    document.querySelector<HTMLElement>('.pl-workspace-host')!.style.setProperty('--pl-workspace-bottom','68px');
    window.dispatchEvent(new Event('resize'));expect(bottom()).toBe(532);
    bounds.mockReturnValue(rect({left:16,top:160,width:358,height:500}));window.dispatchEvent(new Event('resize'));
    expect(bottom()).toBe(532);expect(parseFloat(pane.style.getPropertyValue('--pl-dock-height'))).toBe(332);
    expect(field.parentElement).toBe(parent);expect(field.isConnected).toBe(true);
  });

  it("flips native header help above a short pane without replacing controls or leaving projection styles on Original",async()=>{
    vi.stubGlobal("innerWidth",390);vi.stubGlobal("innerHeight",600);
    document.querySelector<HTMLButtonElement>("button[data-pl-module=study]")!.click();
    const title=document.getElementById("plannerSectionEnip")!;
    vi.spyOn(title,"getBoundingClientRect").mockReturnValue(rect({left:16,top:446,width:358,height:62}));
    const popup=document.createElement("div");popup.className="popover clickover fade bottom in";
    popup.style.cssText="left: -160px; top: 40px; width: 376.6px; display: block;";
    popup.innerHTML='<p>Example native study help</p><button type="button">Close example help</button>';
    Object.defineProperty(popup,"scrollHeight",{value:240,configurable:true});
    const control=popup.querySelector<HTMLButtonElement>("button")!,handler=vi.fn();control.onclick=handler;
    const originalClass=popup.className,originalStyle=popup.style.cssText;
    const positioning=vi.spyOn(workspace as unknown as {positionHeaderHelp():void},"positionHeaderHelp");
    title.append(popup);
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(positioning).toHaveBeenCalled();expect(positioning.mock.calls.length).toBeLessThan(8);
    expect(popup.classList.contains("pl-header-help-floating")).toBe(true);
    const top=parseFloat(popup.style.getPropertyValue("--pl-header-help-top"));
    expect(top).toBe(202);expect(top+popup.scrollHeight).toBeLessThan(446);
    expect(parseFloat(popup.style.getPropertyValue("--pl-header-help-left"))).toBeGreaterThanOrEqual(12);
    expect(popup.parentElement).toBe(title);expect(control.onclick).toBe(handler);
    control.click();expect(handler).toHaveBeenCalledOnce();
    workspace.restore();
    expect(popup.parentElement).toBe(title);expect(popup.className).toBe(originalClass);
    expect(popup.style.cssText).toBe(originalStyle);expect(control.onclick).toBe(handler);
    expect(title.closest("section")!.classList.contains("pl-header-help-open")).toBe(false);
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(popup.className).toBe(originalClass);expect(popup.style.cssText).toBe(originalStyle);
  });
});
