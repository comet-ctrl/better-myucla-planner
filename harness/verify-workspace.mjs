/** Production extension QA on fictional HTML, with every network request intercepted. */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { workspaceFixtureHtml, introductionFixtureHtml, futureQuarterFixtureHtml, unknownModuleFixtureHtml } from './workspace-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'../../outputs/planner-workspace-v0.17.0');
const workspaceWidths=process.env.BETTER_MYUCLA_QA_WIDTHS?.split(',').map(Number)||[2048,1440,1366,1536,1280,1200,1100,960,390];
assert.ok(workspaceWidths.length&&workspaceWidths.every(width=>Number.isInteger(width)&&width>=320&&width<=3840),'QA widths must be bounded whole pixels');
const url='https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx',fixture=workspaceFixtureHtml(6,true);
const js=await readFile(resolve(root,'dist/content.js'),'utf8'),css=await readFile(resolve(root,'dist/injected.css'),'utf8');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BETTER_MYUCLA_CHROMIUM||undefined});
const setup=async(page,html,compactHeader=false,ready='.pl-workspace-deck')=>{
 const errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url()===url ? route.fulfill({status:200,contentType:'text/html',body:html}) : (requests.push(route.request().url()),route.abort()));
 await page.goto(url);
 await page.evaluate(compactHeader=>{
  const listeners=[];
  const stored={'plannerLift.layout.v1':{tidy:true},'plannerLift.header.v1':{compact:compactHeader}};
  window.fixturePreferences=stored;
  window.chrome={storage:{local:{get:async key=>({[key]:stored[key]}),set:async values=>Object.assign(stored,values),remove:async key=>delete stored[key]},onChanged:{addListener:fn=>listeners.push(fn),removeListener:()=>{}}}};
  window.toggleTidy=tidy=>listeners.forEach(fn=>fn({'plannerLift.layout.v1':{newValue:{tidy}}},'local'));
  window.nativeFields=[...document.querySelectorAll('input,select')];
  window.nativeCalendarControls=[...document.querySelectorAll('.plannerMenuLinks button,.plannerMenuLinks input,.plannerMenuLinks select,#gridDiv a,#gridDiv button')].map(node=>({node,parent:node.parentElement,handler:node.getAttribute('onclick')}));
  window.nativeCalendarMeetings=[...document.querySelectorAll('#gridDiv .planneritembox')].map(node=>({node,parent:node.parentElement,top:node.style.top,height:node.style.height}));
  window.nativeModuleControls=[...document.querySelectorAll('.classPlanner_ClassOptimizerSection button,.classPlanner_ClassOptimizerSection input,.classPlanner_ClassOptimizerSection select,.classPlanner_EnrolledNotInPlanSection button,.classPlanner_EnrolledNotInPlanSection input,.classPlanner_PersonalTimeBlocksSection button,.classPlanner_PersonalTimeBlocksSection input,.classPlanner_PersonalTimeBlocksSection select,.plannerTopMenuLinks button')].map(node=>({node,parent:node.parentElement,handler:node.getAttribute('onclick')}));
  window.nativeModuleWrappers=[...document.querySelectorAll('#HelpOptimizerDiv,#panelOptimizer,#panelNotplan,#panelPersonal')].map(node=>({node,parent:node.parentElement}));
  window.nativePlanRows=[...document.querySelectorAll('tbody.courseItem > tr:nth-child(3)')].map(node=>({node,parent:node.parentElement}));
  window.nativePlanMenu=document.querySelector('.plannerTopMenuLinks');window.nativePlanMenuParent=window.nativePlanMenu?.parentElement;
  window.nativeCommands=[...document.querySelectorAll('.OrderingButtons button')].map(node=>({node,parent:node.parentElement,command:node.getAttribute('onclick'),visible:!!node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'}));
  window.nativeCommandClicks=0;document.addEventListener('click',event=>{if(event.target.closest?.('.OrderingButtons button'))window.nativeCommandClicks++;},true);
  window.nativeResultControls=[...document.querySelectorAll('.ClassSearchList button,.ClassSearchList input,.ClassSearchList select,.ClassSearchList a')].map(node=>({node,parent:node.parentElement}));
  window.nativeResultHeadings=[...document.querySelectorAll('.ClassSearchList .header-row > div')].map(node=>({node,html:node.innerHTML}));
  window.nativeDetails=document.querySelector('tbody.courseItem > tr:nth-child(3)');window.nativeDetailsParent=window.nativeDetails?.parentElement;
  window.nativeNavigation=document.getElementById('fixture-native-navigation');window.nativeNavigationHtml=window.nativeNavigation.outerHTML;
  window.nativeTerm=document.getElementById('ctl00_MainContent_termSessionChooser_TermChooser');window.nativeTermParent=window.nativeTerm.parentElement;
  window.nativeSidebar=document.querySelector('right-sidebar');window.nativeSidebarParent=window.nativeSidebar?.parentElement;
  window.nativeIntroduction=document.getElementById('page_title_text');window.nativeIntroductionHtml=window.nativeIntroduction?.innerHTML;
  window.nativeWorkspaceTop=document.querySelector('.classPlannerWrapper')?.getBoundingClientRect().top;
  window.nativeStatuses=[...document.querySelectorAll('table.coursetable td:nth-child(3),.ClassSearchList .data_row > .span3')].map(node=>({node,html:node.innerHTML}));
  window.nativeResultClickCount=0;document.querySelectorAll('.ClassSearchList .class-title a').forEach(node=>node.addEventListener('click',()=>window.nativeResultClickCount++));
 },compactHeader);
 await page.addStyleTag({content:css});await page.addScriptTag({content:js});await page.waitForSelector(ready);
 return {errors,requests};
};
const verifyResultHeadings=async(page)=>{
 const result=await page.locator('.pl-browser-body-active').evaluate(body=>{
  const preview=body.closest('.pl-browser-list'),heading=body.querySelector('.pl-section-result-heading'),row=body.querySelector('.pl-section-card');
  const visible=node=>!!node&&!!node.getClientRects().length&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden';
  const width=preview.clientWidth,wide=width>=640;
  const alignment=[0,1,2,3,4,5,7].map(field=>{
   const head=heading?.querySelector(`[data-pl-field="${field}"]`),cell=row?.querySelector(`[data-pl-field="${field}"]`);
   const h=head?.getBoundingClientRect(),c=cell?.getBoundingClientRect();
   return {field,visible:visible(head),left:h&&c?Math.abs(h.left-c.left):null,right:h&&c?Math.abs(h.right-c.right):null};
  });
  const labels=[1,4,5,7].map(field=>{
   const label=row?.querySelector(`[data-pl-field="${field}"] > .pl-section-label`),style=label&&getComputedStyle(label),rect=label?.getBoundingClientRect();
   return {field,exists:!!label,accessible:!!label&&style.display!=='none'&&style.visibility!=='hidden'&&label.getAttribute('aria-hidden')!=='true',compact:!!rect&&rect.width<=2&&rect.height<=2,visible:visible(label),height:rect?.height};
  });
  const help=[...heading?.querySelectorAll('button,a,input,select')||[]].map(node=>({visible:visible(node),focusable:node.tabIndex>=0&&!node.disabled,field:node.parentElement?.getAttribute('data-pl-field'),height:node.getBoundingClientRect().height}));
  return {width,wide,heading:!!heading,headerFields:heading?.children.length,alignment,labels,help};
 });
 assert.ok(result.heading&&result.headerFields===9,'the validated native result header retains all nine indexed cells');
 assert.ok(result.help.length>=4&&result.help.every(control=>control.visible&&control.focusable&&control.height>1),'native header help, including Location and Instructor, stays directly accessible');
 assert.ok(result.labels.every(label=>label.exists&&label.accessible),'per-row labels remain available to assistive technology');
 if(result.wide){
  assert.ok(result.alignment.every(field=>field.visible&&field.left<=1&&field.right<=1),`shared headings line up with their section fields: ${JSON.stringify(result)}`);
  assert.ok(result.labels.every(label=>label.compact),`wide results hide repeated visual labels: ${JSON.stringify(result.labels)}`);
  const list=page.locator('.pl-browser-list'),priorScroll=await list.evaluate(node=>node.scrollTop);
  await list.evaluate(node=>{node.scrollTop=node.scrollHeight;});
  const sticky=await page.locator('.pl-browser-body-active .pl-section-result-heading').evaluate(node=>{const bounds=node.getBoundingClientRect(),preview=node.closest('.pl-browser-list').getBoundingClientRect();return {position:getComputedStyle(node).position,top:bounds.top,bottom:bounds.bottom,previewTop:preview.top,previewBottom:preview.bottom};});
  assert.ok(sticky.position==='sticky'&&sticky.top>=sticky.previewTop-1&&sticky.bottom<=sticky.previewBottom+1,`shared headings remain available while preview rows scroll: ${JSON.stringify(sticky)}`);
  await list.evaluate((node,top)=>{node.scrollTop=top;},priorScroll);
 }else{
  assert.ok(result.alignment.filter(field=>[0,1,3,4,5].includes(field.field)).every(field=>!field.visible),'narrow results retain only native header help controls');
  assert.ok(result.labels.every(label=>label.visible&&label.height>2),'narrow section cards keep their individual visible labels');
 }
};
const assertUnclipped=async(locator,label)=>{
 const bounds=await locator.evaluate(node=>{
  // Fixed native details can escape a scrolling ancestor. Hit-testing follows
  // the browser's actual clipping/stacking rules instead of guessing its block.
  const rect=node.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
  const points=[[x,y],[rect.left+3,rect.top+3],[rect.right-3,rect.top+3],[rect.left+3,rect.bottom-3],[rect.right-3,rect.bottom-3]];
  return {x:rect.left,y:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height,viewport:{width:innerWidth,height:innerHeight},hits:points.map(([left,top])=>node.contains(document.elementFromPoint(left,top)))};
 });
 assert.ok(bounds.width>0&&bounds.height>0&&bounds.x>=-1&&bounds.y>=-1&&bounds.right<=bounds.viewport.width+1&&bounds.bottom<=bounds.viewport.height+1&&bounds.hits.every(Boolean),label+': '+JSON.stringify(bounds));
};
const assertCalendarPreserved=async(page)=>{
 assert.ok(await page.evaluate(()=>window.nativeCalendarControls.every(({node,parent,handler})=>node.isConnected&&node.parentElement===parent&&node.getAttribute('onclick')===handler)&&window.nativeCalendarMeetings.every(({node,parent,top,height})=>node.isConnected&&node.parentElement===parent&&node.style.top===top&&node.style.height===height)),'resizing retains native calendar controls, handlers, meeting nodes and time geometry');
 const geometry=await page.locator('#gridDiv .planneritembox').evaluateAll(nodes=>nodes.map(node=>({overflow:node.getBoundingClientRect().right-node.parentElement.getBoundingClientRect().right,height:node.getBoundingClientRect().height,intended:parseFloat(node.style.height)+(node.style.border.includes('double')?6:2)})));
 assert.ok(geometry.length&&geometry.every(box=>box.overflow<=1&&Math.abs(box.height-box.intended)<1),'native calendar meetings fit their columns without changing duration');
};
try {
 for(const width of [2048,1440,1366,1280,960]){
  const preview=await browser.newPage({viewport:{width,height:900}}),checks=await setup(preview,introductionFixtureHtml(),true);
  await preview.waitForFunction(()=>document.getElementById('titleText').getBoundingClientRect().top<=13);
  await preview.screenshot({path:resolve(out,`compact-plan-${width}.png`)});
  await preview.locator('[data-pl-workspace-details]').first().click();await preview.screenshot({path:resolve(out,`compact-class-details-${width}.png`)});
  await preview.locator('.pl-workspace-nav [data-pl-module="find"]').click();
  await preview.screenshot({path:resolve(out,`compact-find-${width}.png`)});
  assert.deepEqual(checks.errors,[]);assert.deepEqual(checks.requests,[]);await preview.close();
 }
 for(const width of process.env.BETTER_MYUCLA_QA_FOCUS==='extras'?[]:workspaceWidths){
  const height=width===1536?735:900,page=await browser.newPage({viewport:{width,height},hasTouch:width===390});
  const {errors,requests}=await setup(page,fixture);
  const moduleButton=key=>page.locator('.pl-workspace-nav [data-pl-module="'+key+'"]');
  const classes=moduleButton('classes'),find=moduleButton('find'),schedule=page.locator('.pl-workspace-calendar');
  const nativePreserved=()=>page.evaluate(()=>window.nativeFields.every(node=>node.isConnected&&node.form===document.getElementById('aspnetForm'))&&window.nativeCommands.every(({node,parent,command})=>node.isConnected&&node.parentElement===parent&&node.getAttribute('onclick')===command)&&window.nativeModuleControls.every(({node,parent,handler})=>node.isConnected&&node.parentElement===parent&&node.getAttribute('onclick')===handler&&node.form===document.getElementById('aspnetForm'))&&window.nativeModuleWrappers.every(({node,parent})=>node.isConnected&&node.parentElement===parent)&&window.nativePlanRows.every(({node,parent})=>node.isConnected&&node.parentElement===parent)&&window.nativeResultControls.every(({node,parent})=>node.isConnected&&node.parentElement===parent)&&window.nativeResultHeadings.every(({node,html})=>node.innerHTML===html)&&window.nativeStatuses.every(({node,html})=>node.innerHTML===html)&&window.nativeNavigation.outerHTML===window.nativeNavigationHtml);
  assert.equal(await page.locator('.pl-workspace-main > section').count(),5,'all five native task modules remain available');
  assert.equal(await page.locator('.pl-workspace-nav [data-pl-module]').count(),6,'all primary modules and Schedule are directly reachable');
  assert.equal(await classes.getAttribute('aria-pressed'),'true');
  const navBoxes=await page.locator('.pl-workspace-nav-main button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
  assert.ok(navBoxes.every(box=>box.height>=38),'module destinations remain comfortable targets');
  if(width>=1280)assert.ok(navBoxes.every(box=>Math.abs(box.x-navBoxes[0].x)<=1)&&navBoxes.at(-1).y>navBoxes[0].y,'wide navigation forms a left rail');
  else assert.ok(navBoxes.every(box=>Math.abs(box.y-navBoxes[0].y)<=1),'narrow navigation forms a horizontal strip');
  assert.equal(await page.locator('form').count(),1);assert.ok(await nativePreserved());
  assert.equal(await page.locator('[data-pl-status-badge], [data-pl-section-status], [data-pl-status-original]').count(),0);
  assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'workspace has no page overflow');
  const assertCalendar=async()=>{
   assert.equal(await schedule.isVisible(),width>=1100,'desktop calendar remains beside the selected module');
   if(width>=1100){const main=await page.locator('.pl-workspace-main').boundingBox(),cal=await schedule.boundingBox();assert.ok(main.x+main.width<=cal.x&&cal.width>=420&&cal.y+cal.height<=height+1,'calendar is adjacent, readable and within the viewport');await assertUnclipped(schedule,'calendar is not clipped by a native ancestor');}
  };
  await assertCalendar();
  await classes.press('End');assert.equal(await moduleButton('schedule').evaluate(node=>node===document.activeElement),true);await moduleButton('schedule').press('Home');assert.equal(await classes.getAttribute('aria-pressed'),'true','module navigation supports keyboard movement through Schedule');
  const firstDetails=page.locator('[data-pl-workspace-details]').first(),firstActions=page.locator('.pl-workspace-actions-button').first(),firstCard=page.locator('tbody.courseItem').first();
  assert.equal(await page.locator('[data-pl-workspace-details]').count(),6);
  assert.ok(await page.locator('.pl-workspace-course-summary').evaluateAll(summaries=>summaries.length===6&&summaries.every(node=>{const rows=[...node.closest('tbody.courseItem').querySelector('table.coursetable').rows].filter(row=>row.cells.length===9&&row.cells[0].tagName==='TD'&&row.style.display!=='none');return node.children.length===rows.length&&rows.length===2&&rows.every((row,i)=>[1,4,5,2].every(field=>node.children[i].querySelector('[data-pl-summary-field="'+field+'"]').textContent.replace(/\s+/g,' ').trim()===row.cells[field].textContent.replace(/\s+/g,' ').trim()));})),'each lecture and discussion keeps its own days, time and native status in the summary');
  assert.ok(await firstDetails.evaluate(node=>node.parentElement.matches('td.linkPanelRight')&&node.parentElement.firstElementChild===node));
  await firstDetails.focus();await firstDetails.press('Tab');assert.ok(await firstActions.evaluate(node=>node===document.activeElement));
  await page.keyboard.press('Shift+Tab');assert.ok(await firstDetails.evaluate(node=>node===document.activeElement));
  if(width===390)await firstActions.tap();else await firstActions.press('Enter');
  assert.equal(await firstActions.getAttribute('aria-expanded'),'true');
  assert.ok((await firstActions.boundingBox()).height>=38);assert.ok(await firstCard.locator('.OrderingButtons').isVisible());assert.ok(await firstCard.locator('[data-pl-position]').isVisible());
  assert.ok(await firstCard.locator('[data-pl-action="drag"]').isVisible());
  const more=firstCard.locator('.pl-course-more');await more.click();assert.ok(await firstCard.locator('[data-pl-action="tag"]').isVisible());assert.ok(await firstCard.locator('[data-pl-action="top"]').isVisible());
  await page.keyboard.press('Escape');assert.equal(await firstActions.getAttribute('aria-expanded'),'true');assert.ok(await more.evaluate(node=>node===document.activeElement));
  await page.keyboard.press('Escape');assert.equal(await firstActions.getAttribute('aria-expanded'),'false');assert.ok(await firstActions.evaluate(node=>node===document.activeElement));
  await firstActions.click();await more.click();await firstCard.locator('[data-pl-action="tag"]').click();const note=firstCard.locator('[data-pl-tag]');await note.fill('Fictional note');await firstActions.click();
  assert.equal(await firstActions.getAttribute('aria-expanded'),'false','note blur does not swallow the close action');await firstActions.click();assert.ok(await note.isVisible());assert.equal(await note.inputValue(),'Fictional note');
  await note.fill('');await firstActions.click();assert.equal(await firstActions.getAttribute('aria-expanded'),'false');
  await firstActions.click();const planMenu=page.locator('.pl-workspace-plan-actions'),planMenuSummary=planMenu.locator('summary');await planMenuSummary.click();assert.equal(await page.locator('.plannerTopMenuLinks button:visible').count(),7);
  await page.keyboard.press('Escape');assert.equal(await planMenu.evaluate(node=>node.open),false);assert.equal(await firstActions.getAttribute('aria-expanded'),'true','foreground Plan actions closes before class actions');assert.ok(await planMenuSummary.evaluate(node=>node===document.activeElement));
  await page.keyboard.press('Escape');assert.equal(await firstActions.getAttribute('aria-expanded'),'false');assert.ok(await firstActions.evaluate(node=>node===document.activeElement));
  await firstActions.click();const lastActions=page.locator('.pl-workspace-actions-button').last();await lastActions.scrollIntoViewIfNeeded();const rootBefore=await page.evaluate(()=>scrollY);
  if(width===390)await lastActions.tap();else await lastActions.press('Enter');assert.equal(await firstActions.getAttribute('aria-expanded'),'false');
  const reachable=await lastActions.evaluate(button=>[button,...button.parentElement.querySelectorAll('.OrderingButtons button,[data-pl-action="drag"],[data-pl-position],.pl-course-more')].filter(node=>getComputedStyle(node).visibility!=='hidden').map(node=>{const r=node.getBoundingClientRect();let top=0,bottom=innerHeight;for(let p=node.parentElement;p&&p!==document.body;p=p.parentElement){if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,clipTop:top,clipBottom:bottom,width:innerWidth};}));
  assert.ok(reachable.every(b=>b.top>=b.clipTop-1&&b.bottom<=b.clipBottom+1&&b.left>=0&&b.right<=b.width),'last class actions stay reachable');assert.equal(await page.evaluate(()=>scrollY),rootBefore);
  await page.keyboard.press('Escape');assert.ok(await lastActions.evaluate(node=>node===document.activeElement));await firstDetails.scrollIntoViewIfNeeded();
  await firstDetails.click();assert.equal(await firstDetails.getAttribute('aria-expanded'),'true');assert.ok(await page.locator('.pl-workspace-preview').isVisible());
  assert.ok(await nativePreserved());const detailRow=page.locator('tbody.pl-workspace-preview-card > tr:nth-child(3)');assert.ok(await detailRow.isVisible());
  const detailRect=await detailRow.boundingBox();assert.ok(detailRect.width>200&&detailRect.x>=0&&detailRect.x+detailRect.width<=width+1,'selected native details fit the viewport');await assertCalendar();
  const slot=await page.locator('.pl-workspace-details-slot').boundingBox();assert.ok(Math.abs(detailRect.x-slot.x)<=1&&detailRect.width<=slot.width+1,'details docks to its dedicated slot without moving native rows');
  await assertUnclipped(page.getByRole('button',{name:'Close details',exact:true}),'selected details close control is reachable');
  if(width===1440||width===1280||width===960||width===390)await page.screenshot({path:resolve(out,'class-details-'+width+'.png')});
  await page.keyboard.press('Escape');assert.equal(await firstDetails.getAttribute('aria-expanded'),'false');assert.ok(await firstDetails.evaluate(node=>node===document.activeElement));
  await firstDetails.click();const close=page.getByRole('button',{name:'Close details',exact:true});assert.ok((await close.boundingBox()).height>=40);await close.click();assert.ok(await firstDetails.evaluate(node=>node===document.activeElement));
  await firstActions.click();await find.click();assert.equal(await firstActions.getAttribute('aria-expanded'),'false','changing module closes class actions');await classes.click();await firstDetails.click();await find.click();assert.ok(await page.locator('.pl-workspace-search').isVisible());await assertCalendar();
  assert.ok(await page.locator('input#searchTier0').isVisible(),'search fields remain available with loaded results');assert.ok(await page.locator('#ctl00_MainContent_cs_searchBy').isVisible(),'native Search By stays directly reachable');
  await page.locator('input#searchTier0').fill('Example subject');
  if(width===390)await page.screenshot({path:resolve(out,'find-initial-390.png')});
  assert.equal(await page.locator('.pl-browser-index button').count(),3);await page.locator('.pl-browser-index button').nth(2).click();assert.ok(await page.locator('#container_course_M2').isVisible());
  assert.equal(await page.evaluate(()=>window.nativeResultClickCount),0,'local preview does not run a native fetch');
  assert.ok(await page.locator('.pl-browser-list').evaluate(node=>node.scrollWidth<=node.clientWidth+1));await verifyResultHeadings(page);
  assert.ok(await page.locator('.pl-browser-body-active .pl-section-card').first().evaluate(node=>[1,2,4,5].every(field=>parseFloat(getComputedStyle(node.querySelector('[data-pl-field="'+field+'"]')).fontSize)>=14)),'primary section values remain readable');
  assert.equal(await page.locator('.pl-browser-toolbar button').count(),0,'room/instructor metadata needs no extra disclosure');
  assert.ok(await page.locator('.pl-browser-body-active .data_row > .span7').first().isVisible());for(const field of [6,8])assert.ok(await page.locator('.pl-browser-body-active .data_row [data-pl-field="'+field+'"] > .pl-section-label').first().isVisible());
  assert.ok(await page.locator('#fixture-result-footer button').isVisible());
  const localFilter=page.getByRole('searchbox',{name:'Filter loaded courses',exact:true});await localFilter.fill('Example course B');await localFilter.press('Enter');assert.equal(await page.locator('.pl-browser-index button:visible').count(),1);assert.ok(await page.locator('#container_course_M1').isVisible());
  await localFilter.fill('');await page.locator('.pl-browser-index button').first().press('End');assert.equal(await page.locator('.pl-browser-index button').last().getAttribute('aria-pressed'),'true');
  if(width===2048||width===1440||width===1366||width===1280||width===960||width===390)await page.screenshot({path:resolve(out,'find-classes-'+width+'.png')});
  const selection=page.locator('#container_course_M2 .data_row input').first();await selection.check();await page.locator('.pl-browser-index button').first().click();assert.ok(await page.locator('.pl-browser-selections').isVisible());assert.ok(await selection.isChecked());
  await page.locator('.pl-browser-selections > summary').click();await page.locator('.pl-browser-selection-actions button').click();assert.ok(await selection.isVisible());assert.ok(await selection.isChecked());assert.ok(await selection.evaluate(node=>node===document.activeElement));await selection.uncheck();assert.equal(await page.locator('.pl-browser-selections').isVisible(),false);
  await classes.click();assert.ok(await page.locator('.pl-workspace-preview').isVisible(),'selected class details survive switching modules');assert.equal(await firstDetails.getAttribute('aria-expanded'),'true');await close.click();
  if(width===2048||width===1440||width===1366||width===960||width===390)await page.screenshot({path:resolve(out,'plan-'+width+'.png')});
  for(const key of ['optimizer','study','personal']){
   await moduleButton(key).click();assert.equal(await moduleButton(key).getAttribute('aria-pressed'),'true');await assertCalendar();
   if(key==='optimizer'){assert.ok(await page.locator('#HelpOptimizerDiv').isVisible());assert.equal(await page.locator('#panelOptimizer').isVisible(),false,'native conditional optimizer state is preserved');await page.locator('[data-fixture-optimizer-help]').click();assert.ok(await page.locator('#panelOptimizer').isVisible());await page.locator('[name="exampleOptimizerPriority"]').selectOption('afternoon');}
   if(key==='study')await page.locator('[name="exampleStudyEntry"]').check();
   if(key==='personal'){await page.locator('[name="examplePersonalEntry"]').fill('Fictional study time');await page.locator('[name="examplePersonalDay"]').selectOption('friday');}
   await page.locator('[data-fixture-module-action="'+key+'"]').click();assert.equal(await page.locator('[data-fixture-module="'+key+'"] output').innerText(),'Example '+key+' preview ready','original module handler still works');assert.ok(await nativePreserved());
  }
  await moduleButton('optimizer').click();assert.equal(await page.locator('[name="exampleOptimizerPriority"]').inputValue(),'afternoon');await moduleButton('study').click();assert.ok(await page.locator('[name="exampleStudyEntry"]').isChecked());await moduleButton('personal').click();assert.equal(await page.locator('[name="examplePersonalEntry"]').inputValue(),'Fictional study time');
  await find.click();assert.ok(await page.locator('.pl-browser-list').isVisible());assert.ok(await page.locator('input#searchTier0').isVisible());assert.equal(await page.locator('input#searchTier0').inputValue(),'Example subject','module changes preserve the original query field');
  if(width===1440){
   for(const key of ['find','personal']){
    await moduleButton(key).click();await planMenu.evaluate((node,open)=>{node.open=open;},key==='personal');await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.pl-workspace-main > section:visible').count(),5,'printing includes all native task modules');assert.ok(await schedule.isVisible());assert.equal(await page.locator('.pl-browser-body:visible').count(),3);assert.ok(await page.locator('.pl-browser-body .data_row > .span7').first().isVisible());assert.ok(await page.locator('.pl-browser-body .data_row > .span9').first().isVisible());
    assert.equal(await page.locator('.pl-workspace-actions-button:visible').count(),0);assert.equal(await page.locator('td.linkPanelRight .OrderingButtons:visible').count(),6);assert.equal(await page.locator('.pl-workspace-nav').isVisible(),false);
    await page.emulateMedia({media:'screen'});await page.evaluate(()=>dispatchEvent(new Event('afterprint')));assert.equal(await moduleButton(key).getAttribute('aria-pressed'),'true','print preserves module choice');assert.equal(await planMenu.evaluate(node=>node.open),key==='personal','print restores the Plan actions disclosure');
   }
  }
  await classes.click();
  await page.locator('#plannerSectionClip > button.planSectionToggle').click();assert.equal(await page.locator('#panelPlan').isVisible(),false);assert.ok(await classes.evaluate(node=>node===document.activeElement));await classes.press('Enter');assert.ok(await page.locator('#panelPlan').isVisible(),'module navigation reopens its collapsed native pane');
  if(width>=1100){
   const sep=page.locator('.pl-workspace-splitter'),widen=page.locator('.pl-workspace-schedule-widen');assert.ok(await sep.isVisible());assert.ok(await widen.isVisible());const min=Number(await sep.getAttribute('aria-valuemin')),max=Number(await sep.getAttribute('aria-valuemax'));
   const defaultWidth=(await schedule.boundingBox()).width,preferences=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(window.fixturePreferences).filter(([key])=>key!=='plannerLift.workspace.v1'))));
   await widen.click();assert.equal(await widen.getAttribute('aria-pressed'),'true');assert.equal(await widen.getAttribute('aria-label'),'Restore schedule width');
   const expandedWidth=(await schedule.boundingBox()).width;assert.ok(Math.abs(expandedWidth-max)<=1&&expandedWidth>defaultWidth,'Widen uses available room beside browsing');
   if(width>=1440)assert.ok(expandedWidth>640,'wide desktops can enlarge the calendar beyond the former 640px cap');
   assert.ok((await page.locator('.pl-workspace-main').boundingBox()).width>=419,'the largest calendar retains a usable browsing pane');
   assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'Widen introduces no page overflow');await assertCalendarPreserved(page);
   await widen.click();assert.equal(await widen.getAttribute('aria-pressed'),'false');assert.ok(Math.abs((await schedule.boundingBox()).width-defaultWidth)<=1,'Restore width returns to the previous automatic width');
   await sep.press('Home');assert.ok(Math.abs((await schedule.boundingBox()).width-min)<=1);await sep.press('ArrowLeft');if(max>min)assert.ok((await schedule.boundingBox()).width>min,'keyboard divider changes schedule width');
   const manualWidth=(await schedule.boundingBox()).width;await widen.click();await widen.click();assert.ok(Math.abs((await schedule.boundingBox()).width-manualWidth)<=1,'Restore width returns to the exact manual divider setting');
   await sep.press('End');const after=(await schedule.boundingBox()).width;assert.ok(Math.abs(after-max)<=1);const h=await sep.boundingBox();await page.mouse.move(h.x+h.width/2,h.y+20);await page.mouse.down();await page.mouse.move(h.x+35,h.y+20,{steps:8});await page.mouse.up();if(max>min)assert.ok((await schedule.boundingBox()).width<after,'pointer divider changes schedule width');await sep.dblclick();
   assert.ok(Math.abs((await schedule.boundingBox()).width-defaultWidth)<=1,'double-click restores the original default proportions');
   await page.waitForFunction(()=>window.fixturePreferences['plannerLift.workspace.v1']?.scheduleWidth===null);
   assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(window.fixturePreferences).filter(([key])=>key!=='plannerLift.workspace.v1')))),preferences,'calendar sizing changes only the requested workspace preference');
   assert.equal(await page.evaluate(()=>window.fixturePreferences['plannerLift.workspace.v1'].scheduleExpanded),false,'restoring default proportions is remembered');
  }else{
   const toggle=page.locator('.pl-workspace-schedule-toggle');await toggle.click();assert.ok(await schedule.isVisible());assert.equal(await page.locator('.pl-workspace-schedule-widen').isVisible(),false,'narrow full-width calendar needs no Widen action');assert.equal(await page.locator('.pl-workspace-main').isVisible(),false);await page.keyboard.press('Escape');assert.ok(await page.locator('.pl-workspace-main').isVisible());assert.equal(await schedule.isVisible(),false);assert.ok(await toggle.evaluate(node=>node===document.activeElement));await toggle.click();await page.locator('[data-pl-mobile-view="main"]').click();assert.ok(await page.locator('.pl-workspace-main').isVisible());
  }
  // Calendar geometry is checked in its visible mode at each viewport.
  if(width<1100)await page.locator('.pl-workspace-schedule-toggle').click();
  const calendar=await page.locator('#gridDiv .planneritembox').evaluateAll(nodes=>nodes.map(node=>({overflow:node.getBoundingClientRect().right-node.parentElement.getBoundingClientRect().right,height:node.getBoundingClientRect().height,intended:parseFloat(node.style.height)+(node.style.border.includes('double')?6:2)})));
  assert.ok(calendar.every(box=>box.overflow<=1&&Math.abs(box.height-box.intended)<1),'native calendar geometry preserved');
  if(width>=1100){const text=await page.locator('#gridDiv .planneritembox[data-pl-grid="tidy"]').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),bottom=r.bottom-parseFloat(getComputedStyle(node).borderBottomWidth),lines=[...node.querySelectorAll('.pl-gridline')];return {lines:lines.length,overflow:Math.max(...lines.map(line=>line.getBoundingClientRect().bottom-bottom))};}));assert.ok(text.length&&text.every(box=>box.lines===3&&box.overflow<=1),'all calendar text lines fit the unchanged native boxes');}
  if(width<1100)await page.locator('[data-pl-mobile-view="main"]').click();
  assert.ok(await nativePreserved());assert.equal(await page.evaluate(()=>window.nativeCommandClicks),0);
  await page.locator('.pl-workspace-original').click();assert.equal(await page.locator('#ctl00_MainContent_classPlanPanel > section').count(),6);assert.equal(await page.locator('.pl-browser-index').count(),0);assert.ok(await nativePreserved());assert.ok(await page.evaluate(()=>window.nativePlanMenu.parentElement===window.nativePlanMenuParent),'Original layout restores the native menu anchor');
  await page.locator('.pl-workspace-return').click();await page.waitForSelector('.pl-workspace-deck');await page.locator('.pl-workspace-nav [data-pl-module="find"]').click();
  await page.evaluate(html=>{const next=document.importNode(new DOMParser().parseFromString(html,'text/html').getElementById('ctl00_MainContent_classPlanPanel'),true);window.redrawFields=[...next.querySelectorAll('input,select')];document.getElementById('ctl00_MainContent_classPlanPanel').replaceWith(next);},fixture);
  await page.waitForSelector('.pl-workspace-deck .pl-browser-index',{state:'attached'});assert.equal(await page.locator('.pl-workspace-nav [data-pl-module="find"]').getAttribute('aria-pressed'),'true');assert.ok(await page.locator('input#searchTier0').isVisible());assert.ok(await page.locator('.pl-browser-list').isVisible());
  assert.equal(await page.locator('.pl-workspace-deck').count(),1);assert.equal(await page.locator('#panelPlan').count(),1);assert.equal(await page.locator('[name="examplePersonalEntry"]').count(),1);
  await page.evaluate(()=>window.toggleTidy(false));await page.waitForSelector('.pl-workspace-deck',{state:'detached'});assert.equal(await page.locator('#ctl00_MainContent_classPlanPanel > section').count(),6);assert.equal(await page.locator('[data-pl-workspace-details],.pl-section-label,.pl-browser-index').count(),0);assert.ok(await page.evaluate(()=>window.redrawFields.every(node=>node.isConnected&&node.form===document.getElementById('aspnetForm'))));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await page.close();console.log('Workspace verified: '+width+'px');
 }
 // Explicit sizes are saved; automatic viewport clamping and native redraws
 // retain the preferred size without replacing native controls.
 {
  const page=await browser.newPage({viewport:{width:2048,height:900}}),checks=await setup(page,fixture);
  const schedule=page.locator('.pl-workspace-calendar'),sep=page.locator('.pl-workspace-splitter'),widen=page.locator('.pl-workspace-schedule-widen');
  const preferences=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(window.fixturePreferences).filter(([key])=>key!=='plannerLift.workspace.v1'))));
  await page.locator('.pl-workspace-nav [data-pl-module="find"]').click();await page.locator('.pl-browser-index button').nth(2).click();
  const selection=page.locator('#container_course_M2 .data_row input').first();await selection.check();
  await sep.press('End');await sep.press('ArrowRight');const preferredWidth=(await schedule.boundingBox()).width;assert.ok(preferredWidth>640);
  await page.waitForFunction(expected=>Math.abs(window.fixturePreferences['plannerLift.workspace.v1']?.scheduleWidth-expected)<=1,preferredWidth);
  const savedPreferred=await page.evaluate(()=>JSON.stringify(window.fixturePreferences['plannerLift.workspace.v1']));
  await page.setViewportSize({width:1280,height:900});
  // The main pane can already meet its minimum before the resize event runs.
  // Wait for the schedule's new geometry too, rather than reading the old frame.
  await page.waitForFunction(previous=>document.querySelector('.pl-workspace-main').getBoundingClientRect().width>=419&&document.querySelector('.pl-workspace-calendar').getBoundingClientRect().width<previous,preferredWidth);
  assert.ok((await schedule.boundingBox()).width<preferredWidth,'smaller desktop clamps the wider manual selection safely');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.fixturePreferences['plannerLift.workspace.v1'])),savedPreferred,'viewport clamping does not overwrite the preferred geometry');
  await page.setViewportSize({width:2048,height:900});
  await page.waitForFunction(expected=>Math.abs(document.querySelector('.pl-workspace-calendar').getBoundingClientRect().width-expected)<=1,preferredWidth);
  await widen.click();const maximumWidth=(await schedule.boundingBox()).width;assert.ok(maximumWidth>preferredWidth);
  for(const width of [1280,960,390,2048]){
   await page.setViewportSize({width,height:900});
   if(width<1100){
    await page.locator('.pl-workspace-schedule-toggle').click();assert.ok(await schedule.isVisible());assert.equal(await widen.isVisible(),false);await page.locator('[data-pl-mobile-view="main"]').click();
   }else{
    await page.waitForFunction(()=>document.querySelector('.pl-workspace-main').getBoundingClientRect().width>=419);
    assert.ok(await widen.isVisible());assert.equal(await widen.getAttribute('aria-pressed'),'true');await assertCalendarPreserved(page);
   }
   assert.ok(await selection.isChecked(),'viewport changes preserve native section selection');assert.equal(await page.locator('.pl-browser-index button').nth(2).getAttribute('aria-pressed'),'true','viewport changes preserve the selected local course');
   assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1),'resizing a widened calendar introduces no document overflow');
  }
  assert.ok(Math.abs((await schedule.boundingBox()).width-maximumWidth)<=1,'widened view returns to its available desktop width');
  await widen.click();assert.ok(Math.abs((await schedule.boundingBox()).width-preferredWidth)<=1,'Restore survives narrower and full-width calendar layouts');await selection.uncheck();await widen.click();
  await page.evaluate(html=>{const panel=document.importNode(new DOMParser().parseFromString(html,'text/html').getElementById('ctl00_MainContent_classPlanPanel'),true);document.getElementById('ctl00_MainContent_classPlanPanel').replaceWith(panel);},fixture);
  await page.waitForSelector('.pl-workspace-deck .pl-browser-index',{state:'attached'});assert.equal(await page.locator('.pl-workspace-nav [data-pl-module="find"]').getAttribute('aria-pressed'),'true');
  assert.equal(await widen.count(),1);assert.equal(await widen.getAttribute('aria-pressed'),'true');assert.ok(Math.abs((await schedule.boundingBox()).width-maximumWidth)<=1,'native partial redraw retains Widen selection');
  await widen.click();assert.ok(Math.abs((await schedule.boundingBox()).width-preferredWidth)<=1,'native redraw retains the width to restore');
  assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(window.fixturePreferences).filter(([key])=>key!=='plannerLift.workspace.v1')))),preferences,'sizing and redraw leave unrelated preferences unchanged');
  assert.ok(Math.abs(await page.evaluate(()=>window.fixturePreferences['plannerLift.workspace.v1'].scheduleWidth)-preferredWidth)<=1,'the manual calendar size remains saved after redraw');
  await page.locator('.pl-workspace-original').click();assert.equal(await widen.count(),0,'Original layout removes the extension Widen control');
  assert.deepEqual(checks.errors,[]);assert.deepEqual(checks.requests,[]);await page.close();console.log('Larger schedule resizing, native identity and redraw verified');
 }
 if(process.env.BETTER_MYUCLA_QA_FOCUS!=='workspace'){
 const unknown=await browser.newPage({viewport:{width:1440,height:900}});
 const unknownChecks=await setup(unknown,unknownModuleFixtureHtml(),false,'[data-pl-real-tools]');
 assert.equal(await unknown.locator('.pl-workspace-deck').count(),0,'an unrecognized native module keeps the complete original layout');
 assert.equal(await unknown.locator('#ctl00_MainContent_classPlanPanel > section').count(),7);
 assert.ok(await unknown.locator('#fixture-unknown-module input').isVisible());await unknown.locator('#fixture-unknown-module button').click();assert.equal(await unknown.locator('#fixture-unknown-module output').innerText(),'Example native action complete');
 assert.ok(await unknown.evaluate(()=>window.nativeFields.every(node=>node.isConnected&&node.form===document.getElementById('aspnetForm'))));
 assert.deepEqual(unknownChecks.errors,[]);assert.deepEqual(unknownChecks.requests,[]);await unknown.close();console.log('Unknown native module preserves the full original layout');
 for(const viewport of [{width:2048,height:927},{width:1536,height:735},{width:390,height:900}]){
  const page=await browser.newPage({viewport}),checks=await setup(page,workspaceFixtureHtml(6,true,false,14));
  await page.locator('.pl-workspace-nav [data-pl-module="find"]').click();
  const fields=page.locator('.ClassSearchControls'),list=page.locator('.pl-browser-list');
  const scroll=await page.evaluate(()=>scrollY),lastSelection=page.locator('.pl-browser-body-active .pl-section-card input').last();
  // On a phone, native fields and a usable preview cannot fit simultaneously.
  // The explicit local-panel fallback keeps both reachable without zero-height
  // grids. Wider layouts must keep the fields pinned above local result scroll.
  if(viewport.width===390){
   assert.ok(await list.evaluate(node=>node.clientHeight>=200),'phone fallback retains a usable preview height');
   assert.ok(await page.locator('#panelSearch').evaluate(node=>/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight),'phone fallback scrolls locally inside Search');
   await lastSelection.scrollIntoViewIfNeeded();await assertUnclipped(lastSelection,'last phone section is reachable by local scrolling');await lastSelection.check();
   await page.locator('#fixture-result-footer button').scrollIntoViewIfNeeded();await assertUnclipped(page.locator('#fixture-result-footer button'),'phone native footer remains reachable');
   await page.locator('#searchTier0').scrollIntoViewIfNeeded();await assertUnclipped(page.locator('#searchTier0'),'phone search remains reachable through local panel scrolling');
   await lastSelection.scrollIntoViewIfNeeded();assert.ok(await lastSelection.isChecked(),'phone panel scrolling preserves native section selection');await lastSelection.uncheck();
  }else{
   const before=await fields.boundingBox();
   assert.ok(await list.evaluate(node=>node.scrollHeight>node.clientHeight+100),'long recognized results use a bounded preview');
   await list.evaluate(node=>{node.scrollTop=node.scrollHeight;});
   assert.deepEqual(await fields.boundingBox(),before,'scrolling long section results keeps native search fields in place');
   // Always-visible metadata can push empty card padding outside a short
   // preview at maximum scroll. Every native field must still be reachable.
   const lastFields=page.locator('.pl-browser-body-active .pl-section-card').last().locator('[data-pl-field]');
   for(let i=0;i<await lastFields.count();i++)await assertUnclipped(lastFields.nth(i),'last section field '+i+' stays reachable');
   await assertUnclipped(page.locator('#fixture-result-footer button'),'global native result action remains reachable with long results');
   await assertUnclipped(page.locator('#searchTier0'),'wide search field remains pinned with long results');
  }
  assert.equal(await page.evaluate(()=>scrollY),scroll,'result navigation uses local scrolling rather than the document');
  await page.screenshot({path:resolve(out,'long-find-'+viewport.width+'.png')});
  assert.deepEqual(checks.errors,[]);assert.deepEqual(checks.requests,[]);await page.close();console.log('Long local results verified: '+viewport.width+'x'+viewport.height);
 }
 for(const width of [1440,960,390]){
  const single=await browser.newPage({viewport:{width,height:900}});
  const singleChecks=await setup(single,fixture);
  await single.locator('.pl-workspace-nav [data-pl-module="find"]').click();
  await single.evaluate(()=>{for(const index of [1,2]){document.getElementById(`CourseListEntry_M${index}`).remove();document.getElementById(`container_course_M${index}`).remove();}});
  await single.waitForFunction(()=>document.querySelectorAll('.pl-browser-index button').length===1);
  assert.equal(await single.locator('.pl-browser-index').isVisible(),false,'a single course does not need an index or filter');
  assert.ok(await single.locator('.pl-browser-preview-title').isVisible());
  await single.screenshot({path:resolve(out,'single-course-'+width+'.png')});
  await verifyResultHeadings(single);
  const list=single.locator('.pl-browser-list');assert.ok((await list.boundingBox()).height>=200,'a single-course preview retains usable height');
  assert.ok(await single.locator('.ClassSearchWidget.pl-browser-results').evaluate(node=>node.getBoundingClientRect().width<=1081),'single-course results retain a readable maximum width');
  assert.ok(await list.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  assert.ok(await list.evaluate(n=>{const parent=n.parentElement,style=getComputedStyle(parent);return n.getBoundingClientRect().width>=parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-1;}),'single preview fills the parent content width');
  if(width===1440)await single.screenshot({path:resolve(out,'single-course-browse.png')});
  const firstSelection=single.locator('.pl-browser-body-active .pl-section-card input').first();await firstSelection.scrollIntoViewIfNeeded();await assertUnclipped(firstSelection,'single-course native selection is reachable');
  await single.locator('#fixture-result-footer button').scrollIntoViewIfNeeded();await assertUnclipped(single.locator('#fixture-result-footer button'),'single-course native footer remains reachable');
  assert.deepEqual(singleChecks.errors,[]);assert.deepEqual(singleChecks.requests,[]);
  await single.close();console.log(`Single-course presentation verified: ${width}px`);
 }
 const tall=await browser.newPage({viewport:{width:2048,height:927}});
 const tallChecks=await setup(tall,workspaceFixtureHtml(6,true,true));
 // BODY must not scroll independently of the document, even if native code
 // constrains its height and a sidebar extends below it.
 await tall.evaluate(()=>{
  document.documentElement.style.overflowY='auto';
  document.body.style.height='827px';
  const extra=document.createElement('aside');extra.id='fixture-native-long-sidebar';
  extra.style.cssText='height:1200px;width:1px';document.body.append(extra);
  document.body.style.overflow='hidden';
  document.body.scrollTop=848;
 });
 assert.ok(await tall.evaluate(()=>document.body.scrollTop>0),'fixture must reproduce the old hidden-overflow scroll bug');
 await tall.evaluate(()=>{document.body.style.removeProperty('overflow');document.body.scrollTop=848;});
 assert.equal(await tall.evaluate(()=>document.body.scrollTop),0,'native focus/postback cannot scroll BODY behind the workspace');
 const navRect=await tall.locator('#fixture-native-navigation').boundingBox(),hostRect=await tall.locator('.pl-workspace-host').boundingBox();
 assert.ok(navRect.y>=0&&hostRect.y>=navRect.y+navRect.height,'UCLA navigation remains visible after attempted body scroll');
 const nativeMenu=await tall.locator('.pl-workspace-plan-actions > summary').boundingBox();
 await tall.locator('[data-pl-workspace-details]').first().click();
 const assertTallDetails=async()=>{
  const row=await tall.locator('tbody.pl-workspace-preview-card > tr:nth-child(3)').boundingBox();
  const pane=await tall.locator('.pl-workspace-details-slot').boundingBox();
  assert.ok(row.height>=60&&row.x>=pane.x-1&&row.x+row.width<=pane.x+pane.width+1,`docked inspector fits its dedicated slot: ${JSON.stringify(row)}`);
  assert.ok(await tall.locator('.pl-workspace-calendar').isVisible());
  assert.ok(await tall.locator('tbody.pl-workspace-preview-card.pl-preview-docked').count());
  await assertUnclipped(tall.getByRole('button',{name:'Close details',exact:true}),'tall native header cannot clip the selected class controls');
  await assertUnclipped(tall.locator('.pl-workspace-calendar'),'tall native header cannot clip the calendar');
 };
 await assertTallDetails();await tall.locator('.pl-workspace-preview-head summary').click();await assertTallDetails();
 const afterMenu=await tall.locator('.pl-workspace-plan-actions > summary').boundingBox();assert.deepEqual(afterMenu,nativeMenu,'native plan menu access stays put');
 assert.deepEqual(tallChecks.errors,[]);assert.deepEqual(tallChecks.requests,[]);
 await tall.screenshot({path:resolve(out,'tall-header-details.png')});await tall.close();console.log('Tall native header and long exam details verified');
 for (const width of [2048,1440,1280,960,390]) {
  const height=927,page=await browser.newPage({viewport:{width,height}});
  const {errors,requests}=await setup(page,introductionFixtureHtml());
  assert.equal(await page.locator('.pl-intro-about').evaluate(e=>e.open),false);
  assert.equal(await page.locator('.pl-intro-notice:visible').count(),2,'term notices remain visible');
  assert.ok(await page.evaluate(()=>window.nativeTerm.parentElement===window.nativeTermParent&&window.nativeSidebar.parentElement===window.nativeSidebarParent));
  assert.ok(await page.evaluate(()=>window.nativeNavigation.outerHTML===window.nativeNavigationHtml&&window.nativeIntroduction.innerHTML===window.nativeIntroductionHtml));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`introduction overflow ${width}`);
  if (width>=900) {
   const before=await page.locator('.pl-workspace-host').boundingBox();
   assert.ok(await page.evaluate(y=>y<window.nativeWorkspaceTop-60,before.y),'introduction gives the planner more room');
   await page.screenshot({path:resolve(out,`compact-introduction-${width}.png`)});
   const headerToggle=page.locator('.pl-intro-header-toggle');
   assert.equal(await headerToggle.innerText(),'Compact header');
   await headerToggle.click();
   await page.waitForFunction(()=>document.querySelector('.pl-intro-header-toggle').textContent==='Show header');
   const compactTitle=await page.locator('#titleText').boundingBox();
   const compactTerm=await page.locator('#ctl00_MainContent_termSessionChooser_TermChooser').boundingBox();
   const compactNav=await page.locator('#fixture-native-navigation').boundingBox();
   assert.ok(compactTitle.y>=11&&compactTitle.y<=13&&compactTerm.y>=11,'compact action retains title and term');
   assert.ok(compactNav.y+compactNav.height<=12,'compact action scrolls the entire original banner away');
   assert.ok((await page.locator('.pl-workspace-host').boundingBox()).height>before.height,'compact action gives planner more space');
   assert.ok(await page.evaluate(()=>window.nativeNavigation.outerHTML===window.nativeNavigationHtml));
   assert.ok(await headerToggle.evaluate(e=>e===document.activeElement));
   await page.screenshot({path:resolve(out,`header-compacted-${width}.png`)});
   await headerToggle.press('Enter');await page.waitForFunction(()=>scrollY===0);
   assert.equal(await headerToggle.innerText(),'Compact header');
   assert.equal((await page.locator('#fixture-native-navigation').boundingBox()).y,0,'show action restores access to the original menu');
   await page.mouse.move(20,40);await page.mouse.wheel(0,240);
   await page.waitForFunction(()=>scrollY>100);
   await page.waitForFunction(()=>document.querySelector('.pl-workspace-host').getBoundingClientRect().bottom<=innerHeight);
   await page.mouse.wheel(0,800);
   await page.waitForFunction(()=>Math.abs(document.querySelector('.pl-workspace-host').getBoundingClientRect().top-12)<1);
   const after=await page.locator('.pl-workspace-host').boundingBox(),nav=await page.locator('#fixture-native-navigation').boundingBox();
   assert.ok(nav.y<0,'native UCLA header scrolls away through ordinary page scrolling');
   assert.ok(after.y>=11&&after.y<before.y&&after.height>before.height,'planner expands as the header scrolls away');
   assert.equal(await page.evaluate(()=>document.body.scrollTop),0);
   await page.locator('[data-pl-workspace-details]').first().click();
   const row=await page.locator('tbody.pl-workspace-preview-card > tr:nth-child(3)').boundingBox(),pane=await page.locator('.pl-workspace-details-slot').boundingBox();
   assert.ok(row.x>=pane.x-1&&row.x+row.width<=pane.x+pane.width+1,'Details remains docked to its slot after page scrolling');
   await page.keyboard.press('Escape');
   const scrollBefore=await page.evaluate(()=>scrollY);
   await page.evaluate(html=>{const next=document.importNode(new DOMParser().parseFromString(html,'text/html').getElementById('ctl00_MainContent_classPlanPanel'),true);document.getElementById('ctl00_MainContent_classPlanPanel').replaceWith(next);},introductionFixtureHtml());
   await page.waitForSelector('.pl-workspace-deck .pl-browser-index',{state:'attached'});
   assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scrollBefore)<=1,'native redraw preserves intentional document scrolling');
   assert.ok(Math.abs((await page.locator('.pl-workspace-host').boundingBox()).y-12)<=1);
   await page.screenshot({path:resolve(out,`scrolled-workspace-${width}.png`)});
   await page.mouse.move(8,40);await page.mouse.wheel(0,-1000);await page.waitForFunction(()=>scrollY===0);
   assert.equal((await page.locator('#fixture-native-navigation').boundingBox()).y,0,'scrolling back reveals unchanged navigation');
  }
  await page.locator('.pl-intro-about > summary').click();assert.ok(await page.locator('#page_title_text').isVisible());
  await page.locator('.pl-intro-about > summary').click();
  await page.locator('.pl-workspace-nav [data-pl-module="find"]').click();await page.locator('.pl-intro-info').click();assert.ok(await page.locator('right-sidebar').isVisible());
  assert.ok(await page.locator('.pl-workspace-nav .pl-intro-info').isVisible(),'Information is part of persistent module navigation');
  assert.equal(await page.locator('.pl-workspace-host').getAttribute('data-pl-module'),'information');
  assert.equal(await page.locator('right-sidebar > :not([data-planner-lift-owned])').count(),4);
  const sidebar=await page.locator('right-sidebar').boundingBox();assert.ok(sidebar.y>=0&&sidebar.y+sidebar.height<=height);
  await page.keyboard.press('Escape');assert.equal(await page.locator('right-sidebar').isVisible(),false);
  assert.equal(await page.locator('.pl-workspace-host').getAttribute('data-pl-module'),'find','Information returns to the previous module');
  assert.ok(await page.locator('.pl-intro-info').evaluate(e=>e===document.activeElement));
  await page.locator('.pl-intro-info').click();await page.locator('.pl-intro-info-close').click();
  assert.equal(await page.locator('right-sidebar').isVisible(),false);
  await page.evaluate(()=>window.toggleTidy(false));await page.waitForSelector('.pl-workspace-deck',{state:'detached'});
  assert.equal(await page.locator('.pl-intro-about,.pl-intro-info,.pl-intro-term-label,.pl-intro-header-toggle').count(),0);
  assert.ok(await page.evaluate(()=>window.nativeTerm.parentElement===window.nativeTermParent&&window.nativeSidebar.parentElement===window.nativeSidebarParent&&window.nativeNavigation.outerHTML===window.nativeNavigationHtml));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await page.close();console.log(`Compact introduction and root scrolling verified: ${width}px`);
 }
 // Header preference must survive the real controller's lifecycle, including
 // native quarter redraws and a new page, not merely a single click/scroll.
 const persistent=await browser.newPage({viewport:{width:1440,height:927}});
 const firstCheck=await setup(persistent,introductionFixtureHtml());
 await persistent.locator('.pl-intro-header-toggle').click();
 await persistent.waitForFunction(()=>window.fixturePreferences['plannerLift.header.v1'].compact===true);
 await persistent.evaluate(()=>window.scrollTo(0,0));
 await persistent.waitForFunction(()=>document.getElementById('titleText').getBoundingClientRect().top<=13);
 await persistent.evaluate(html=>{
  window.fixtureTermChanges=0;
  const select=document.getElementById('ctl00_MainContent_termSessionChooser_TermChooser');
  select.append(new Option('Example winter','27W'));
  select.addEventListener('change',()=>{
   window.fixtureTermChanges++;
   const replacement=document.importNode(new DOMParser().parseFromString(html,'text/html').getElementById('layoutContentArea'),true);
   const nextSelect=replacement.querySelector('select');nextSelect.append(new Option('Example winter','27W',true,true));
   document.getElementById('layoutContentArea').replaceWith(replacement);window.scrollTo(0,0);
  });
 },introductionFixtureHtml());
 await persistent.locator('#ctl00_MainContent_termSessionChooser_TermChooser').selectOption('27W');
 await persistent.waitForFunction(()=>document.querySelector('.pl-intro-header-toggle')?.textContent==='Show header'&&document.getElementById('titleText').getBoundingClientRect().top<=13);
 assert.equal(await persistent.evaluate(()=>window.fixtureTermChanges),1,'original quarter change handler still runs');
 assert.ok(await persistent.evaluate(()=>window.nativeNavigation.outerHTML===window.nativeNavigationHtml));
 const saved=await persistent.evaluate(()=>window.fixturePreferences['plannerLift.header.v1'].compact);
 const reloadCheck=await setup(persistent,introductionFixtureHtml(),saved);
 await persistent.waitForFunction(()=>document.getElementById('titleText').getBoundingClientRect().top<=13);
 assert.equal(await persistent.locator('.pl-intro-header-toggle').innerText(),'Show header','fresh controller restores saved preference');
 const otherTab=await browser.newPage();await otherTab.bringToFront();
 await persistent.evaluate(()=>window.scrollTo(0,0));await persistent.bringToFront();
 await persistent.waitForFunction(()=>document.getElementById('titleText').getBoundingClientRect().top<=13);
 await otherTab.close();
 await persistent.screenshot({path:resolve(out,'persistent-header.png')});
 await persistent.locator('#fixture-native-navigation button').focus();
 await persistent.waitForFunction(()=>window.fixturePreferences['plannerLift.header.v1'].compact===false);
 assert.equal(await persistent.evaluate(()=>scrollY),0,'keyboard focus restores access to the native menu');
 assert.equal(await persistent.locator('.pl-intro-header-toggle').innerText(),'Compact header');
 await persistent.locator('.pl-intro-header-toggle').click();
 await persistent.waitForFunction(()=>window.fixturePreferences['plannerLift.header.v1'].compact===true);
 await persistent.locator('.pl-intro-header-toggle').click();
 await persistent.waitForFunction(()=>window.fixturePreferences['plannerLift.header.v1'].compact===false);
 const shownCheck=await setup(persistent,introductionFixtureHtml(),false);
 assert.equal(await persistent.evaluate(()=>scrollY),0,'Show header persists across a new page');
 assert.ok(await persistent.evaluate(()=>window.nativeNavigation.outerHTML===window.nativeNavigationHtml));
 for(const check of [firstCheck,reloadCheck,shownCheck]){assert.deepEqual(check.errors,[]);assert.deepEqual(check.requests,[]);}
 await persistent.close();console.log('Header preference verified across native quarter redraw, page reload and browser tab changes');
 const future=await browser.newPage({viewport:{width:1440,height:927}});
 const futureCheck=await setup(future,futureQuarterFixtureHtml(),true,'.pl-intro-toolbar');
 await future.waitForFunction(()=>document.getElementById('titleText').getBoundingClientRect().top<=13);
 assert.equal(await future.locator('.pl-intro-header-toggle').innerText(),'Show header');
 assert.equal(await future.locator('[data-pl-action], [data-pl-workspace-details], .pl-workspace-deck').count(),0,'future quarter must not enable course actions');
 assert.ok(await future.locator('#fixture-future-plan button').isVisible());
 assert.ok(await future.evaluate(()=>window.nativeTerm.parentElement===window.nativeTermParent&&window.nativeNavigation.outerHTML===window.nativeNavigationHtml));
 await future.locator('.pl-intro-header-toggle').click();
 await future.waitForFunction(()=>window.fixturePreferences['plannerLift.header.v1'].compact===false);
 assert.equal(await future.evaluate(()=>scrollY),0);
 await future.locator('.pl-intro-header-toggle').click();
 await future.waitForFunction(()=>window.fixturePreferences['plannerLift.header.v1'].compact===true);
 // A native redraw from an uneditable quarter must restart normal tools only
 // after the unchanged reorder contract passes again.
 await future.evaluate(html=>{
  const replacement=document.importNode(new DOMParser().parseFromString(html,'text/html').getElementById('layoutContentArea'),true);
  document.getElementById('layoutContentArea').replaceWith(replacement);window.scrollTo(0,0);
 },introductionFixtureHtml());
 await future.waitForSelector('.pl-workspace-deck');
 await future.waitForFunction(()=>document.getElementById('titleText').getBoundingClientRect().top<=13);
 assert.equal(await future.locator('.pl-intro-toolbar').count(),0);
 assert.equal(await future.locator('.pl-intro-header-toggle').count(),1);
 assert.equal(await future.locator('[data-pl-workspace-details]').count(),6);
 // And the populated controller must keep presentation on a future redraw.
 await future.evaluate(html=>{
  const replacement=document.importNode(new DOMParser().parseFromString(html,'text/html').getElementById('layoutContentArea'),true);
  document.getElementById('layoutContentArea').replaceWith(replacement);window.scrollTo(0,0);
 },futureQuarterFixtureHtml());
 await future.waitForSelector('.pl-intro-toolbar');
 await future.waitForFunction(()=>document.getElementById('titleText').getBoundingClientRect().top<=13);
 assert.equal(await future.locator('.pl-intro-header-toggle').count(),1);
 assert.equal(await future.locator('.pl-workspace-deck').count(),0);
 await future.evaluate(()=>window.toggleTidy(false));
 await future.waitForFunction(()=>!document.querySelector('.pl-intro-header-toggle'));
 assert.equal(await future.locator('html.pl-intro-page').count(),0);
 assert.ok(await future.locator('right-sidebar').isVisible());
 assert.ok(await future.evaluate(()=>window.nativeNavigation.outerHTML===window.nativeNavigationHtml));
 assert.deepEqual(futureCheck.errors,[]);assert.deepEqual(futureCheck.requests,[]);
 await future.close();console.log('Empty/future quarter header verified with unchanged fail-closed course controls');
 const page=await browser.newPage({viewport:{width:1440,height:600}});
 const {errors,requests}=await setup(page,workspaceFixtureHtml(12));
 await page.evaluate(()=>{window.nativeActionCount=0;window.courseListAction=()=>window.nativeActionCount++;});
 await page.locator('.pl-workspace-actions-button').first().click();
 const grip=await page.locator('[data-pl-action="drag"]').first().boundingBox(),plan=await page.locator('#panelPlan').boundingBox();
 // Opening Class actions can itself scroll the list. Require further movement
 // caused by holding the drag at the list edge, not an absolute scroll offset.
 const beforeDragScroll=await page.locator('#panelPlan').evaluate(node=>node.scrollTop);
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2,plan.y+plan.height-12,{steps:8});
 await page.waitForFunction(before=>document.querySelector('#panelPlan').scrollTop>before+80,beforeDragScroll);
 const afterDownScroll=await page.locator('#panelPlan').evaluate(node=>node.scrollTop);
 await page.mouse.move(grip.x+grip.width/2,plan.y+12,{steps:8});
 await page.waitForFunction(before=>document.querySelector('#panelPlan').scrollTop<before-80,afterDownScroll);
 await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.nativeActionCount),0);assert.equal(await page.evaluate(()=>scrollY),0);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 await page.close();console.log('Local panel dragging verified');
 }
} finally { await browser.close(); }
