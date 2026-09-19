import { exportAction } from './ui-helpers';
// Requires an explicitly authorized browser/server run. Not executed for v004.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { createBlank } from '../src/core/blank';
import { edit, heads, type Annotation, type NoteDocument } from '../src/core/model';
import { pack, unpack } from '../src/core/archive';

const text:Annotation={kind:'text',page:1,x:60,y:100,width:80,height:50,color:'#123456',opacity:1,weight:1,fontSize:16,text:'中文 ABC 123，測試'};
async function open(page:Page){
  const doc=edit(edit(await createBlank('v004','portrait','A'),'a',text,'A'),'b',{...text,x:150,color:'#ff0000',opacity:.5},'A');
  await page.setViewportSize({width:1440,height:1100});await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({name:'v004.pdfnote',mimeType:'application/octet-stream',buffer:Buffer.from(pack(doc))});
  await expect(page.locator('.annotation-layer')).toBeVisible();await expect(page.locator('.page-loading')).toHaveCount(0);
  await page.getByRole('button',{name:'選取',exact:true}).click();return doc;
}
async function at(page:Page,x:number,y:number){return page.locator('.annotation-layer > g').evaluate((g,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:q.x,y:q.y};},{x,y});}
async function drag(page:Page,points:{x:number;y:number}[]){await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();}
async function saved(page:Page):Promise<NoteDocument>{const promise=page.waitForEvent('download');await exportAction(page,'工作存檔');return unpack(await fs.readFile((await (await promise).path())!));}
test('stable desktop sidebar, box selection, explicit mixed properties, grouped move/delete and history',async({page})=>{
  await open(page);const paper=page.locator('.paper'),left=(await paper.boundingBox())!.x;
  await expect(page.getByRole('complementary',{name:'物件屬性',exact:true})).toBeVisible();await page.getByRole('button',{name:'方框',exact:true}).click();
  await drag(page,[await at(page,30,70),await at(page,250,180)]);
  await expect(page.locator('.selection-heading')).toContainText('已選取 2 個');expect((await paper.boundingBox())!.x).toBeCloseTo(left);
  await expect(page.getByLabel('共同透明度')).toHaveValue('');await page.getByLabel('共同透明度').fill('0.7');await page.getByRole('button',{name:'套用共同屬性',exact:true}).click();
  let doc=await saved(page);expect(heads(doc,'a')[0].value).toMatchObject({opacity:.7,color:'#123456'});expect(heads(doc,'b')[0].value).toMatchObject({opacity:.7,color:'#ff0000'});
  const start=await at(page,90,125);await drag(page,[start,{x:start.x+20,y:start.y+30}]);
  await expect(page.locator('.selection-heading')).toContainText('已選取 2 個');doc=await saved(page);expect(heads(doc,'a')[0].value).toMatchObject({x:80,y:130});expect(heads(doc,'b')[0].value).toMatchObject({x:170,y:130});
  await page.getByRole('button',{name:'刪除所選物件',exact:true}).click();await expect(page.locator('[data-object]')).toHaveCount(0);
  await page.getByRole('button',{name:'復原',exact:true}).click();await expect(page.locator('[data-object]')).toHaveCount(2);
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('[data-object]')).toHaveCount(0);
});
test('lasso cancellation preserves selection and does not write operations; region drag starts on an object',async({page})=>{
  const original=await open(page);const a=await at(page,70,110);await drag(page,[await at(page,50,90),a]);await page.getByRole('button',{name:'自由選取',exact:true}).click();
  const path=await Promise.all([[30,70],[260,70],[260,180],[30,180]].map(([x,y])=>at(page,x,y)));
  await page.mouse.move(path[0].x,path[0].y);await page.mouse.down();await page.mouse.move(path[1].x,path[1].y);await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.locator('.selection-heading')).toContainText('已選取 1 個');expect((await saved(page)).operations).toEqual(original.operations);
  await drag(page,path);await expect(page.locator('.selection-heading')).toContainText('已選取 2 個');
  await page.getByRole('button',{name:'方框',exact:true}).click();await page.locator('.annotation-layer').focus();await page.keyboard.press('Escape');await drag(page,[a,await at(page,260,180)]);
  // After clearing, dragging over part of both boxes selects both without moving them.
  await expect(page.locator('.selection-heading')).toContainText('已選取 2 個');expect((await saved(page)).operations).toEqual(original.operations);
  await page.getByRole('button',{name:'畫筆',exact:true}).click();await expect(page.locator('.annotation-layer')).toHaveCSS('cursor','crosshair');
  await page.getByRole('button',{name:'螢光筆',exact:true}).click();await expect(page.locator('.annotation-layer')).toHaveCSS('cursor','crosshair');
});
