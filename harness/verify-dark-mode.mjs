/** Fictional production-build appearance checks. No real account is loaded. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {nativeDetailFixtureHtml} from './workspace-fixture.mjs';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'harness/shots/dark-mode');
const css=await readFile(resolve(root,'dist/injected.css'),'utf8'),js=await readFile(resolve(root,'dist/content.js'),'utf8');
const url='https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx';
const appearanceKey='plannerLift.appearance.v1';
const browser=await chromium.launch({executablePath:process.env.BETTER_MYUCLA_CHROMIUM||undefined});
const frame=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
await mkdir(out,{recursive:true});const reports=[];

async function contrast(page,selector,min=4.5){
  const samples=await page.locator(selector).evaluateAll(nodes=>nodes.filter(node=>node.getBoundingClientRect().height>0).map(node=>{
    const parse=value=>{const parts=value.match(/[\d.]+/g)?.map(Number)||[0,0,0];return [...parts.slice(0,3),parts[3]??1];};
    const foreground=parse(getComputedStyle(node).color);let background=[255,255,255,1];
    const parents=[];for(let parent=node;parent;parent=parent.parentElement)parents.unshift(parent);
    for(const parent of parents){const color=parse(getComputedStyle(parent).backgroundColor);background=color.slice(0,3).map((channel,index)=>channel*color[3]+background[index]*(1-color[3]));}
    const luminance=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const foregroundComposite=foreground.slice(0,3).map((v,i)=>v*foreground[3]+background[i]*(1-foreground[3]));
    const a=luminance(foregroundComposite),b=luminance(background);
    return {selector:node.className,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fg:foreground,bg:background};
  }));
  assert.ok(samples.length,`contrast samples exist: ${selector}`);
  for(const sample of samples)assert.ok(sample.ratio>=min,`${selector}: contrast ${JSON.stringify(sample)}`);
  return Math.min(...samples.map(sample=>sample.ratio));
}

try{
  for(const width of (process.env.BETTER_MYUCLA_DARK_WIDTHS?.split(',').map(Number)||[2048,1440,1280,390])){
    const page=await browser.newPage({viewport:{width,height:1000},colorScheme:'light'});page.setDefaultTimeout(7000);
    const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url()===url?route.fulfill({status:200,contentType:'text/html',body:nativeDetailFixtureHtml()}):(requests.push(route.request().url()),route.abort()));
    await page.goto(url);
    await page.evaluate(()=>{
      const stored={'plannerLift.layout.v1':{tidy:true},'plannerLift.header.v1':{compact:true},'plannerLift.appearance.v1':'light'},listeners=[];
      window.chrome={storage:{local:{get:async key=>({[key]:stored[key]}),set:async values=>Object.assign(stored,values),remove:async key=>delete stored[key]},onChanged:{addListener:fn=>listeners.push(fn),removeListener:fn=>{const index=listeners.indexOf(fn);if(index>=0)listeners.splice(index,1);}}}};
      window.fixturePreference=(key,value)=>{stored[key]=value;listeners.slice().forEach(fn=>fn({[key]:{newValue:value}},'local'));};
      window.fixtureNative=[...document.querySelectorAll('input,select,button,a')].map(node=>({node,parent:node.parentElement,form:node.form,handler:node.getAttribute('onclick')}));
      window.fixtureStatuses=[...document.querySelectorAll('table.coursetable tbody tr')].filter(row=>row.cells.length===9&&row.cells[0].tagName==='TD').map(row=>({cell:row.cells[2],html:row.cells[2].innerHTML}));
      const nav=document.getElementById('fixture-native-navigation');window.fixtureMasthead={node:nav,source:nav?.outerHTML,color:nav&&getComputedStyle(nav).color,bg:nav&&getComputedStyle(nav).backgroundColor};
      window.fixtureSubmissions=0;document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();fixtureSubmissions++;});
      // Hourly rules sit behind full-day event columns, rather than on them.
      const body=document.querySelector('.fixture-weekbody');
      body.style.position='relative';
      const rules=document.createElement('table');rules.className='fixture-hour-rules';
      rules.style.cssText='position:absolute;inset:0;width:100%;height:100%;border-collapse:collapse;pointer-events:none';
      rules.innerHTML='<tbody>'+Array.from({length:9},()=>'<tr>'+Array.from({length:6},()=>'<td style="border-bottom:1px solid #ddd"></td>').join('')+'</tr>').join('')+'</tbody>';
      body.prepend(rules);
      const feedback=document.createElement('div');feedback.className='message';feedback.dataset.fixtureFeedback='true';
      feedback.innerHTML='<header style="background:white;color:black">Added to Plan. This action did not enroll you.</header><div style="background:white;color:black"><table><tbody><tr><td style="background:white;color:black"><p>Example course added to the plan.</p><ul><li>Example lecture</li></ul><button type="button">Close example feedback</button></td></tr></tbody></table></div>';
      document.getElementById('panelSearch').append(feedback);
      const action=document.createElement('div');action.dataset.fixtureAction='true';
      action.style.cssText='background:white linear-gradient(white,white);color:black';
      action.innerHTML='<table style="background-image:linear-gradient(white,white);background-color:white"><tbody><tr><td style="background:white;color:black"><h3>Example action panel</h3><p>Example selection explanation</p><label><input type="radio" name="fictional-choice">Example option</label><a href="#fictional">Example help</a></td></tr></tbody></table>';
      document.getElementById('panelSearch').append(action);
      action.insertAdjacentHTML('beforeend','<button type="button" data-fixture-response-button style="background:linear-gradient(white,#eee);color:#eaf2fa"><span>Example close</span></button><input type="button" data-fixture-response-button style="background:linear-gradient(white,#eee);color:#eaf2fa" value="Example cancel"><input type="submit" data-fixture-response-button disabled style="background:white;color:#eaf2fa" value="Example disabled action">');
      document.getElementById('widgetNeedHelp').insertAdjacentHTML('beforeend','<header style="background:white;color:black"><h3 style="background:linear-gradient(white,#eee);color:black" data-fixture-info-bar>Example information</h3></header><iwe-widget-title style="display:block;background:white;color:black" data-fixture-info-bar>Example custom title</iwe-widget-title><h5 style="background:white;color:black" data-fixture-info-bar>Example secondary title</h5><div style="background:white;color:black"><p data-fixture-info-text style="color:#142b43">Example help explanation</p><table><tbody><tr><td style="background:white;color:#142b43">Example public table</td></tr></tbody></table><details><summary>Example help disclosure</summary><p data-fixture-info-text>Example expanded help</p></details></div>');
      document.getElementById('widgetNeedHelp').insertAdjacentHTML('beforeend','<fictional-surface style="display:block;background:white;color:black" data-fixture-info-bar>Example unknown surface</fictional-surface><hgroup style="background:linear-gradient(white,#eee);color:black" data-fixture-info-bar>Example grouped heading</hgroup>');
      const nativeWidgetStyle=document.createElement('style');
      nativeWidgetStyle.textContent='#widgetNeedHelp [data-fixture-info-bar]{background:linear-gradient(#eee,#eee)!important;color:#226699!important}#widgetNeedHelp hgroup::before{content:"";display:block;height:8px;background:#eee!important}';
      document.head.append(nativeWidgetStyle);
      for(const widget of document.querySelectorAll('right-sidebar iwe-widget')) {
        const shadow=widget.attachShadow({mode:'open'});
        shadow.innerHTML='<style>.iweWidgetTitle{background:#f0f0f0;color:#347bad;border-bottom:1px solid #ccc}.iweWidgetTitle h4{margin:0;padding:10px}</style><div class="iweWidgetTitle"><h4>Example shadow widget title</h4></div><div class="widget-body"><slot></slot></div>';
        widget.fixtureTitle=shadow.querySelector('.iweWidgetTitle');
      }
      document.getElementById('panelOptimizer').insertAdjacentHTML('beforeend','<button type="button" data-fixture-optimizer-button style="background:linear-gradient(white,#eee);color:#eaf2fa"><i>→</i></button><input type="button" data-fixture-optimizer-button style="background:white;color:#eaf2fa" value="Example back"><input type="submit" disabled data-fixture-optimizer-button style="background:white;color:#eaf2fa" value="Example disabled preview">');
      // Model an already-loaded optimizer; never run a calculation/postback.
      document.getElementById('panelOptimizer').classList.remove('hidden');
    });
    await page.addStyleTag({content:css});await page.addScriptTag({content:js});await page.waitForSelector('.pl-workspace-deck');await frame(page);
    // The existing workspace deliberately wraps search controls and replaces
    // disclosure headers. Compare connected native controls after that mount,
    // so this check isolates appearance and subsequent module interaction.
    await page.evaluate(()=>{window.fixtureNative=fixtureNative.filter(({node})=>node.isConnected).map(({node})=>({node,parent:node.parentElement,form:node.form,handler:node.getAttribute('onclick')}));});
    const eventStyles=()=>page.evaluate(()=>[...document.querySelectorAll('#gridDiv .planneritembox')].map(node=>{const box=node.getBoundingClientRect(),parent=node.parentElement.getBoundingClientRect(),style=getComputedStyle(node);return{x:box.x-parent.x,y:box.y-parent.y,width:box.width,height:box.height,inline:node.getAttribute('style'),background:style.backgroundColor};}));
    const lightEvents=await eventStyles();
    await page.evaluate(key=>fixturePreference(key,'dark'),appearanceKey);
    await page.waitForFunction(()=>document.documentElement.dataset.plAppearance==='dark');await frame(page);
    assert.deepEqual(await eventStyles(),lightEvents,`${width}: dark theme preserves meeting geometry and colors`);
    const rules=await page.locator('#gridDiv .timebox').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).boxShadow));
    assert.ok(rules.length&&rules.every(rule=>rule.includes('inset')&&rule.includes('82, 103, 127')),`${width}: dark grid has visible inset cell rules`);
    assert.ok(await page.locator('#gridDiv .timebox').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor==='rgba(0, 0, 0, 0)')),`${width}: event columns do not cover hourly rules`);
    assert.ok(await page.locator('.fixture-hour-rules td').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).borderBottomColor==='rgb(82, 103, 127)')),`${width}: native hourly borders use visible dark color`);
    await page.locator('[data-pl-workspace-details]').nth(0).click();await frame(page);
    const ratios={headings:await contrast(page,'.pl-workspace-preview-head h2'),details:await contrast(page,'.pl-preview-docked .pl-section-field[data-pl-field="5"], .pl-preview-docked .pl-section-field[data-pl-field="6"], .pl-preview-docked .pl-section-field[data-pl-field="8"]'),summaries:await contrast(page,'.pl-workspace-course-summary [data-pl-summary-field="2"]'),tabs:await contrast(page,'.pl-workspace-group-tab')};
    await page.screenshot({path:resolve(out,`details-${width}.png`)});
    await page.locator('[data-pl-workspace-details]').nth(1).click();await page.locator('.pl-workspace-detail-jump').nth(0).click();
    assert.equal(await page.locator('[data-pl-workspace-details][aria-expanded="true"]').count(),2);
    await contrast(page,'.pl-workspace-detail-jump');
    await page.locator('[data-pl-tab="find"]').click();await frame(page);
    const feedback=await page.locator('[data-fixture-feedback]').evaluate(node=>{
      const box=node.getBoundingClientRect(),parent=node.parentElement.getBoundingClientRect();
      return {fits:box.width<=parent.width+1,background:getComputedStyle(node).backgroundColor};
    });
    assert.ok(feedback.fits&&feedback.background!=='rgb(255, 255, 255)',`${width}: native feedback fits and has its own dark surface`);
    assert.ok(await page.locator('[data-fixture-feedback] :is(header,div,td)').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor!=='rgb(255, 255, 255)')),`${width}: native inline white inner surfaces are dark`);
    assert.ok(await page.locator('[data-fixture-action], [data-fixture-action] :is(table,td)').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundImage==='none'&&getComputedStyle(node).backgroundColor!=='rgb(255, 255, 255)')),`${width}: sibling action surfaces lose white background images`);
    assert.ok(await page.locator('[data-fixture-response-button]').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundImage==='none'&&getComputedStyle(node).backgroundColor!=='rgb(255, 255, 255)')),`${width}: native response buttons lose white gradients`);
    await contrast(page,'[data-fixture-response-button]');
    assert.equal(await page.locator('[data-fixture-response-button]:disabled').count(),1,'native disabled state is preserved');
    ratios.inputs=await contrast(page,'.pl-search-widget input:not([type="hidden"]):not([type="submit"]), .pl-search-widget select');
    await page.screenshot({path:resolve(out,`find-${width}.png`)});
    await page.locator('.pl-workspace-plan-actions > summary').click();await page.screenshot({path:resolve(out,`actions-${width}.png`)});await page.keyboard.press('Escape');
    const identity=await page.evaluate(()=>({controls:fixtureNative.every(({node,parent,form,handler})=>node.isConnected&&node.parentElement===parent&&node.form===form&&node.getAttribute('onclick')===handler),statuses:fixtureStatuses.every(({cell,html})=>cell.innerHTML===html),masthead:fixtureMasthead.node?.outerHTML===fixtureMasthead.source&&(!fixtureMasthead.node||(getComputedStyle(fixtureMasthead.node).color===fixtureMasthead.color&&getComputedStyle(fixtureMasthead.node).backgroundColor===fixtureMasthead.bg)),submits:fixtureSubmissions}));
    assert.deepEqual(identity,{controls:true,statuses:true,masthead:true,submits:0});
    await page.evaluate(key=>fixturePreference(key,'system'),appearanceKey);await frame(page);
    assert.notEqual(await page.locator('html').getAttribute('data-pl-appearance'),'dark');
    await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.plAppearance==='dark');
    await page.emulateMedia({media:'print'});await frame(page);
    assert.notEqual(await page.locator('.pl-workspace-host').evaluate(node=>getComputedStyle(node).colorScheme),'dark','printing does not inherit dark controls');
    await page.emulateMedia({media:'screen'});
    await page.evaluate(()=>fixturePreference('plannerLift.layout.v1',{tidy:false}));await page.waitForFunction(()=>!document.querySelector('.pl-workspace-deck'));
    assert.notEqual(await page.locator('html').getAttribute('data-pl-appearance'),'dark');
    await page.evaluate(()=>fixturePreference('plannerLift.layout.v1',{tidy:true}));await page.waitForSelector('.pl-workspace-deck');await page.waitForFunction(()=>document.documentElement.dataset.plAppearance==='dark');
    await page.locator('.pl-intro-info').click();await frame(page);
    const shadowTitles=()=>page.evaluate(()=>[...document.querySelectorAll('right-sidebar iwe-widget')].map(widget=>({background:getComputedStyle(widget.shadowRoot.querySelector('.iweWidgetTitle')).backgroundColor,identity:widget.fixtureTitle===widget.shadowRoot.querySelector('.iweWidgetTitle'),styles:widget.shadowRoot.querySelectorAll('style[data-planner-lift-owned]').length})));
    assert.ok((await shadowTitles()).every(item=>item.background==='rgb(32, 45, 60)'&&item.identity&&item.styles===1),'real open-shadow shape gets dark title without replacing native nodes');
    await page.evaluate(()=>fixturePreference('plannerLift.appearance.v1','light'));await frame(page);
    assert.ok((await shadowTitles()).every(item=>item.background==='rgb(240, 240, 240)'&&item.styles===0),'light restores native shadow title');
    await page.evaluate(()=>fixturePreference('plannerLift.appearance.v1','dark'));await frame(page);
    await page.evaluate(()=>{for(const widget of document.querySelectorAll('right-sidebar iwe-widget'))widget.shadowRoot.querySelector('style[data-planner-lift-owned]').remove();});await frame(page);
    assert.ok((await shadowTitles()).every(item=>item.styles===1),'shadow redraw reinstates one owned style');
    await page.locator('#widgetNeedHelp details > summary').click();
    await contrast(page,'[data-fixture-info-text], #widgetNeedHelp td, #widgetNeedHelp h3');
    await contrast(page,'[data-fixture-info-bar]');
    assert.ok(await page.locator('[data-fixture-info-bar]').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundImage==='none'&&getComputedStyle(node).backgroundColor!=='rgb(255, 255, 255)')),'heading and custom-element bars are dark');
    assert.equal(await page.locator('#widgetNeedHelp hgroup').evaluate(node=>getComputedStyle(node,'::before').backgroundColor),'rgba(0, 0, 0, 0)','native pseudo-element strip does not remain grey');
    assert.ok(await page.locator('#widgetNeedHelp :is(header,div,td)').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundImage==='none'&&getComputedStyle(node).backgroundColor!=='rgb(255, 255, 255)')),'information has dark surfaces');
    await page.screenshot({path:resolve(out,`information-${width}.png`)});
    const settings=page.locator('.pl-workspace-layout-settings');
    await page.locator('[data-pl-module="optimizer"]').click();await frame(page);
    await contrast(page,'[data-fixture-optimizer-button]');
    assert.ok(await page.locator('[data-fixture-optimizer-button]').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundImage==='none'&&getComputedStyle(node).backgroundColor!=='rgb(255, 255, 255)')),'optimizer controls lose white surfaces');
    assert.equal(await page.locator('[data-fixture-optimizer-button]:disabled').count(),1);
    await page.screenshot({path:resolve(out,`optimizer-${width}.png`)});
    await page.locator('.pl-intro-info').click();await frame(page);
    assert.equal(await settings.getAttribute('open'),null);
    await settings.locator('summary').click();await settings.locator('.pl-workspace-default').waitFor({state:'visible'});
    await page.locator('[data-fixture-info-text]').first().click();await frame(page);
    assert.equal(await settings.getAttribute('open'),null,'outside click closes settings');
    await settings.locator('summary').click();await settings.locator('.pl-workspace-default').waitFor({state:'visible'});
    await settings.locator('summary').focus();await page.keyboard.press('Escape');assert.equal(await settings.getAttribute('open'),null);
    await settings.locator('summary').click();
    await page.locator('.pl-workspace-original').click();await page.waitForFunction(()=>!document.querySelector('.pl-workspace-deck'));
    assert.ok((await shadowTitles()).every(item=>item.background==='rgb(240, 240, 240)'&&item.styles===0),'Original removes shadow theme');
    assert.notEqual(await page.locator('html').getAttribute('data-pl-appearance'),'dark');
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);reports.push({width,ratios,identity});
    console.log(`PASS ${width}px dark/light/system, details, native identity, calendar, print and restoration`);await page.close();
  }
  const popup=await browser.newPage({viewport:{width:340,height:1050},colorScheme:'dark'});
  const popupErrors=[];popup.on('pageerror',error=>popupErrors.push(error.message));
  await popup.setContent((await readFile(resolve(root,'dist/popup.html'),'utf8')).replace('<script src="popup.js"></script>',''));
  await popup.evaluate(()=>{
    const listeners=[];window.popupStored={};
    window.chrome={runtime:{getManifest:()=>({version:'0.19.1'})},storage:{local:{get:async key=>({[key]:popupStored[key]}),set:async values=>{Object.assign(popupStored,values);listeners.forEach(fn=>fn(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{newValue:value}])),'local'));}},onChanged:{addListener:fn=>listeners.push(fn),removeListener:fn=>{const index=listeners.indexOf(fn);if(index>=0)listeners.splice(index,1);}}}};
  });
  await popup.addScriptTag({content:await readFile(resolve(root,'dist/popup.js'),'utf8')});
  await popup.waitForFunction(()=>document.documentElement.dataset.plAppearance==='dark');
  const popupContrast={labels:await contrast(popup,'.label'),notes:await contrast(popup,'.note:not(:empty)'),select:await contrast(popup,'#appearance')};
  await popup.screenshot({path:resolve(out,'popup-dark.png')});
  await popup.locator('#appearance').selectOption('light');
  await popup.waitForFunction(()=>document.documentElement.dataset.plAppearance==='light'&&popupStored['plannerLift.appearance.v1']==='light');
  await popup.emulateMedia({colorScheme:'light'});
  await popup.locator('#appearance').selectOption('dark');
  await popup.waitForFunction(()=>document.documentElement.dataset.plAppearance==='dark'&&popupStored['plannerLift.appearance.v1']==='dark');
  await popup.locator('#appearance').focus();await popup.keyboard.press('Home');await popup.keyboard.press('Enter');
  await popup.waitForFunction(()=>document.documentElement.dataset.plAppearance==='light'&&popupStored['plannerLift.appearance.v1']==='system');
  await popup.emulateMedia({colorScheme:'dark'});await popup.waitForFunction(()=>document.documentElement.dataset.plAppearance==='dark');
  assert.deepEqual(await popup.evaluate(()=>Object.keys(popupStored)),[appearanceKey]);assert.deepEqual(popupErrors,[]);
  reports.push({popup:true,ratios:popupContrast});console.log('PASS popup dark contrast, keyboard selection, storage isolation and system changes');await popup.close();
}finally{await browser.close();}
await writeFile(resolve(out,'report.json'),JSON.stringify(reports,null,2));
