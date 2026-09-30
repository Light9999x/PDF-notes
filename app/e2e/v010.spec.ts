// Prepared only. Do not run without explicit App/server startup authorization.
import { test,expect,type Page } from '@playwright/test';
import { createBlank } from '../src/core/blank';
import { edit,type Annotation } from '../src/core/model';
import { pack } from '../src/core/archive';
import { pageSettings } from './ui-helpers';
async function open(page:Page){
  await page.goto('/');let doc=await createBlank('v010','portrait','A');const a:Annotation={kind:'text',page:1,x:150,y:220,width:120,height:80,fontSize:20,text:'群組',color:'#123456',weight:1,opacity:1};
  doc=edit(edit(doc,'a',a,'A'),'b',{...a,x:340},'A');await page.locator('input[type=file]').first().setInputFiles({name:'v010.pdfnote',mimeType:'application/octet-stream',buffer:Buffer.from(pack(doc))});
  await expect(page.locator('[data-object="a"]')).toBeVisible();await expect(page.locator('.page-loading')).toHaveCount(0);await pageSettings(page);await page.getByRole('button',{name:'適合整頁',exact:true}).click();
}
async function geometry(page:Page){return page.evaluate(()=>{const r=document.querySelector('.page-scroll')!.getBoundingClientRect(),p=document.querySelector('.paper')!.getBoundingClientRect(),h=document.querySelector('.editor-controls')!.getBoundingClientRect();return {reader:{x:r.x,y:r.y,width:r.width,height:r.height},paper:{x:p.x,y:p.y,width:p.width,height:p.height},toolbar:h.height,scale:visualViewport?.scale};});}
for(const width of [320,360,412,600])test(`mobile overlay has no reserved width or paper movement at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await open(page);await page.emulateMedia({reducedMotion:'reduce'});const before=await geometry(page);expect(before.toolbar).toBeLessThanOrEqual(112);
  await page.locator('[data-panel-toggle]').click();await expect(page.locator('.context-panel')).not.toBeVisible();const after=await geometry(page);expect(after).toEqual(before);
  await page.locator('[data-panel-toggle]').click();await expect(page.locator('.context-panel')).toBeVisible();expect(await geometry(page)).toEqual(before);
});
test('touch pinch changes document size while UI and browser viewport scale stay fixed',async({page,context})=>{
  await page.setViewportSize({width:412,height:915});await open(page);await page.locator('[data-panel-toggle]').click();const before=await geometry(page),r=before.reader,y=r.y+r.height/2;
  const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:160,y},{id:2,x:240,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:120,y},{id:2,x:280,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>(await geometry(page)).paper.width).toBeGreaterThan(before.paper.width*1.8);const after=await geometry(page);expect(after.toolbar).toBe(before.toolbar);expect(after.reader).toEqual(before.reader);expect(after.scale).toBe(before.scale);
});
test('panel shell background and toggle travel together during the transition',async({page})=>{
  await page.setViewportSize({width:412,height:915});await open(page);await page.emulateMedia({reducedMotion:'no-preference'});
  const frames=await page.evaluate(async()=>{const toggle=document.querySelector<HTMLButtonElement>('[data-panel-toggle]')!,panel=document.querySelector('.context-panel')!;const measure=()=>{const a=panel.getBoundingClientRect(),b=toggle.getBoundingClientRect();return {panelTop:a.top,toggleBottom:b.bottom,background:getComputedStyle(panel).backgroundColor};};const start=measure();toggle.click();await new Promise(resolve=>setTimeout(resolve,80));const middle=measure();await new Promise(resolve=>setTimeout(resolve,140));return {start,middle};});
  expect(frames.middle.panelTop).toBeGreaterThan(frames.start.panelTop);expect(Math.abs(frames.middle.panelTop-frames.middle.toggleBottom)).toBeLessThan(1);expect(frames.middle.background).toBe(frames.start.background);
});
