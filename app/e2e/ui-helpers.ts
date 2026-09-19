import type { Page } from '@playwright/test';
export async function exportAction(page:Page,name:'工作存檔'|'匯出 PDF'){
  await page.getByRole('button',{name:'匯出文件',exact:true}).click();
  await page.getByRole('dialog',{name:'匯出文件',exact:true}).getByRole('button',{name,exact:true}).click();
}
export async function pageSettings(page:Page){
  if(!await page.getByLabel('展示方向').isVisible())await page.getByRole('button',{name:/頁面設定/}).click();
}
export async function folders(page:Page){
  // v007 folders are always visible; older workflows ask for the global view.
  const all=page.getByRole('button',{name:'全部文件',exact:true});if(await all.getAttribute('aria-pressed')!=='true')await all.click();
}
export async function folderMenu(page:Page,name:string){
  await folders(page);const summary=page.getByLabel('管理資料夾 '+name,{exact:true});
  if(!await summary.evaluate(n=>n.parentElement?.hasAttribute('open')))await summary.click();
}

export async function selectObject(page:Page,selector='[data-object]'){
  const box=(await page.locator(selector).first().boundingBox())!;
  await page.getByRole('button',{name:'選取',exact:true}).click();await page.locator('.annotation-layer').first().focus();await page.keyboard.press('Escape');
  await page.mouse.move(box.x-4,box.y-4);await page.mouse.down();await page.mouse.move(box.x+8,box.y+8);await page.mouse.up();
}
