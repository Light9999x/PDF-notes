import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { pageMatrix, type Matrix } from './geometry';
export type PageGeometry={viewport:ReturnType<PDFPageProxy['getViewport']>;bounds:number[];rotation:number};
export type PageView={width:number;height:number;scale?:number;matrix:Matrix;bounds:number[];rotation:number};
const cache=new WeakMap<PDFDocumentProxy,Promise<PageGeometry[]>>();
export function pageGeometry(reader:PDFDocumentProxy):Promise<PageGeometry[]>{
  const cached=cache.get(reader);if(cached)return cached;
  const task=(async()=>{const result:PageGeometry[]=new Array(reader.numPages);let cursor=1;
    await Promise.all(Array.from({length:Math.min(4,reader.numPages)},async()=>{while(cursor<=reader.numPages){const n=cursor++,page=await reader.getPage(n);result[n-1]={viewport:page.getViewport({scale:1}),bounds:[...page.view],rotation:page.rotate};}}));return result;
  })();cache.set(reader,task);void task.catch(()=>cache.delete(reader));return task;
}
export function pageViews(geometry:PageGeometry[],zoom:number,rotation:number):PageView[]{
  return geometry.map(g=>{const viewport=g.viewport.clone({scale:zoom,rotation:(g.rotation+rotation)%360});return {width:viewport.width,height:viewport.height,scale:zoom,matrix:pageMatrix(viewport.transform,g.bounds),bounds:g.bounds,rotation:viewport.rotation};});
}
// Transform an already rendered layer into the requested display geometry.
// This handles rotation and CropBox as well as a simple scale preview.
export function layerTransform(from:Matrix,to:Matrix):Matrix{
  const [a,b,c,d,e,f]=from,det=a*d-b*c,inv:Matrix=[d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det];
  return [to[0]*inv[0]+to[2]*inv[1],to[1]*inv[0]+to[3]*inv[1],to[0]*inv[2]+to[2]*inv[3],to[1]*inv[2]+to[3]*inv[3],to[0]*inv[4]+to[2]*inv[5]+to[4],to[1]*inv[4]+to[3]*inv[5]+to[5]];
}
