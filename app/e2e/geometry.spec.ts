import { exportAction } from './ui-helpers';
import {test,expect} from '@playwright/test';
import {PDFDocument,StandardFonts,degrees} from 'pdf-lib';
import sharp from 'sharp';
import fs from 'node:fs/promises';
test('rotated cropped PDF annotations match the flattened export visually',async({page})=>{
  const pdf=await PDFDocument.create();const p=pdf.addPage([600,800]);p.setCropBox(25,35,530,710);p.setRotation(degrees(90));p.drawText('Rotated crop test',{x:70,y:630,font:await pdf.embedFont(StandardFonts.Helvetica),size:20});
  await page.goto('/');await page.locator('input[type=file]').first().setInputFiles({name:'crop.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.page-loading')).toHaveCount(0);await expect(page.locator('.textLayer')).toContainText('Rotated crop test');
  await page.getByRole('button',{name:'畫筆',exact:true}).click();const b=(await page.getByLabel('註記畫布',{exact:true}).boundingBox())!;await page.mouse.move(b.x+100,b.y+100);await page.mouse.down();await page.mouse.move(b.x+290,b.y+180,{steps:10});await page.mouse.up();await expect(page.locator('.reader-footer')).toContainText('1 個物件');
  await page.getByRole('button',{name:'文字',exact:true}).click();await page.mouse.click(b.x+200,b.y+220);await page.getByLabel('原位文字內容',{exact:true}).fill('裁切與旋轉');await page.getByLabel('原位文字內容',{exact:true}).press('Control+Enter');await expect(page.locator('.reader-footer')).toContainText('2 個物件');await page.getByRole('button',{name:'閱讀',exact:true}).click();
  const before=await page.locator('.paper').screenshot({path:'test-results/crop-before.png'});
  const dl=page.waitForEvent('download');await exportAction(page,'匯出 PDF');const file=await dl;const output=await fs.readFile((await file.path())!);await file.saveAs('test-results/crop-export.pdf');await page.getByRole('button',{name:'返回文件庫'}).click();await page.locator('input[type=file]').first().setInputFiles({name:'flattened.pdf',mimeType:'application/pdf',buffer:output});await expect(page.locator('.textLayer')).toContainText('Rotated crop test');await expect(page.locator('.page-loading')).toHaveCount(0);const after=await page.locator('.paper').screenshot({path:'test-results/crop-after.png'});
  const aa=await sharp(before).removeAlpha().raw().toBuffer({resolveWithObject:true}),bb=await sharp(after).removeAlpha().raw().toBuffer({resolveWithObject:true});expect(aa.info).toEqual(bb.info);let sum=0;for(let i=0;i<aa.data.length;i++)sum+=Math.abs(aa.data[i]-bb.data[i]);expect(sum/aa.data.length).toBeLessThan(2);
});
test('PNG and JPG convert locally and invalid documents report errors without creating entries',async({page})=>{
  await page.goto('/');await page.locator('input[type=file]').first().setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('broken file')});await expect(page.getByRole('alert')).toContainText('PDF 損毀');await expect(page.locator('.document-card')).toHaveCount(0);await page.getByLabel('關閉錯誤').click();
  for(const format of ['png','jpeg'] as const){const image=await sharp({create:{width:220,height:170,channels:3,background:'#31645a'}})[format]().toBuffer();await page.locator('input[type=file]').first().setInputFiles({name:'source.'+format,mimeType:'image/'+format,buffer:image});await expect(page.getByLabel('註記畫布',{exact:true})).toBeVisible();await expect(page.locator('.page-loading')).toHaveCount(0);await page.getByRole('button',{name:'返回文件庫'}).click();}
  await expect(page.locator('.document-card')).toHaveCount(2);
});
