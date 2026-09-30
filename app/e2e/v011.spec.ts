// Prepared but not executed: requires explicit authorization to start the App.
import { test,expect,type Page } from '@playwright/test';
import { PDFDocument,rgb,degrees } from 'pdf-lib';
import { pageSettings } from './ui-helpers';
async function open(page:Page){
  const pdf=await PDFDocument.create();for(const [w,h,r] of [[600,800,0],[700,500,90],[400,600,0]]){const p=pdf.addPage([w,h]);p.setRotation(degrees(r));p.drawRectangle({x:0,y:0,width:w,height:h,color:rgb(.7,.1,.1)});}
  await page.goto('/');await page.locator('input[type=file]').first().setInputFiles({name:'v011.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await expect(page.locator('[data-page="1"]')).toHaveAttribute('data-render-state','ready');
}
test.describe('compact landscape',()=>{
  test.use({viewport:{width:915,height:412},hasTouch:true,isMobile:true});
  test('one row over 600px, complete action menu, shared bottom shell and stable reader geometry',async({page})=>{
    await open(page);await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.editor')).toHaveAttribute('data-landscape','true');
    const controls=await page.locator('.editor-controls').boundingBox();expect(controls!.height).toBeGreaterThanOrEqual(48);expect(controls!.height).toBeLessThanOrEqual(56);
    const reader=await page.locator('.page-scroll').boundingBox();for(const tool of ['畫筆','螢光筆','橡皮擦','文字','選取','插入圖片','頁面']){
      await page.getByRole('button',{name:tool,exact:true}).click();expect(await page.locator('.editor-controls').boundingBox()).toEqual(controls);expect(await page.locator('.page-scroll').boundingBox()).toEqual(reader);await expect(page.locator('.panel-dock')).toHaveCount(1);
    }
    const panel=await page.locator('.panel-dock').boundingBox(),toggle=await page.locator('[data-panel-toggle]').boundingBox();expect(Math.abs(panel!.y-toggle!.y-toggle!.height)).toBeLessThan(1);
    await page.locator('[data-panel-toggle]').click();await expect(page.locator('.context-panel')).not.toBeVisible();expect(await page.locator('.page-scroll').boundingBox()).toEqual(reader);
    await page.getByRole('button',{name:'文件與閱讀操作',exact:true}).click();for(const name of ['搜尋 PDF','匯出文件','復原','重做'])await expect(page.getByRole('group',{name:'文件與閱讀操作',exact:true}).getByRole('button',{name,exact:true})).toBeVisible();
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'文件與閱讀操作',exact:true}).click();await page.getByRole('button',{name:/文件資訊與頁碼/}).click();await expect(page.getByRole('dialog',{name:'文件資訊與頁碼'})).toContainText('v011.pdf');
  });
});
test('mixed pages retain desktop gaps through zoom and layout changes',async({page})=>{
  await page.setViewportSize({width:1280,height:900});await open(page);await pageSettings(page);
  for(const horizontal of [false,true]){await page.getByLabel('展示方向').selectOption(horizontal?'horizontal':'vertical');for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'放大',exact:true}).click();const gap=await page.locator('.paper').evaluateAll((nodes,horizontal)=>{const a=nodes[0].getBoundingClientRect(),b=nodes[1].getBoundingClientRect();return horizontal?b.left-a.right:b.top-a.bottom;},horizontal);expect(gap).toBeCloseTo(12,0);
  }}
});
test('completed colored bitmap is never cleared during repeated zoom frame samples',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await open(page);await pageSettings(page);
  const samples=await page.evaluate(async()=>{
    const samples:{canvas:boolean;color:number[];initial:boolean}[]=[];const paper=document.querySelector('[data-page="1"]')!;
    for(let frame=0;frame<60;frame++){
      if(frame<16&&frame%2===0)document.querySelector<HTMLButtonElement>(frame%4===0?'[aria-label="放大"]':'[aria-label="縮小"]')!.click();
      await new Promise(requestAnimationFrame);const canvas=paper.querySelector('canvas');samples.push({canvas:!!canvas,color:canvas?[...canvas.getContext('2d')!.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data]:[],initial:!!paper.querySelector('.page-loading')});
    }return samples;
  });
  for(const sample of samples){expect(sample.canvas).toBe(true);expect(sample.initial).toBe(false);expect(sample.color[0]).toBeGreaterThan(100);expect(sample.color[1]).toBeLessThan(100);expect(sample.color[3]).toBe(255);}expect(errors).toEqual([]);
});
