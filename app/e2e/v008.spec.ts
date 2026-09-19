// Prepared only: running this suite starts a service and needs explicit user authorization.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createBlank } from '../src/core/blank';
import { pack, unpack } from '../src/core/archive';
import { addAsset, edit, heads, type Annotation } from '../src/core/model';
import { galleryHashes } from '../src/core/gallery';
import { exportAction, pageSettings } from './ui-helpers';
const text:Annotation={kind:'text',page:1,x:60,y:90,width:140,height:80,fontSize:18,text:'中文 ABC',color:'#123456',weight:1,opacity:1};
async function open(page:Page){
  await page.setViewportSize({width:1366,height:1000});await page.goto('/');
  const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="blue"/><rect width="80" height="20" fill="red"/><rect width="20" height="20" fill="lime"/><text x="30" y="15">UP ↑</text></svg>')).png().toBuffer(),asset=await addAsset(png,'image/png');
  let doc=edit(edit(await createBlank('v008','portrait','A'),'a',text,'A'),'b',{...text,x:300},'A');doc=edit({...doc,assets:{...doc.assets,[asset.hash]:asset}},'image',{...text,kind:'image',asset:asset.hash,x:100,y:360,width:240,height:120},'A');
  await page.locator('input[type=file]').first().setInputFiles({name:'v008.pdfnote',mimeType:'application/octet-stream',buffer:Buffer.from(pack(doc))});await expect(page.locator('[data-object="a"]')).toBeVisible();await expect(page.locator('.page-loading')).toHaveCount(0);await pageSettings(page);await page.getByRole('button',{name:'適合整頁',exact:true}).click();return {doc,asset,png};
}
async function at(page:Page,x:number,y:number){return page.locator('.annotation-layer>g').first().evaluate((g,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:q.x,y:q.y};},{x,y});}
async function click(page:Page,x:number,y:number){const p=await at(page,x,y);await page.mouse.click(p.x,p.y);}
async function saved(page:Page){const pending=page.waitForEvent('download');await exportAction(page,'工作存檔');return unpack(await fs.readFile((await (await pending).path())!));}

test('pointerup click/Shift, multi-drag, cancellation and second text click',async({page})=>{
  await open(page);await page.getByRole('button',{name:'選取',exact:true}).click();await click(page,120,130);await expect(page.locator('.selection-heading')).toHaveText('已選取 1 個物件');await expect(page.getByLabel('原位文字內容')).toHaveCount(0);
  await page.keyboard.down('Shift');await click(page,360,130);await page.keyboard.up('Shift');await expect(page.locator('.selection-heading')).toHaveText('已選取 2 個物件');
  const before=await saved(page),p=await at(page,120,130);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+20,p.y+20);await page.mouse.up();await expect(page.locator('.selection-heading')).toHaveText('已選取 2 個物件');const moved=await saved(page);for(const id of ['a','b'])expect((heads(moved,id)[0].value as Annotation).x).toBeGreaterThan((heads(before,id)[0].value as Annotation).x);
  await page.getByRole('button',{name:'復原',exact:true}).click();await click(page,120,130);await expect(page.locator('.selection-heading')).toHaveText('已選取 1 個物件');await expect(page.getByLabel('原位文字內容')).toHaveCount(0);
  await page.keyboard.down('Shift');await click(page,120,130);await page.keyboard.up('Shift');await expect(page.locator('.selection-heading')).toHaveText('尚未選取物件');
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.locator('.annotation-layer').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await expect(page.locator('.selection-heading')).toHaveText('尚未選取物件');
  await click(page,120,130);await click(page,120,130);await expect(page.getByLabel('原位文字內容')).toBeFocused();await page.getByLabel('原位文字內容').press('Escape');
});

for(const [width,height] of [[360,800],[412,915],[915,412],[1366,768]])test(`toolbar rects stable across all tools and text sizes at ${width}×${height}`,async({page})=>{
  await open(page);await page.setViewportSize({width,height});
  for(const percent of [100,150]){
    await page.evaluate(value=>document.documentElement.style.fontSize=value+'%',percent);
    for(const search of [false,true]){
      if(search)await page.getByRole('button',{name:'搜尋 PDF',exact:true}).click();let reference:{height:number;top:number}|undefined;
      for(const name of ['閱讀','選取','畫筆','螢光筆','文字','橡皮擦','插入圖片']){
        await page.getByRole('button',{name,exact:true}).click();const rect=await page.evaluate(()=>({height:document.querySelector('.editor-controls')!.getBoundingClientRect().height,top:document.querySelector('.page-scroll')!.getBoundingClientRect().top}));reference??=rect;expect(Math.abs(rect.height-reference.height)).toBeLessThanOrEqual(1);expect(Math.abs(rect.top-reference.top)).toBeLessThanOrEqual(1);
        const clipped=await page.locator('.tool-options').evaluate(root=>{const r=root.getBoundingClientRect();return [...root.querySelectorAll('button,input')].some(el=>{const b=el.getBoundingClientRect();return b.height<44||b.top<r.top||b.bottom>r.bottom;});});expect(clipped).toBe(false);
      }
      if(search)await page.getByRole('button',{name:'關閉搜尋',exact:true}).click();
    }
  }
});

