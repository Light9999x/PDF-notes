// Prepared for a user-authorized run; this suite was not executed for v005.
import { test, expect, type Page } from '@playwright/test';
import { createBlank } from '../src/core/blank';
import { edit, type Annotation } from '../src/core/model';
import { pack } from '../src/core/archive';

async function importNote(page:Page){
  const text:Annotation={kind:'text',page:1,x:80,y:120,width:180,height:80,color:'#245cba',opacity:1,weight:1,fontSize:18,text:'跨裝置測試'};
  const doc=edit(await createBlank('長文件名稱'.repeat(40),'portrait','A'),'text',text,'A');
  await page.goto('/');await page.locator('input[type=file]').first().setInputFiles({name:'ui.pdfnote',mimeType:'application/octet-stream',buffer:Buffer.from(pack(doc))});
  await expect(page.locator('.annotation-layer')).toBeVisible();await expect(page.locator('.page-loading')).toHaveCount(0);
}
async function selectText(page:Page){
  await page.getByRole('button',{name:'選取',exact:true}).click();
  const p=await page.locator('.annotation-layer > g').evaluate(g=>{const p=new DOMPoint(150,160).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:p.x,y:p.y};});
  await page.mouse.move(p.x-75,p.y-45);await page.mouse.down();await page.mouse.move(p.x,p.y);await page.mouse.up();
}
test('mobile recycle entry, direct restore, dialog Escape and focus return',async({page})=>{
  await page.setViewportSize({width:360,height:800});await importNote(page);await page.getByRole('button',{name:'返回文件庫',exact:true}).click();
  const summary=page.locator('.document-card .menu-trigger');await summary.click();await page.getByRole('button',{name:'刪除文件',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:/刪除「/});await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('aria-modal','true');
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(summary).toBeFocused();
  await summary.click();await page.getByRole('button',{name:'刪除文件',exact:true}).click();await dialog.getByRole('button',{name:'刪除文件',exact:true}).click();
  await page.getByRole('button',{name:'已刪除文件',exact:true}).click();await expect(page.getByRole('button',{name:'匯入文件',exact:true})).toHaveCount(0);
  await page.locator('.restore-document').click();await expect(page.locator('.document-card')).toHaveCount(0);await page.getByRole('button',{name:'返回文件庫',exact:true}).click();await expect(page.locator('.document-card')).toHaveCount(1);
});
test('context panel remains direct at 900/901 and preserves drafts when collapsed on a phone',async({page})=>{
  await page.setViewportSize({width:900,height:800});await importNote(page);await selectText(page);
  const panel=page.getByRole('complementary',{name:'物件屬性'});
  await expect(panel).toBeVisible();await expect(page.locator('[data-properties-trigger]')).toHaveCount(0);
  await page.getByLabel('編輯文字').fill('尚未套用的文字');await page.setViewportSize({width:901,height:800});await expect(page.getByLabel('編輯文字')).toHaveValue('尚未套用的文字');
  await page.setViewportSize({width:360,height:800});await page.getByRole('button',{name:'收合側面板',exact:true}).click();await expect(page.getByLabel('編輯文字')).not.toBeVisible();await page.getByRole('button',{name:'展開側面板',exact:true}).click();await expect(page.getByLabel('編輯文字')).toHaveValue('尚未套用的文字');
  await page.getByRole('button',{name:'套用變更',exact:true}).click();await expect(page.getByLabel('編輯文字')).toHaveValue('尚未套用的文字');
});
test('viewport matrix: chrome stays within body width and forms remain scrollable',async({page})=>{
  await importNote(page);
  for(const [width,height] of [[320,640],[360,800],[412,915],[915,412],[760,800],[761,800],[900,800],[901,800],[1024,768],[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    const reader=await page.locator('.page-scroll').boundingBox();expect(reader!.height).toBeGreaterThan(80);
    await page.getByRole('button',{name:'匯出文件',exact:true}).click();const dialog=page.getByRole('dialog',{name:'匯出文件',exact:true});
    expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(height);await expect(dialog.getByRole('button',{name:'工作存檔',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  }
});
