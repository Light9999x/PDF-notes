import { galleryHashes } from '../src/core/gallery';
// Prepared only. Requires explicit authorization to start a browser/server.
import { test,expect,type Page } from '@playwright/test';
import { PDFDocument,StandardFonts,degrees } from 'pdf-lib';
import { createBlank } from '../src/core/blank';
import { pack,unpack } from '../src/core/archive';
import { heads,type Annotation } from '../src/core/model';
import { exportAction,pageSettings,selectObject } from './ui-helpers';
import fs from 'node:fs/promises';
import sharp from 'sharp';
async function open(page:Page){await page.setViewportSize({width:1366,height:1000});await page.goto('/');await page.locator('input[type=file]').first().setInputFiles({name:'v006.pdfnote',mimeType:'application/octet-stream',buffer:Buffer.from(pack(await createBlank('v006','portrait','A')))});await expect(page.locator('.page-loading')).toHaveCount(0);}
async function at(page:Page,x:number,y:number){return page.locator('.annotation-layer > g').first().evaluate((g,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:q.x,y:q.y};},{x,y});}
async function saved(page:Page){const promise=page.waitForEvent('download');await exportAction(page,'工作存檔');return unpack(await fs.readFile((await (await promise).path())!));}
test('inline IME, newline, existing identity, Escape and empty edit',async({page})=>{
  await open(page);await page.getByRole('button',{name:'文字',exact:true}).click();const p=await at(page,100,150);await page.mouse.click(p.x,p.y);
  const input=page.getByLabel('原位文字內容');await input.dispatchEvent('compositionstart');await input.fill('中文 ABC 123，測試');await input.press('Enter');await expect(page.locator('[data-object]')).toHaveCount(0);await input.dispatchEvent('compositionend');await input.press('Control+Enter');await expect(page.locator('[data-object]')).toHaveCount(1);
  const first=await saved(page),id=first.operations.find(o=>o.value?.kind==='text')!.objectId;await page.mouse.click(p.x+10,p.y+10);await input.fill('暫存');await input.press('Escape');expect((await saved(page)).operations).toEqual(first.operations);
  await page.mouse.click(p.x+10,p.y+10);await input.fill('');await input.press('Control+Enter');const cleared=await saved(page);expect(heads(cleared,id)[0].value).toMatchObject({kind:'text',text:''});expect(new Set(cleared.operations.filter(o=>o.value?.kind==='text').map(o=>o.objectId)).size).toBe(1);
});
test('gallery import is durable before placement and repeated placements have independent IDs',async({page})=>{
  await open(page);await page.getByRole('button',{name:'插入圖片',exact:true}).click();const bytes=await sharp({create:{width:120,height:80,channels:3,background:'#349988'}}).png().toBuffer();await page.locator('.editor input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:bytes});await expect(page.locator('.gallery-thumb')).toHaveCount(1);
  const imported=await saved(page);expect(galleryHashes(imported)).toHaveLength(1);expect(imported.operations.filter(o=>o.value?.kind==='image')).toHaveLength(0);
  for(const [x,y] of [[60,70],[320,320]]){await page.getByRole('button',{name:'插入圖片',exact:true}).click();await page.locator('.gallery-thumb').click();const p=await at(page,x,y);await page.mouse.click(p.x,p.y);await expect(page.getByRole('button',{name:'插入圖片',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'屬性',exact:true}).click();await expect(page.getByLabel('寬度',{exact:true})).toHaveValue('240');}
  const placed=await saved(page),images=placed.operations.filter(o=>o.value?.kind==='image');expect(new Set(images.map(o=>o.objectId)).size).toBe(2);expect(new Set(images.map(o=>(o.value as Annotation).asset)).size).toBe(1);
  await page.getByRole('button',{name:'刪除物件',exact:true}).click();await page.getByRole('button',{name:'插入圖片',exact:true}).click();await expect(page.locator('.gallery-thumb')).toHaveCount(1);
  await page.reload();await page.getByRole('button',{name:'開啟 v006',exact:true}).click();await page.getByRole('button',{name:'插入圖片',exact:true}).click();await expect(page.locator('.gallery-thumb')).toHaveCount(1);
});
test('PDF search highlights partial spans, advances matches, clears, and native selection is mode-scoped',async({page})=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),p=pdf.addPage([595,842]);p.drawText('prefix MATCH suffix MATCH',{x:80,y:700,font,size:20});await page.goto('/');await page.locator('input[type=file]').first().setInputFiles({name:'search.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.getByRole('button',{name:'搜尋 PDF',exact:true}).click();await page.getByLabel('搜尋 PDF 文字').fill('match');await expect(page.locator('#pdf-search [role=status]')).toHaveText('1 / 2');await expect(page.locator('.search-hit')).toHaveCount(2);await page.getByRole('button',{name:'下一筆',exact:true}).click();await expect(page.locator('#pdf-search [role=status]')).toHaveText('2 / 2');
  const hit=(await page.locator('.search-hit.current').boundingBox())!,line=(await page.locator('.textLayer span').first().boundingBox())!;expect(hit.width).toBeLessThan(line.width/2);
  await page.getByRole('button',{name:'選取',exact:true}).click();await expect(page.locator('.textLayer')).toHaveCSS('user-select','none');await page.getByRole('button',{name:'閱讀',exact:true}).click();await expect(page.locator('.textLayer')).toHaveCSS('user-select','text');await page.getByRole('button',{name:'關閉搜尋',exact:true}).click();await expect(page.locator('.search-hit')).toHaveCount(0);
});
for(const native of [0,90,180,270])test(`visible mixed text fixture on native ${native} rotated PDF; screenshot requires manual glyph review`,async({page})=>{
  await page.setViewportSize({width:1366,height:1000});const pdf=await PDFDocument.create(),p=pdf.addPage([600,800]);p.setCropBox(25,35,530,710);p.setRotation(degrees(native));await page.goto('/');await page.locator('input[type=file]').first().setInputFiles({name:'orientation.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.page-loading')).toHaveCount(0);
  await page.getByRole('button',{name:'文字',exact:true}).click();const point=await at(page,180,180);await page.mouse.click(point.x,point.y);await page.getByLabel('原位文字內容').fill('中文 ABC 123，測試');await page.screenshot({path:`test-results/v006-inline-${native}.png`});await page.getByLabel('原位文字內容').press('Control+Enter');await selectObject(page);await expect(page.getByLabel('物件旋轉角度')).toHaveValue('0');await page.getByRole('button',{name:'閱讀',exact:true}).click();await page.screenshot({path:`test-results/v006-text-${native}.png`});
  await pageSettings(page);await page.getByRole('button',{name:'旋轉頁面',exact:true}).click();await expect(page.locator('.page-loading')).toHaveCount(0);await page.screenshot({path:`test-results/v006-rotated-${native}.png`});
});
