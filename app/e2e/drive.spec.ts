import { selectObject } from './ui-helpers';
import { folders, folderMenu } from './ui-helpers';
import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
test('two isolated devices exchange immutable assets and merge through the Drive adapter (mock API)',async({browser})=>{
  const cloud=new Map<string,{id:string;name:string;size:string;appProperties:Record<string,string>;bytes:Buffer}>();let seq=0;let rejectNextUpload=false;
  const a=await browser.newContext({serviceWorkers:'block'}),b=await browser.newContext({serviceWorkers:'block'});
  const headers={'access-control-allow-origin':'*','content-type':'application/json'};
  async function transport(context:BrowserContext){
    await context.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:'MOCK_NOT_A_REAL_TOKEN',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.appdata'})})}}};`}));
    await context.route('https://www.googleapis.com/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      expect(request.headers().authorization).toBe('Bearer MOCK_NOT_A_REAL_TOKEN');
      if(url.pathname.includes('/upload/')){
        if(rejectNextUpload){rejectNextUpload=false;await route.fulfill({status:429,headers,body:JSON.stringify({error:{message:'Simulated quota limit'}})});return;}
        const boundary=request.headers()['content-type'].split('boundary=')[1];const body=request.postDataBuffer()!;
        const separator=Buffer.from('\r\n--'+boundary+'\r\n');const metaStart=body.indexOf(Buffer.from('\r\n\r\n'))+4;const metaEnd=body.indexOf(separator,metaStart);const metadata=JSON.parse(body.subarray(metaStart,metaEnd).toString());
        expect(metadata.parents).toEqual(['appDataFolder']);expect(metadata.appProperties.app).toBe('pdfnote-v1');
        const mediaStart=body.indexOf(Buffer.from('\r\n\r\n'),metaEnd+separator.length)+4;const mediaEnd=body.lastIndexOf(Buffer.from('\r\n--'+boundary+'--'));const bytes=body.subarray(mediaStart,mediaEnd);const id=String(++seq);
        cloud.set(id,{id,name:metadata.name,appProperties:metadata.appProperties,size:String(bytes.length),bytes});await route.fulfill({headers,body:JSON.stringify({id})});
      }else if(url.searchParams.get('alt')==='media'){
        const file=cloud.get(url.pathname.split('/').pop()!)!;await route.fulfill({headers:{...headers,'content-type':'application/octet-stream'},body:file.bytes});
      }else{expect(url.searchParams.get('spaces')).toBe('appDataFolder');await route.fulfill({headers,body:JSON.stringify({files:[...cloud.values()].map(({bytes,...rest})=>rest)})});}
    });
  }
  await transport(a);await transport(b);const win=await a.newPage(),android=await b.newPage();
  async function settings(page:Page){if(await page.getByRole('button',{name:'返回文件庫'}).count())await page.getByRole('button',{name:'返回文件庫'}).click();await page.getByRole('button',{name:'同步與設定',exact:true}).click();}
  async function connect(page:Page){await settings(page);await page.locator('.advanced-settings > summary').click();await page.getByLabel('Google OAuth 用戶端 ID').fill('mock.apps.googleusercontent.com');await page.getByRole('button',{name:'連結 Google Drive',exact:true}).click();await expect(page.locator('.status-list [role=status]')).toContainText('同步完成');}
  async function pull(page:Page){await settings(page);await page.getByRole('button',{name:'立即同步',exact:true}).click();await expect(page.locator('.status-list [role=status]')).toContainText('同步完成');}
  async function open(page:Page){await page.getByRole('button',{name:'我的文件',exact:true}).click();await page.getByRole('button',{name:'開啟 shared',exact:true}).click();await expect(page.locator('.page-loading')).toHaveCount(0);}
  async function addText(page:Page,text:string,x:number,y:number){await page.getByRole('button',{name:'文字',exact:true}).click();const box=(await page.getByLabel('註記畫布',{exact:true}).boundingBox())!;await page.mouse.click(box.x+x,box.y+y);await page.getByLabel('原位文字內容',{exact:true}).fill(text);await page.getByLabel('原位文字內容',{exact:true}).press('Control+Enter');await expect(page.locator('.annotation-layer text')).toContainText(text);}
  await win.goto('/');await android.goto('/');const pdf=await PDFDocument.create();pdf.addPage([500,700]);await win.locator('input[type=file]').first().setInputFiles({name:'shared.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(win.getByLabel('註記畫布',{exact:true})).toBeVisible();await connect(win);await connect(android);
  await open(win);await open(android);await a.setOffline(true);await b.setOffline(true);await addText(win,'Windows offline note',70,130);await addText(android,'Android offline note',70,230);
  await win.getByRole('button',{name:'選取',exact:true}).click();await selectObject(win);await win.getByLabel('文字方向',{exact:true}).selectOption('vertical-rl');await win.getByRole('button',{name:'套用變更',exact:true}).click();await win.getByLabel('物件旋轉角度').fill('37.25');await win.getByLabel('物件旋轉角度').press('Enter');await expect.poll(()=>win.locator('[data-object] > g').first().evaluate(g=>{const m=(g as SVGGraphicsElement).transform.baseVal.getItem(0).matrix;return Math.atan2(m.b,m.a)*180/Math.PI;})).toBeCloseTo(37.25);
  rejectNextUpload=true;await a.setOffline(false);await settings(win);await expect(win.locator('.status-list [role=status]')).toContainText('額度不足');await pull(win);await b.setOffline(false);await pull(android);await pull(win);await open(win);await open(android);
  await expect(win.locator('.reader-footer')).toContainText('2 個物件');await expect(android.locator('.reader-footer')).toContainText('2 個物件');expect([...cloud.values()].some(f=>f.appProperties.type==='asset')).toBe(true);expect([...cloud.values()].filter(f=>f.appProperties.type==='snapshot').length).toBeGreaterThan(1);
  expect(await android.locator('[data-object] > g').evaluateAll(nodes=>nodes.filter(g=>{const m=(g as SVGGraphicsElement).transform.baseVal.getItem(0).matrix;return Math.abs(Math.atan2(m.b,m.a)*180/Math.PI-37.25)<.01;}).length)).toBe(1);
  async function library(page:Page){if(await page.getByRole('button',{name:'返回文件庫'}).count())await page.getByRole('button',{name:'返回文件庫'}).click();await page.getByRole('button',{name:'我的文件',exact:true}).click();await folders(page);await page.getByRole('button',{name:'全部文件',exact:true}).click();}
  async function folder(page:Page,name:string){await page.getByRole('button',{name:'新增資料夾',exact:true}).click();await page.getByLabel('資料夾名稱',{exact:true}).fill(name);await page.getByRole('button',{name:'儲存資料夾',exact:true}).click();await expect(page.locator('#search-scope')).toContainText(name);}
  async function move(page:Page,name:string,target:string){await library(page);await page.getByLabel('管理 '+name,{exact:true}).click();await page.getByRole('button',{name:'移動到資料夾',exact:true}).click();await page.getByLabel('目的資料夾').selectOption({label:target});await page.getByRole('button',{name:'確認移動',exact:true}).click();await expect(page.getByRole('button',{name:'確認移動',exact:true})).toHaveCount(0);}
  await a.setOffline(true);await b.setOffline(true);await library(win);await library(android);await folder(win,'並行資料夾');await folder(android,'並行資料夾');await move(win,'shared','並行資料夾');await move(android,'shared','並行資料夾');
  await win.getByLabel('管理 shared',{exact:true}).click();await win.getByRole('button',{name:'重新命名',exact:true}).click();await win.getByLabel('文件名稱',{exact:true}).fill('Renamed');await win.getByRole('button',{name:'儲存名稱',exact:true}).click();
  await a.setOffline(false);await pull(win);await b.setOffline(false);await pull(android);await pull(win);await library(win);await library(android);await expect(win.locator('.folder-tile')).toHaveCount(2);await expect(android.getByRole('button',{name:'開啟 Renamed',exact:true})).toBeVisible();await expect(win.locator('.classification-warning')).toContainText('分類有衝突');
  await win.getByRole('button',{name:/衝突管理/}).click();await expect(win.getByRole('heading',{name:'分類管理衝突',exact:true})).toBeVisible();await win.getByRole('button',{name:/分類版本 1/}).click();await win.screenshot({path:'test-results/v002-management-conflict.png',fullPage:true});await win.getByRole('button',{name:'保留此分類版本',exact:true}).click();await expect(win.locator('.management-conflict')).toHaveCount(0);
  await pull(win);await pull(android);await android.getByRole('button',{name:/衝突管理/}).click();await expect(android.locator('.management-conflict')).toHaveCount(0);
  await library(win);await folder(win,'競爭目的地');await pull(win);await pull(android);await library(win);await library(android);await a.setOffline(true);await b.setOffline(true);
  await folderMenu(win,'競爭目的地');await win.getByLabel('刪除資料夾 競爭目的地',{exact:true}).click();await win.getByRole('button',{name:'確認刪除資料夾',exact:true}).click();await expect(win.getByLabel('刪除資料夾 競爭目的地',{exact:true})).toHaveCount(0);await move(android,'Renamed','競爭目的地');
  await a.setOffline(false);await pull(win);await b.setOffline(false);await pull(android);await pull(win);await library(win);await folders(win);await win.getByRole('button',{name:'未分類',exact:true}).click();await expect(win.getByRole('button',{name:'開啟 Renamed',exact:true})).toBeVisible();await expect(win.locator('.classification-warning')).toContainText('資料夾已刪除');
  expect([...cloud.values()].some(f=>f.appProperties.type==='library')).toBe(true);
  await library(win);await folder(win,'Cycle A');await library(win);await folder(win,'Cycle B');await pull(win);await pull(android);await library(win);await library(android);await a.setOffline(true);await b.setOffline(true);
  async function moveFolder(page:Page,name:string,target:string){await folderMenu(page,name);await page.getByLabel('移動資料夾 '+name,{exact:true}).click();await page.getByLabel('目的資料夾').selectOption({label:target});await page.getByRole('button',{name:'確認移動',exact:true}).click();await expect(page.getByRole('button',{name:'確認移動',exact:true})).toHaveCount(0);}
  await moveFolder(win,'Cycle A','Cycle B');await moveFolder(android,'Cycle B','Cycle A');await a.setOffline(false);await pull(win);await b.setOffline(false);await pull(android);await pull(win);
  await win.getByRole('button',{name:/衝突管理/}).click();await expect(win.getByRole('button',{name:'將此資料夾移回根層',exact:true})).toHaveCount(2);await win.getByRole('button',{name:'將此資料夾移回根層',exact:true}).first().click();await expect(win.getByRole('button',{name:'將此資料夾移回根層',exact:true})).toHaveCount(0);await pull(win);await pull(android);await android.getByRole('button',{name:/衝突管理/}).click();await expect(android.getByRole('button',{name:'將此資料夾移回根層',exact:true})).toHaveCount(0);
  expect([...cloud.values()].some(f=>f.appProperties.type==='library'&&JSON.parse(f.bytes.toString()).format===2)).toBe(true);
  await a.close();await b.close();
});
