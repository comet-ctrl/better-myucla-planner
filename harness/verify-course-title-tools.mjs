import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {nativeDetailFixtureHtml} from './workspace-fixture.mjs';
const url='https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx';
const css=await readFile(new URL('../dist/injected.css',import.meta.url),'utf8');
const js=await readFile(new URL('../dist/content.js',import.meta.url),'utf8');
const browser=await chromium.launch({executablePath:process.env.BETTER_MYUCLA_CHROMIUM||undefined});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:nativeDetailFixtureHtml()}):r.abort());
 await page.goto(url);
 await page.evaluate(()=>{
  const stored={'plannerLift.layout.v1':{tidy:true},'plannerLift.header.v1':{compact:true}};
  window.chrome={storage:{local:{get:async k=>({[k]:stored[k]}),set:async v=>Object.assign(stored,v),remove:async k=>delete stored[k]},onChanged:{addListener(){},removeListener(){}}}};
  window.nativeColors=[...document.querySelectorAll('tbody.courseItem > tr:first-child .OrderingButtons')].map(parent=>{
   const wrapper=document.createElement('span');parent.prepend(wrapper);
   const node=document.createElement('input');node.type='color';node.className='native-color';wrapper.append(node);return {node,parent:wrapper,form:node.form};
  });
  window.submissions=0;document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submissions++;});
 });
 await page.addStyleTag({content:css});await page.addScriptTag({content:js});await page.waitForSelector('.pl-workspace-plan');
 const first=page.locator('.pl-workspace-plan tbody.courseItem').first();
 for(const width of [1440,960,390]) {
  await page.setViewportSize({width,height:900});
  await page.waitForTimeout(100);
  const geometry=await first.evaluate(card=>{
   const grip=card.querySelector('.pl-grip').getBoundingClientRect(),title=card.querySelector('.pl-code').getBoundingClientRect(),color=card.querySelector('input[type="color"]').getBoundingClientRect();
   return {grip:grip.toJSON(),title:title.toJSON(),color:color.toJSON()};
  });
  assert.ok(geometry.grip.width>0&&geometry.grip.right<=geometry.title.left+1,'grip precedes title');
  assert.ok(geometry.color.width>0&&geometry.color.left>=geometry.title.right-1,'color follows title');
  await first.getByRole('button',{name:/Course tools for/}).click();
  assert.ok(await first.getByRole('button',{name:/Move .* to the top/}).isVisible());
  assert.ok(await first.getByRole('button',{name:/Note for/}).isVisible());
  assert.ok(await first.locator('[data-pl-position]').isVisible());
  assert.equal(await first.locator('.pl-course-more').count(),0);
  await first.getByRole('button',{name:/Note for/}).click();
  assert.ok(await first.locator('[data-pl-tag]').isVisible());
  await first.getByRole('button',{name:/Note for/}).click();
  await first.getByRole('button',{name:/Course tools for/}).click();
  console.log(`Title tools verified at ${width}px`);
 }
 await page.setViewportSize({width:1440,height:900});
 await page.waitForTimeout(100);
 const order=()=>page.locator('.pl-workspace-plan tbody.courseItem').evaluateAll(cards=>cards.map(c=>c.className.match(/Class\d+/)[0]));
 const initial=await order();
 for(let i=0;i<10;i++) {
  const before=await order();
  const handle=page.locator('.pl-workspace-plan .pl-grip').first();await handle.scrollIntoViewIfNeeded();
  const start=await handle.boundingBox(),second=await page.locator('.pl-workspace-plan tbody.courseItem').nth(1).boundingBox();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2+second.height*.8,{steps:10});await page.mouse.up();
  await page.waitForTimeout(250);
  const after=await order();assert.equal(after[0],before[1],'drag actually moves first course below second');
  assert.equal(await page.locator('.pl-drag-active,.pl-drag-shifted').count(),0,'drag styles cleared');
 }
 assert.deepEqual(await order(),initial,'ten adjacent swaps restore initial order');
 assert.equal(await page.locator('.pl-grip').count(),initial.length,'no duplicated handles');
 assert.ok(await page.evaluate(()=>nativeColors.every(({node,parent,form})=>node.isConnected&&node.parentElement===parent&&node.form===form)));
 assert.equal(await page.evaluate(()=>submissions),0,'local dragging sends no native submission');
 await mkdir(new URL('./shots/',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('./shots/course-title-tools.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
 await page.locator('.pl-workspace-layout-settings > summary').click();
 await page.getByRole('button',{name:'Original layout',exact:true}).click();
 assert.equal(await page.locator('.pl-workspace-plan').count(),0);
 console.log('Repeated dragging, native identity and restoration passed');
} finally {await browser.close();}
