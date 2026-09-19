// Prepared for a later authorized browser run. Not executed during v007 work.
import { expect, test, type Page } from '@playwright/test';
import { createBlank } from '../src/core/blank';
import { edit, heads, type Annotation } from '../src/core/model';
import { pack, unpack } from '../src/core/archive';
import { exportAction, pageSettings, selectObject } from './ui-helpers';
import fs from 'node:fs/promises';
const annotation:Annotation={kind:'text',page:1,x:80,y:100,width:250,height:120,color:'#123456',opacity:1,weight:1,fontSize:18,text:'中文 ABC 123'};
async function open(page:Page){
  await page.setViewportSize({width:1366,height:1000});await page.goto('/');
  const doc=edit(await createBlank('v007','portrait','A'),'original-text',annotation,'A');
  await page.locator('input[type=file]').first().setInputFiles({name:'v007.pdfnote',mimeType:'application/octet-stream',buffer:Buffer.from(pack(doc))});
  await expect(page.locator('.page-loading')).toHaveCount(0);await pageSettings(page);await page.getByRole('button',{name:'適合整頁',exact:true}).click();await expect(page.locator('[data-object="original-text"]')).toBeVisible();
}
async function saved(page:Page){const download=page.waitForEvent('download');await exportAction(page,'工作存檔');return unpack(await fs.readFile((await (await download).path())!));}
async function at(page:Page,x:number,y:number){return page.locator('.annotation-layer>g').first().evaluate((g,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:q.x,y:q.y};},{x,y});}
test('single text short-click/F2, collapse during composition, cancel and unchanged edit preserve original ID/history',async({page})=>{
  await open(page);await expect(page.getByRole('button',{name:'收合側面板'})).toHaveAttribute('aria-expanded','true');const before=await saved(page);
  await selectObject(page,'[data-object="original-text"]');await expect(page.getByLabel('原位文字內容')).toHaveCount(0);
  const p=await at(page,110,130);await page.mouse.click(p.x,p.y);const input=page.getByLabel('原位文字內容');await expect(input).toBeFocused();
  await input.fill('未保存中文');await input.dispatchEvent('compositionstart');await page.getByRole('button',{name:'收合側面板'}).click();await expect(input).toBeFocused();await expect(input).toHaveValue('未保存中文');await input.dispatchEvent('compositionend');await input.press('Escape');
  expect((await saved(page)).operations).toEqual(before.operations);
  await page.locator('.annotation-layer').first().focus();await page.keyboard.press('F2');await input.press('Control+Enter');expect((await saved(page)).operations).toEqual(before.operations);
  await page.locator('.annotation-layer').first().focus();await page.keyboard.press('Enter');await input.fill('保存內容');await input.press('Control+Enter');const after=await saved(page);expect(after.operations).toHaveLength(before.operations.length+1);expect(heads(after,'original-text')[0].value).toMatchObject({...annotation,text:'保存內容'});
});
test('panel preserves property draft and manual preference across breakpoints',async({page})=>{
  await open(page);await selectObject(page,'[data-object="original-text"]');await page.getByLabel('編輯文字',{exact:true}).fill('側欄草稿');
  const wide=(await page.locator('.page-scroll').boundingBox())!.width;await page.getByRole('button',{name:'收合側面板'}).click();expect((await page.locator('.page-scroll').boundingBox())!.width).toBeGreaterThan(wide);await expect(page.getByLabel('編輯文字',{exact:true})).not.toBeVisible();
  await page.setViewportSize({width:360,height:800});await expect(page.getByRole('button',{name:'展開側面板'})).toHaveAttribute('aria-expanded','false');await page.getByRole('button',{name:'展開側面板'}).click();await expect(page.getByLabel('編輯文字',{exact:true})).toHaveValue('側欄草稿');
});
for(const width of [360,601,1366])test(`fit page respects visible bounds with panel expanded/collapsed at ${width}px`,async({page})=>{
  await open(page);await page.setViewportSize({width,height:800});
  for(const expanded of [true,false]){
    if(!expanded)await page.getByRole('button',{name:'收合側面板'}).click();
    for(let rotation=0;rotation<4;rotation++){
      if(rotation)await page.getByRole('button',{name:'旋轉頁面',exact:true}).click();
      await expect.poll(async()=>page.locator('.page-scroll').evaluate(root=>{const r=root.getBoundingClientRect(),p=root.querySelector('.paper')!.getBoundingClientRect(),panel=document.querySelector('.context-panel.narrow.expanded .context-content')?.getBoundingClientRect();const cover=parseFloat(getComputedStyle(root).getPropertyValue('--panel-cover'))||0,left=r.left+(panel?cover:0);return p.left>=left-1&&p.top>=r.top-1&&p.right<=r.right+1&&p.bottom<=r.bottom+1;})).toBe(true);
    }
  }
});
test('held brush straightens without move, follows endpoint, saves once and image mode cannot draw',async({page})=>{
  await open(page);await page.getByRole('button',{name:'畫筆',exact:true}).click();const a=await at(page,80,350),b=await at(page,300,355),c=await at(page,220,500);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:20});await page.waitForTimeout(1100);await page.mouse.move(c.x,c.y);await page.mouse.up();
  await expect(page.locator('[data-object]')).toHaveCount(2);const doc=await saved(page),stroke=doc.operations.find(o=>o.value?.kind==='pen')!.value as Annotation;expect(stroke.points).toHaveLength(2);await page.getByRole('button',{name:'復原',exact:true}).click();await expect(page.locator('[data-object]')).toHaveCount(1);
  await page.getByRole('button',{name:'插入圖片',exact:true}).click();await expect(page.getByRole('button',{name:'插入圖片',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'畫筆',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'收合側面板'}).click();await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.mouse.up();await expect(page.locator('[data-object]')).toHaveCount(1);
  await page.getByRole('button',{name:'展開側面板'}).click();await page.getByRole('button',{name:'屬性',exact:true}).click();await expect(page.getByRole('button',{name:'選取',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('direct folder navigation restores searched global location and does not show empty state for folders only',async({page})=>{
  await page.goto('/');const create=async(name:string)=>{await page.getByRole('button',{name:'新增資料夾',exact:true}).click();await page.getByLabel('資料夾名稱',{exact:true}).fill(name);await page.getByRole('button',{name:'儲存資料夾',exact:true}).click();};
  await create('父資料夾');await create('子資料夾');await page.getByRole('navigation',{name:'資料夾路徑'}).getByRole('button',{name:'父資料夾',exact:true}).click();await expect(page.getByRole('button',{name:'開啟資料夾 子資料夾',exact:true})).toBeVisible();await expect(page.locator('.empty-state')).toHaveCount(0);await expect(page.locator('.folder-navigation')).toHaveCount(0);
  await page.getByRole('button',{name:'全部文件',exact:true}).click();await page.getByLabel('搜尋資料夾與文件名稱').fill('子資料夾');await page.getByRole('button',{name:'開啟資料夾 子資料夾',exact:true}).press('Enter');await expect(page.getByLabel('搜尋資料夾與文件名稱')).toHaveValue('');await page.getByRole('button',{name:'← 返回',exact:true}).click();await expect(page.getByLabel('搜尋資料夾與文件名稱')).toHaveValue('子資料夾');await expect(page.getByRole('button',{name:'全部文件',exact:true})).toHaveAttribute('aria-pressed','true');
});