test('left panel external control remains outside content and releases width',async({page})=>{
  await open(page);const geometry=()=>page.evaluate(()=>{const content=document.querySelector('.context-content')!.getBoundingClientRect(),toggle=document.querySelector('[data-panel-toggle]')!,t=toggle.getBoundingClientRect(),r=document.querySelector('.page-scroll')!.getBoundingClientRect();return {outside:!toggle.closest('.context-panel'),edge:Math.abs(content.right-t.left),reader:r.left>=t.right-1,width:r.width};});const expanded=await geometry();expect(expanded.outside&&expanded.reader).toBe(true);expect(expanded.edge).toBeLessThanOrEqual(1);await page.getByRole('button',{name:'收合側面板'}).click();expect((await geometry()).width).toBeGreaterThan(expanded.width);
});

test('gallery remove survives reload, preserves instances and same-bytes import restores membership',async({page})=>{
  const {asset,png}=await open(page);await page.getByRole('button',{name:'插入圖片',exact:true}).click();await page.locator('.gallery-item .menu-trigger').click();await page.getByRole('button',{name:'從圖片庫移除',exact:true}).click();await expect(page.locator('.gallery-thumb')).toHaveCount(0);const removed=await saved(page);expect(galleryHashes(removed)).toEqual([]);expect(heads(removed,'image')[0].value).toMatchObject({asset:asset.hash});expect(removed.assets[asset.hash].bytes).toEqual(asset.bytes);
  await page.reload();await page.getByRole('button',{name:'開啟 v008',exact:true}).click();await page.getByRole('button',{name:'插入圖片',exact:true}).click();await expect(page.locator('.gallery-thumb')).toHaveCount(0);await page.locator('.editor input[type=file]').setInputFiles({name:'again.png',mimeType:'image/png',buffer:png});await expect(page.locator('.gallery-thumb')).toHaveCount(1);
});

test('manual cutout canvas, undo, cancel and instance-only transparent PNG apply',async({page})=>{
  const {asset}=await open(page);await page.getByRole('button',{name:'選取',exact:true}).click();await click(page,220,420);await page.getByRole('button',{name:'去背此圖片',exact:true}).click();const dialog=page.getByRole('dialog',{name:'圖片去背',exact:true});await expect(dialog.locator('canvas')).toBeVisible();
  const remove=async()=>{const b=(await dialog.getByLabel('去背圈選畫布').boundingBox())!;await page.mouse.move(b.x,b.y);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height);await page.mouse.up();await expect(dialog.getByRole('button',{name:'復原去背',exact:true})).toBeEnabled();};
  const alpha=()=>dialog.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.getContext('2d')!.getImageData(5,5,1,1).data[3]);
  await remove();expect(await alpha()).toBe(0);await dialog.getByRole('button',{name:'復原去背',exact:true}).click();expect(await alpha()).toBe(255);await dialog.getByRole('button',{name:'重做去背',exact:true}).click();expect(await alpha()).toBe(0);await dialog.getByRole('button',{name:'取消',exact:true}).click();expect((heads(await saved(page),'image')[0].value as Annotation).asset).toBe(asset.hash);
  await page.getByRole('button',{name:'去背此圖片',exact:true}).click();await remove();await dialog.getByRole('button',{name:'套用至這個圖片',exact:true}).click();await expect(dialog).toHaveCount(0);const changed=await saved(page),hash=(heads(changed,'image')[0].value as Annotation).asset!;expect(hash).not.toBe(asset.hash);expect(changed.assets[asset.hash].bytes).toEqual(asset.bytes);const image=await sharp(changed.assets[hash].bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});expect(image.info.width).toBe(80);expect(image.info.height).toBe(40);expect(image.data[(5*80+5)*4+3]).toBe(0);
});
