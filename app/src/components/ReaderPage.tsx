import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { highlightRects, type SearchHit, type HighlightRect } from '../core/search';
import { pdfjs } from '../core/pdf';
import type { Matrix } from '../core/geometry';
export type PageView={width:number;height:number;scale?:number;matrix:Matrix;bounds:number[];rotation:number};
export function ReaderPage({reader,number,view,zoom,read,pinned,hits=[],currentHit,children}:{reader:PDFDocumentProxy;number:number;view:PageView;zoom:number;read:boolean;pinned:boolean;hits?:SearchHit[];currentHit?:SearchHit;children:ReactNode}){
  const paper=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),textLayer=useRef<HTMLDivElement>(null);
  const [near,setNear]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const active=near||pinned;
  const divs=useRef<HTMLElement[]>([]),[generation,setGeneration]=useState(0),[rects,setRects]=useState<HighlightRect[]>([]);
  useEffect(()=>{if(!read){const selection=window.getSelection();if(selection?.anchorNode&&textLayer.current?.contains(selection.anchorNode))selection.removeAllRanges();}},[read]);
  const hitKey=JSON.stringify(hits),currentKey=JSON.stringify(currentHit);
  useEffect(()=>{if(!active)return;const next=highlightRects(divs.current,hits,currentHit,paper.current!);setRects(next);},[hitKey,currentKey,generation,active,view]);
  useEffect(()=>{if(!active)return;const frame=requestAnimationFrame(()=>{
    const hit=paper.current?.querySelector('.search-hit.current'),root=paper.current?.closest<HTMLElement>('.page-scroll');if(!hit||!root)return;
    const r=root.getBoundingClientRect(),h=hit.getBoundingClientRect(),cover=parseFloat(getComputedStyle(root).getPropertyValue('--panel-cover'))||0;
    root.scrollLeft+=h.left+h.width/2-r.left-cover-(root.clientWidth-cover)/2;root.scrollTop+=h.top+h.height/2-r.top-root.clientHeight/2;
  });return ()=>cancelAnimationFrame(frame);},[currentKey,generation,active,view]);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>setNear(entries[0].isIntersecting),{root:paper.current!.closest('.page-scroll'),rootMargin:'700px'});observer.observe(paper.current!);return ()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!active)return;let cancelled=false,renderTask:ReturnType<pdfjs.PDFPageProxy['render']>|undefined,layer:pdfjs.TextLayer|undefined,page:pdfjs.PDFPageProxy|undefined;
    setLoading(true);setError('');
    void (async()=>{page=await reader.getPage(number);if(cancelled)return;
      const viewport=page.getViewport({scale:zoom,rotation:view.rotation}),node=canvas.current!,container=textLayer.current!;
      const dpr=Math.min(window.devicePixelRatio||1,2);node.width=Math.ceil(view.width*dpr);node.height=Math.ceil(view.height*dpr);node.style.width=view.width+'px';node.style.height=view.height+'px';
      renderTask=page.render({canvas:node,viewport,transform:[dpr,0,0,dpr,0,0]});await renderTask.promise;if(cancelled)return;
      container.replaceChildren();container.style.setProperty('--scale-factor',String(zoom));container.style.setProperty('--total-scale-factor',String(zoom));
      const content=await page.getTextContent();if(cancelled)return;
      layer=new pdfjs.TextLayer({textContentSource:content,container,viewport});await layer.render();if(!cancelled){divs.current=layer.textDivs;setGeneration(n=>n+1);setLoading(false);}
    })().catch(e=>{if(!cancelled)setError(String(e));});
    return ()=>{divs.current=[];cancelled=true;renderTask?.cancel();layer?.cancel();page?.cleanup();};
  },[active,reader,number,zoom,view]);
  return <div className="paper" ref={paper} data-page={number} style={{width:view.width,height:view.height}}>
    {active&&<><canvas ref={canvas} aria-label={'PDF 第 '+number+' 頁'}/><div ref={textLayer} className="textLayer" data-editing={!read} onDragStart={e=>{if(!read)e.preventDefault();}} style={{pointerEvents:read?'auto':'none',userSelect:read?'text':'none'}}/><div className="search-highlights" aria-hidden="true">{rects.map((r,i)=><div key={i} className={'search-hit'+(r.current?' current':'')} style={{left:r.left,top:r.top,width:r.width,height:r.height}}/>)}</div>{children}{loading&&<div className="page-loading">{error||'正在載入頁面…'}</div>}</>}
  </div>;
}
