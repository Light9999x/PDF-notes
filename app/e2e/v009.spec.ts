// Prepared, not run: this suite requires explicit authorization to start the App.
import { test,expect,type Page } from '@playwright/test';
import { createBlank } from '../src/core/blank';
import { edit,type Annotation } from '../src/core/model';
import { pack,unpack } from '../src/core/archive';
import { orderedAnnotations } from '../src/core/layers';
import { exportAction,pageSettings } from './ui-helpers';
import fs from 'node:fs/promises';
async function open(page:Page){
  await page.goto('/');let doc=await createBlank('v009','portrait','A');const value:Annotation={kind:'text',page:1,x:100,y:200,width:250,height:150,fontSize:32,text:'前後圖層',color:'#123456',weight:1,opacity:1};
  for(const id of ['a','b','c'])doc=edit(doc,id,{...value,text:id},'A');
  await page.locator('input[type=file]').first().setInputFiles({name:'v009.pdfnote',mimeType:'application/octet-stream',buffer:Buffer.from(pack(doc))});await expect(page.locator('[data-object="c"]')).toBeVisible();await expect(page.locator('.page-loading')).toHaveCount(0);await pageSettings(page);await page.getByRole('button',{name:'適合整頁',exact:true}).click();
}
async function saved(page:Page){const pending=page.waitForEvent('download');await exportAction(page,'工作存檔');return unpack(await fs.readFile((await (await pending).path())!));}
test('layer controls change drawing and top hit, persist, and undo as one batch',async({page})=>{
  await open(page);await page.getByRole('button',{name:'選取',exact:true}).click();
  const point=await page.locator('.annotation-layer>g').evaluate(g=>{const p=new DOMPoint(225,275).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:p.x,y:p.y};});await page.mouse.click(point.x,point.y);await expect(page.getByLabel('編輯文字',{exact:true})).toHaveValue('c');await expect(page.getByRole('button',{name:'移到最上層',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'移到最下層',exact:true}).click();await expect.poll(()=>page.locator('[data-object]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-object')))).toEqual(['c','a','b']);expect(orderedAnnotations(await saved(page)).map(o=>o.id)).toEqual(['c','a','b']);await page.mouse.click(point.x,point.y);await expect(page.getByLabel('編輯文字',{exact:true})).toHaveValue('b');await page.getByRole('button',{name:'復原',exact:true}).click();expect(orderedAnnotations(await saved(page)).map(o=>o.id)).toEqual(['a','b','c']);
});
test('more menu overlays upward without changing card geometry, Escape restores trigger',async({page})=>{
  await open(page);await page.getByRole('button',{name:'返回文件庫',exact:true}).click();const card=page.locator('.document-card').first(),trigger=card.locator('.menu-trigger'),before=await card.boundingBox();await trigger.click();const menu=page.locator('.floating-menu');await expect(menu).toBeVisible();expect(await card.boundingBox()).toEqual(before);const m=(await menu.boundingBox())!,t=(await trigger.boundingBox())!;expect(m.y+m.height).toBeLessThanOrEqual(t.y+1);await page.keyboard.press('End');await expect(menu.getByRole('button').last()).toBeFocused();await page.keyboard.press('Escape');await expect(menu).not.toBeVisible();await expect(trigger).toBeFocused();
});
for(const width of [360,1366])test(`panel animation preserves draft, external control and reduced motion at ${width}px`,async({page})=>{
  await open(page);await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const toggle=page.locator('[data-panel-toggle]');await expect(toggle).toHaveAttribute('aria-expanded','true');await toggle.click();await expect(page.locator('.context-content')).not.toBeVisible();await expect(page.locator('.context-content')).toHaveAttribute('inert','');expect(await toggle.evaluate(n=>!!n.closest('.context-panel'))).toBe(false);await toggle.click();await expect(page.locator('.context-content')).toBeVisible();
  await page.emulateMedia({reducedMotion:'no-preference'});await toggle.click();await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(page.locator('.context-content')).toBeVisible();
  const colors=await page.evaluate(()=>[getComputedStyle(document.querySelector('.editor-body')!).backgroundColor,getComputedStyle(document.querySelector('.page-scroll')!).backgroundColor]);expect(colors[0]).toBe(colors[1]);
});
