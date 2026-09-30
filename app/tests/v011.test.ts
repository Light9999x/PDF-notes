import { describe,it,expect,vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument,degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pageGeometry,pageViews,layerTransform } from '../src/core/page-geometry';
import { pageMatrix,transform } from '../src/core/geometry';
import { pinchSpacing } from '../src/core/document-gesture';
import { LatestFrame,RenderCoordinator,abortError,rasterSize,MAX_PAGE_PIXELS,MAX_CACHED_PIXELS,MAX_CACHED_PAGES,MAX_CANVAS_SIDE } from '../src/core/render-coordinator';
const deferred=<T>()=>{let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function bitmap(color:string){const canvas=createCanvas(20,30),context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,20,30);return canvas;}
const pixel=(canvas:ReturnType<typeof bitmap>)=>[...canvas.getContext('2d').getImageData(10,10,1,1).data];

describe('completed bitmap lifetime and latest result ownership',()=>{
  it('retains actual pixels throughout pending work and failures, then releases old pixels only after committing a complete replacement',async()=>{
    const release=vi.fn((c:ReturnType<typeof bitmap>)=>{c.width=0;}),frames=new LatestFrame(release),commit=vi.fn(),error=vi.fn(),red=bitmap('red');
    await frames.render(async()=>red,commit,error);const next=deferred<ReturnType<typeof bitmap>>();
    const request=frames.render(()=>next.promise,commit,error);expect(pixel(frames.current!)).toEqual([255,0,0,255]);expect(release).not.toHaveBeenCalled();
    next.reject(new Error('render failed'));await request;expect(error).toHaveBeenCalledOnce();expect(frames.current).toBe(red);expect(pixel(red)).toEqual([255,0,0,255]);
    const blue=bitmap('blue');await frames.render(async()=>blue,frame=>{expect(frame).toBe(blue);expect(pixel(red)).toEqual([255,0,0,255]);},error);
    expect(pixel(frames.current!)).toEqual([0,0,255,255]);expect(release).toHaveBeenCalledExactlyOnceWith(red);frames.clear();expect(release).toHaveBeenCalledWith(blue);
  });
  it('discards late success and cancellation from superseded zooms, including a different document lifecycle',async()=>{
    const release=vi.fn(),frames=new LatestFrame(release),commit=vi.fn(),error=vi.fn(),late=deferred<ReturnType<typeof bitmap>>();let signal!:AbortSignal;
    const old=frames.render(s=>{signal=s;return late.promise;},commit,error);const blue=bitmap('blue');await frames.render(async()=>blue,commit,error);expect(signal.aborted).toBe(true);
    const red=bitmap('red');late.resolve(red);await old;expect(frames.current).toBe(blue);expect(commit).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledWith(red);expect(error).not.toHaveBeenCalled();
    const pending=deferred<ReturnType<typeof bitmap>>(),last=frames.render(()=>pending.promise,commit,error);frames.clear();pending.reject(abortError());await last;expect(frames.current).toBeUndefined();expect(error).not.toHaveBeenCalled();
  });
});

describe('bounded PDF rendering and cache',()=>{
  it('runs two jobs at most, favors visible queued pages and removes obsolete queued work before allocating',async()=>{
    const coordinator=new RenderCoordinator(),signal=new AbortController(),obsolete=new AbortController(),a=deferred<void>(),b=deferred<void>(),order:string[]=[];
    const first=coordinator.schedule(10,signal.signal,async()=>{order.push('a');await a.promise;});
    const second=coordinator.schedule(10,signal.signal,async()=>{order.push('b');await b.promise;});
    const near=coordinator.schedule(10,signal.signal,async()=>{order.push('near');});
    const removed=coordinator.schedule(100,obsolete.signal,async()=>{order.push('obsolete');}).catch(e=>e.name);
    const visible=coordinator.schedule(100,signal.signal,async()=>{order.push('visible');});await tick();expect(order).toEqual(['a','b']);obsolete.abort();expect(await removed).toBe('AbortError');
    a.resolve();await tick();expect(order).toEqual(['a','b','visible','near']);b.resolve();await Promise.all([first,second,near,visible]);coordinator.dispose();
  });
  it('cancels queued and running work when a PDF closes, without releasing canvases until workers settle',async()=>{
    const coordinator=new RenderCoordinator(),abort=new AbortController(),release=vi.fn();let allocations=0;
    const worker=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{allocations++;signal.addEventListener('abort',()=>{release();reject(abortError());},{once:true});});
    const jobs=Array.from({length:4},()=>coordinator.schedule(10,abort.signal,worker).catch(e=>e.name));await tick();expect(allocations).toBe(2);coordinator.dispose();expect(await Promise.all(jobs)).toEqual(Array(4).fill('AbortError'));expect(release).toHaveBeenCalledTimes(2);
    await expect(coordinator.schedule(100,abort.signal,worker)).rejects.toHaveProperty('name','AbortError');
  });
  it('evicts distant frames before visible frames, bounds pixels and count, and can retain a revisited page',()=>{
    const c=new RenderCoordinator(),visible={},far={},releaseVisible=vi.fn(),releaseFar=vi.fn();c.retain(visible,8e6,100,releaseVisible);c.retain(far,8e6,0,releaseFar);
    for(let i=0;i<8;i++)c.retain({},8e6,10,vi.fn());expect(releaseFar).toHaveBeenCalledOnce();expect(releaseVisible).not.toHaveBeenCalled();expect(c.pixels).toBeLessThanOrEqual(MAX_CACHED_PIXELS);
    c.retain(far,8e6,100,releaseFar);c.priority(visible,0);for(let i=0;i<20;i++)c.retain({},100,10,vi.fn());expect(c.size).toBeLessThanOrEqual(MAX_CACHED_PAGES);expect(releaseVisible).toHaveBeenCalledOnce();c.dispose();expect(c.size).toBe(0);expect(c.pixels).toBe(0);expect(releaseFar).toHaveBeenCalledTimes(2);
  });
  it('discards speculative near-page pixels instead of evicting four visible completed pages',()=>{
    const c=new RenderCoordinator(),visible=vi.fn(),near=vi.fn();for(let i=0;i<4;i++)c.retain({},8e6,100,visible);c.retain({},8e6,10,near);
    expect(visible).not.toHaveBeenCalled();expect(near).toHaveBeenCalledOnce();expect(c.pixels).toBe(32e6);c.dispose();expect(visible).toHaveBeenCalledTimes(4);
  });
  it.each([[600,800,1],[600,800,2],[5000,10000,3],[100000,1000,2]])('bounds raster %s × %s at DPR %s and retains aspect ratio', (w,h,dpr)=>{
    const size=rasterSize(w,h,dpr);expect(size.width*size.height).toBeLessThanOrEqual(MAX_PAGE_PIXELS);expect(Math.abs(size.width/size.height-w/h)/(w/h)).toBeLessThan(.02);expect(Math.max(size.width,size.height)).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    if(w===600)expect(size).toEqual({width:w*dpr,height:h*dpr});
  });
});

