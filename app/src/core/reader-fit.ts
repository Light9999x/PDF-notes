export type ZoomMode='manual'|'width'|'page';
export function fitZoom(mode:Exclude<ZoomMode,'manual'>,pageWidth:number,pageHeight:number,width:number,height:number):number|undefined {
  if(![pageWidth,pageHeight,width,height].every(n=>Number.isFinite(n)&&n>0))return;
  const zoom=mode==='width'?width/pageWidth:Math.min(width/pageWidth,height/pageHeight);
  return Number.isFinite(zoom)&&zoom>0?zoom:undefined;
}
export function readerSpace(width:number,height:number,cover=0){
  const visibleWidth=Math.max(0,width-cover),padX=Math.min(72,visibleWidth*.1),padY=Math.min(72,height*.15);
  return {width:visibleWidth-padX*2,height:height-padY*2,padX,padY,visibleWidth,left:cover};
}
type Rect={left:number;top:number;width:number;height:number};
export function pageVisibilityScore(page:Rect,viewport:Rect,layout:'vertical'|'horizontal',mode:ZoomMode){
  // Auto-fit centers the active page. Center distance stays stable even when a
  // much larger adjacent page has a greater visible intersection area.
  if(mode==='page')return layout==='vertical'?-Math.abs(page.top+page.height/2-viewport.top-viewport.height/2):-Math.abs(page.left+page.width/2-viewport.left-viewport.width/2);
  return Math.max(0,Math.min(page.left+page.width,viewport.left+viewport.width)-Math.max(page.left,viewport.left))*Math.max(0,Math.min(page.top+page.height,viewport.top+viewport.height)-Math.max(page.top,viewport.top));
}
