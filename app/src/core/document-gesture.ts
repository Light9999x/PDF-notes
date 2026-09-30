import type { Point } from './model';
export const MIN_ZOOM=.25,MAX_ZOOM=4,LONG_PRESS_MS=500,DRAG_SLOP=8;
export const clampZoom=(zoom:number)=>Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom));
export const midpoint=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export const pinchZoom=(zoom:number,start:number,a:Point,b:Point)=>clampZoom(zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,start));
export function nearestPage<T extends {left:number;top:number;width:number;height:number}>(pages:T[],p:Point):T|undefined{
  return pages.reduce<T|undefined>((best,next)=>{const distance=(r:T)=>Math.hypot(Math.max(r.left-p.x,0,p.x-r.left-r.width),Math.max(r.top-p.y,0,p.y-r.top-r.height));return !best||distance(next)<distance(best)?next:best;},undefined);
}

// Counter-scale only the flex gap. Offset the preview to keep the chosen page's
// anchor stationary even though all preceding gaps now occupy less layout space.
export function pinchSpacing(gap:number,scale:number,index:number,horizontal:boolean){
  const spacing=gap/scale,offset=(spacing-gap)*index*scale;
  return {gap:spacing,x:horizontal?-offset:0,y:horizontal?0:-offset};
}
