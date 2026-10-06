// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerWorkspace } from "../../src/content/planner-workspace";
import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import { normalizeWorkspaceLayout, type WorkspaceLayoutPreference } from "../../src/storage/workspace-layout";
// @ts-expect-error Shared browser fixture is plain JavaScript.
import { workspaceFixtureHtml, introductionFixtureHtml } from "../../harness/workspace-fixture.mjs";

describe("occupied panels fill the planner",()=>{
  let workspace:PlannerWorkspace,adapter:MyUclaPlannerAdapter;
  const saved=vi.fn();
  const element=(selector:string)=>document.querySelector<HTMLElement>(selector)!;
  const button=(selector:string)=>document.querySelector<HTMLButtonElement>(selector)!;
  const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}});
  const value=(node:HTMLElement,key:string)=>parseFloat(node.style.getPropertyValue(`--pl-dock-${key}`));
  const mount=(preferences:Partial<WorkspaceLayoutPreference>)=>{
    workspace.setSavedLayout(normalizeWorkspaceLayout({version:1,module:'classes',mainModule:'classes',panels:[],...preferences}));
    workspace.reconcile(document,adapter.inspectContract().courses);
    const deck=element('.pl-workspace-deck');Object.defineProperty(deck,'clientWidth',{value:1200,configurable:true});
    vi.spyOn(deck,'getBoundingClientRect').mockImplementation(()=>rect(200,150,1200,600));
    const classes=element('.pl-workspace-plan');vi.spyOn(classes,'getBoundingClientRect').mockImplementation(()=>rect(value(classes,'left')||200,150,value(classes,'width')||768,600));
    window.dispatchEvent(new Event('resize'));
  };
  beforeEach(()=>{
    document.body.innerHTML=new DOMParser().parseFromString(workspaceFixtureHtml(),'text/html').body.innerHTML;
    vi.stubGlobal('innerWidth',1600);saved.mockClear();workspace=new PlannerWorkspace(()=>{},saved);adapter=new MyUclaPlannerAdapter(document);
    document.querySelector('form')!.addEventListener('submit',event=>event.preventDefault());
  });
  afterEach(()=>{workspace.restore();vi.restoreAllMocks();vi.unstubAllGlobals();});

  it.each(['left','right'] as const)('the sole %s calendar fills the deck and restores the remembered split when Classes reopens',async(side)=>{
    mount({panels:[{id:'classes',placement:'main',hidden:true},{id:'find',placement:'main',hidden:true},{id:'schedule',placement:side}],dockSizes:{left:340},scheduleWidth:700});
    const calendar=element('.pl-workspace-calendar'),deck=element('.pl-workspace-deck');
    expect(deck.classList.contains('pl-no-main-dock')).toBe(true);expect(value(calendar,'width')).toBe(1200);expect(value(calendar,'left')).toBe(200);
    expect([...document.querySelectorAll<HTMLElement>('.pl-dock-divider')].every(divider=>divider.hidden)).toBe(true);
    await Promise.resolve();expect(saved).not.toHaveBeenCalled();
    button('button[data-pl-module=classes]').click();await Promise.resolve();
    expect(deck.classList.contains('pl-no-main-dock')).toBe(false);
    if(side==='left')expect(value(calendar,'width')).toBe(340);
    else expect(deck.style.getPropertyValue('--pl-schedule-width')).toBe('700px');
    expect(saved.mock.calls.at(-1)![0].dockSizes).toEqual({left:340});expect(saved.mock.calls.at(-1)![0].scheduleWidth).toBe(700);
  });

  it('uses a single divider between two occupied edges and responds to its keyboard resizing',async()=>{
    mount({panels:[{id:'classes',placement:'main',hidden:true},{id:'find',placement:'left'},{id:'schedule',placement:'right'}],dockSizes:{left:340,right:460}});
    const left=element('.pl-workspace-search'),right=element('.pl-workspace-calendar'),divider=element('[data-pl-dock-divider=left]');
    expect(value(left,'width')+value(right,'width')).toBeCloseTo(1188);expect(value(right,'left')-value(left,'left')-value(left,'width')).toBeCloseTo(12);
    expect(divider.hidden).toBe(false);expect(element('[data-pl-dock-divider=right]').hidden).toBe(true);
    await Promise.resolve();expect(saved).not.toHaveBeenCalled();
    const before=value(left,'width');divider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
    expect(value(left,'width')-before).toBeCloseTo(16,0);expect(value(left,'width')+value(right,'width')).toBeCloseTo(1188);
    divider.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
    expect(value(left,'width')).toBe(988);expect(value(right,'width')).toBe(200);
    await Promise.resolve();expect(saved.mock.calls.at(-1)![0].dockSizes).toEqual({left:988,right:200});
    button('[data-pl-panel-close=find]').click();expect(value(right,'width')).toBe(1200);expect(divider.hidden).toBe(true);
  });

  it('treats Find fallback and Information as occupied main areas, not standby native modules',()=>{
    document.body.innerHTML=new DOMParser().parseFromString(introductionFixtureHtml(),'text/html').body.innerHTML;
    mount({panels:[{id:'classes',placement:'main',hidden:true},{id:'schedule',placement:'left'}],dockSizes:{left:340}});
    expect(element('.pl-workspace-host').dataset.plModule).toBe('find');expect(value(element('.pl-workspace-calendar'),'width')).toBe(340);
    button('[data-pl-panel-close=find]').click();expect(element('.pl-workspace-deck').classList.contains('pl-no-main-dock')).toBe(true);
    button('.pl-intro-info').click();expect(element('.pl-workspace-host').dataset.plModule).toBe('information');
    expect(element('.pl-workspace-deck').classList.contains('pl-no-main-dock')).toBe(false);expect(value(element('.pl-workspace-calendar'),'width')).toBe(340);
  });

  it('keeps full-width docked Classes in the wide details presentation',()=>{
    mount({panels:[{id:'classes',placement:'left'},{id:'find',placement:'main',hidden:true},{id:'schedule',placement:'right',hidden:true}]});
    const classes=element('.pl-workspace-plan');expect(value(classes,'width')).toBe(1200);
    expect(element('.pl-workspace-main').dataset.plMainSize).toBe('wide');expect(classes.classList.contains('pl-panel-small')).toBe(false);
  });

  it('keeps the empty-workspace placeholder when every dock is closed',()=>{
    mount({panels:[{id:'classes',placement:'main',hidden:true},{id:'find',placement:'main',hidden:true},{id:'schedule',placement:'right',hidden:true}]});
    expect(element('.pl-workspace-main').classList.contains('pl-main-empty')).toBe(true);
    expect(element('.pl-workspace-deck').classList.contains('pl-no-main-dock')).toBe(false);
  });
});
