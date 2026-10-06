import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {nativeDetailFixtureHtml} from './workspace-fixture.mjs';

const url='https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx';
const css=await readFile(new URL('../dist/injected.css',import.meta.url),'utf8');
const js=await readFile(new URL('../dist/content.js',import.meta.url),'utf8');
const browser=await chromium.launch({executablePath:process.env.BETTER_MYUCLA_CHROMIUM||undefined});
try {
  const page=await browser.newPage();
  await page.route('**/*',route=>route.request().url()===url?route.fulfill({contentType:'text/html',body:nativeDetailFixtureHtml()}):route.abort());
  await page.goto(url);
  await page.evaluate(()=>{
    const stored={'plannerLift.layout.v1':{tidy:true},'plannerLift.header.v1':{compact:true}};
    window.fixtureStored=stored;
    window.chrome={storage:{local:{get:async key=>({[key]:stored[key]}),set:async values=>Object.assign(stored,values)},onChanged:{addListener(){},removeListener(){}}}};
  });
  await page.addStyleTag({content:css});await page.addScriptTag({content:js});
  await page.waitForSelector('.pl-workspace-host');
  for(const [width,height] of [[2048,1000],[1440,900],[960,650],[390,600],[900,350],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>{
      const box=document.querySelector('.pl-workspace-host').getBoundingClientRect();
      return Math.abs(box.x)<1&&Math.abs(box.y)<1&&Math.abs(box.width-innerWidth)<1&&Math.abs(box.height-innerHeight)<1;
    });
    console.log(`Viewport filled: ${width} x ${height}`);
  }
  await page.getByRole('button',{name:'Show header',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.pl-workspace-host').getBoundingClientRect().top>0);
  await page.getByRole('button',{name:'Compact header',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.pl-workspace-host').getBoundingClientRect().top===0);
  await page.locator('.pl-workspace-layout-settings > summary').click();
  await page.getByRole('button',{name:'Original layout',exact:true}).click();
  assert.equal(await page.locator('.pl-workspace-host').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('pl-workspace-page')),false);
  assert.equal(await page.evaluate(()=>fixtureStored['plannerLift.layout.v1'].tidy),false,'Original layout switches off saved Tidy preference');
  console.log('Header access and Original layout restoration passed');
} finally {await browser.close();}
