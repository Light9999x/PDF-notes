import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { highlightRects, type SearchHit, type HighlightRect } from '../core/search';
import { pdfjs } from '../core/pdf';
import { layerTransform, type PageView } from '../core/page-geometry';
import { LatestFrame, RenderCoordinator, abortError, rasterSize } from '../core/render-coordinator';
export type { PageView } from '../core/page-geometry';
type Frame={node:HTMLDivElement;canvas:HTMLCanvasElement;text:HTMLDivElement;divs:HTMLElement[];view:PageView;key:string};
function releaseFrame(frame:Frame){frame.node.remove();frame.canvas.width=0;frame.canvas.height=0;frame.divs.length=0;frame.node.replaceChildren();}
export function ReaderPage({reader,number,view,zoom,read,pinned,coordinator,hits=[],currentHit,children}:{reader:PDFDocumentProxy;number:number;view:PageView;zoom:number;read:boolean;pinned:boolean;coordinator:RenderCoordinator;hits?:SearchHit[];currentHit?:SearchHit;children:ReactNode}){
  const paper=useRef<HTMLDivElement>(null),host=useRef<HTMLDivElement>(null),owner=useRef({});
  const latest=useRef({view,read});latest.current={view,read};
  const [near,setNear]=useState(false),[visible,setVisible]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
  const [generation,setGeneration]=useState(0),[rects,setRects]=useState<HighlightRect[]>([]),[dpr,setDpr]=useState(()=>Math.min(window.devicePixelRatio||1,2));
  const frames=useRef(new LatestFrame<Frame>(releaseFrame));const active=near||pinned,priority=visible?100:pinned?90:10;
  const priorityRef=useRef(priority);priorityRef.current=priority;
  const dimensions=rasterSize(view.width,view.height,dpr),key=[number,view.rotation,zoom,dimensions.width,dimensions.height].join(':');
  const hitKey=JSON.stringify(hits),currentKey=JSON.stringify(currentHit),centeredHit=useRef<string|undefined>(undefined);
  function align(frame:Frame){frame.node.style.transform=`matrix(${layerTransform(frame.view.matrix,latest.current.view.matrix).join(',')})`;frame.text.dataset.editing=String(!latest.current.read);frame.text.style.pointerEvents=latest.current.read?'auto':'none';frame.text.style.userSelect=latest.current.read?'text':'none';}
  useLayoutEffect(()=>{const frame=frames.current.current;if(frame)align(frame);},[view,read,generation]);
  useEffect(()=>{if(!read){const selection=window.getSelection();if(selection?.anchorNode&&host.current?.contains(selection.anchorNode))selection.removeAllRanges();}},[read]);
  useEffect(()=>{const update=()=>setDpr(Math.min(window.devicePixelRatio||1,2));window.addEventListener('resize',update);return ()=>window.removeEventListener('resize',update);},[]);
  useEffect(()=>{
    const root=paper.current!.closest('.page-scroll');
    const nearby=new IntersectionObserver(entries=>setNear(entries[0].isIntersecting),{root,rootMargin:'500px'}),onscreen=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{root});
    nearby.observe(paper.current!);onscreen.observe(paper.current!);return ()=>{nearby.disconnect();onscreen.disconnect();};
  },[]);
  useEffect(()=>{coordinator.priority(owner.current,active?priority:0);},[coordinator,priority,active,generation]);
  useLayoutEffect(()=>{
    const node=paper.current,frame=frames.current.current;if(!node||!frame){setRects([]);return;}
    // DOM Range is measured after the old text layer has received the latest
    // display transform. Normalize screen pixels (including pinch preview) back
    // into current paper CSS coordinates before drawing the overlay.
    const r=node.getBoundingClientRect(),sx=view.width/r.width,sy=view.height/r.height;
    setRects(highlightRects(frame.divs,hits,currentHit,node).map(h=>({...h,left:h.left*sx,top:h.top*sy,width:h.width*sx,height:h.height*sy})));
  },[hitKey,currentKey,generation,view]);
  useEffect(()=>{if(!currentHit){centeredHit.current=undefined;return;}if(!active||centeredHit.current===currentKey)return;
    const task=requestAnimationFrame(()=>{const hit=paper.current?.querySelector('.search-hit.current'),root=paper.current?.closest<HTMLElement>('.page-scroll');if(!hit||!root)return;centeredHit.current=currentKey;const r=root.getBoundingClientRect(),h=hit.getBoundingClientRect();root.scrollLeft+=h.left+h.width/2-r.left-root.clientWidth/2;root.scrollTop+=h.top+h.height/2-r.top-root.clientHeight/2;});return ()=>cancelAnimationFrame(task);
  },[currentKey,active,rects]);
  useLayoutEffect(()=>{
    if(!active){frames.current.cancel();setBusy(false);return;}
    if(frames.current.current?.key===key){setBusy(false);setError('');return;}
    setBusy(true);setError('');
    void frames.current.render(signal=>coordinator.schedule(priority,signal,async signal=>{
      let frame:Frame|undefined,renderTask:ReturnType<pdfjs.PDFPageProxy['render']>|undefined,layer:pdfjs.TextLayer|undefined;
      const cancel=()=>{renderTask?.cancel();layer?.cancel();};signal.addEventListener('abort',cancel,{once:true});
      try{
        const page=await reader.getPage(number);if(signal.aborted)throw abortError();
        const viewport=page.getViewport({scale:zoom,rotation:view.rotation}),canvas=document.createElement('canvas'),node=document.createElement('div'),text=document.createElement('div');
        node.className='pdf-completed-layer';Object.assign(node.style,{width:view.width+'px',height:view.height+'px'});text.className='textLayer';canvas.setAttribute('aria-label','PDF 第 '+number+' 頁');
        canvas.width=dimensions.width;canvas.height=dimensions.height;canvas.style.width=view.width+'px';canvas.style.height=view.height+'px';node.append(canvas,text);frame={node,canvas,text,divs:[],view,key};
        renderTask=page.render({canvas,viewport,transform:[dimensions.width/view.width,0,0,dimensions.height/view.height,0,0]});await renderTask.promise;if(signal.aborted)throw abortError();
        text.style.setProperty('--scale-factor',String(zoom));text.style.setProperty('--total-scale-factor',String(zoom));
        const content=await page.getTextContent();if(signal.aborted)throw abortError();layer=new pdfjs.TextLayer({textContentSource:content,container:text,viewport});await layer.render();if(signal.aborted)throw abortError();frame.divs=layer.textDivs;return frame;
      }catch(reason){if(frame)releaseFrame(frame);throw reason;}finally{signal.removeEventListener('abort',cancel);}
    }),frame=>{
      align(frame);host.current?.replaceChildren(frame.node);setBusy(false);setError('');setGeneration(v=>v+1);
      coordinator.retain(owner.current,frame.canvas.width*frame.canvas.height,priorityRef.current,()=>{frames.current.clear();setBusy(false);setRects([]);setGeneration(v=>v+1);});
    },reason=>{setBusy(false);setError(reason instanceof Error?reason.message:String(reason));});
    return ()=>frames.current.cancel();
  },[reader,number,key,active,visible,retry,coordinator]);
  useLayoutEffect(()=>()=>{coordinator.forget(owner.current);frames.current.clear();},[reader,coordinator]);
  const completed=!!frames.current.current;
  return <div className="paper" ref={paper} data-page={number} data-render-state={error?'error':completed?'ready':busy?'initial':'idle'} style={{width:view.width,height:view.height}}>
    <div ref={host} className="pdf-bitmap-host" onDragStart={e=>{if(!read)e.preventDefault();}}/>
    <div className="search-highlights" aria-hidden="true">{rects.map((r,i)=><div key={i} className={'search-hit'+(r.current?' current':'')} style={{left:r.left,top:r.top,width:r.width,height:r.height}}/>)}</div>
    {active&&children}
    {error?<div className="page-render-error" role="alert">{completed?'清晰畫面更新失敗，仍顯示前次畫面。':'頁面載入失敗。'}<details><summary>錯誤詳情</summary>{error}</details><button onClick={()=>setRetry(v=>v+1)}>重試頁面</button></div>:!completed&&active&&<div className="page-loading" role="status">{busy?'正在載入頁面…':<button onClick={()=>setRetry(v=>v+1)}>載入此頁</button>}</div>}
  </div>;
}