describe('immutable PDF geometry and multi-layer alignment',()=>{
  it('reads mixed page geometry once and matches native PDF.js viewports across scale, CropBox and both rotations',async()=>{
    const doc=await PDFDocument.create();for(const [w,h,r] of [[600,800,90],[400,300,270]]){const p=doc.addPage([w,h]);p.setCropBox(17,29,w-50,h-60);p.setRotation(degrees(r));}
    const reader=await getDocument({data:await doc.save()}).promise as unknown as PDFDocumentProxy;
    try{const get=vi.spyOn(reader,'getPage'),geometry=await pageGeometry(reader);expect(await pageGeometry(reader)).toBe(geometry);expect(get).toHaveBeenCalledTimes(2);get.mockClear();
      const original=pageViews(geometry,1,0);for(const zoom of [.25,.75,2,4])for(const rotation of [0,90,180,270]){
        const views=pageViews(geometry,zoom,rotation);for(const [i,v] of views.entries()){
          const viewport=geometry[i].viewport.clone({scale:zoom,rotation:(geometry[i].rotation+rotation)%360});expect(v.width).toBe(viewport.width);expect(v.height).toBe(viewport.height);expect(v.matrix).toEqual(pageMatrix(viewport.transform,geometry[i].bounds));
          const point={x:71,y:132},old=transform(original[i].matrix,point),preview=transform(layerTransform(original[i].matrix,v.matrix),old),fresh=transform(v.matrix,point);expect(preview.x).toBeCloseTo(fresh.x);expect(preview.y).toBeCloseTo(fresh.y);
        }
      }expect(get).not.toHaveBeenCalled();
    }finally{await reader.loadingTask.destroy();}
  });
  it('does not keep failed geometry forever and separates PDF identities',async()=>{
    const failing={numPages:1,getPage:vi.fn().mockRejectedValue(new Error('failed'))} as unknown as PDFDocumentProxy;
    await expect(pageGeometry(failing)).rejects.toThrow('failed');await expect(pageGeometry(failing)).rejects.toThrow('failed');expect(failing.getPage).toHaveBeenCalledTimes(2);
    const different={numPages:0} as PDFDocumentProxy;expect(await pageGeometry(different)).toEqual([]);
  });
});

describe('screen-constant pinch gaps and anchor compensation',()=>{
  it.each([false,true])('preserves the anchor and every page gap with horizontal=%s',horizontal=>{
    const sizes=[300,700,450,600],gap=8,index=2,inside=125,position=sizes.slice(0,index).reduce((a,b)=>a+b,0)+index*gap+inside;
    for(const scale of [.25,.6,1,2,4]){
      const adjusted=pinchSpacing(gap,scale,index,horizontal);expect(adjusted.gap*scale).toBeCloseTo(gap);
      const preview=sizes.slice(0,index).reduce((a,b)=>a+b,0)+index*adjusted.gap+inside;
      const translated=position+(preview-position)*scale+(horizontal?adjusted.x:adjusted.y);expect(translated).toBeCloseTo(position);
      expect(horizontal?adjusted.y:adjusted.x).toBe(0);
    }
  });
});
