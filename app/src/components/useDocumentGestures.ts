import { useEffect, useRef } from 'react';
import { DRAG_SLOP, LONG_PRESS_MS, midpoint, nearestPage, pinchZoom } from '../core/document-gesture';
import type { Point } from '../core/model';
export type PinchAnchor={page:number;x:number;y:number;client:Point};
type Options={zoom:number;tool:string;read:boolean;disabled:boolean;cancel:()=>void;onZoom:(zoom:number,anchor:PinchAnchor)=>void;menu:(point:Point,touch:boolean,probe?:boolean)=>boolean;onActivity:()=>void};
// The reader owns touch-action before pointerdown. Only document layers receive
// a preview transform; PDF rendering receives one zoom update on completion.
export function useDocumentGestures(root:{current:HTMLDivElement|null},options:Options){
  const latest=useRef(options);latest.current=options;
  const active=useRef(false),reset=useRef<()=>void>(()=>{});
  useEffect(()=>{
    const node=root.current;if(!node)return;
    const touches=new Map<number,Point>();let blocked=false,consumed=false,suppressUntil=0,timer:ReturnType<typeof setTimeout>|undefined;
    let single:{id:number;start:Point;last:Point;panning:boolean}|undefined;
    let pinch:{zoom:number;distance:number;center:Point;scale:number;anchor:PinchAnchor;origin:Point}|undefined;
    const stack=()=>node.querySelector<HTMLElement>('.page-stack');
    const stopTimer=()=>{clearTimeout(timer);timer=undefined;};
    const clearPreview=()=>{const el=stack();if(el){el.style.transform='';el.style.transformOrigin='';el.style.willChange='';}};
    const cancel=()=>{stopTimer();clearPreview();pinch=undefined;single=undefined;blocked=touches.size>0;active.current=false;latest.current.cancel();};reset.current=cancel;
    const ignored=(e:PointerEvent)=>e.target instanceof Element&&!!e.target.closest('input,textarea,button,select,[contenteditable],.floating-menu');
    const stop=(e:PointerEvent)=>{e.preventDefault();e.stopImmediatePropagation();};
    const down=(e:PointerEvent)=>{
      if(e.pointerType!=='touch'||ignored(e))return;const p={x:e.clientX,y:e.clientY};touches.set(e.pointerId,p);latest.current.onActivity();
      if(touches.size>2){cancel();stop(e);return;}if(blocked){stop(e);return;}
      if(touches.size===2){
        stopTimer();single=undefined;latest.current.cancel();consumed=false;stop(e);
        if(latest.current.disabled){blocked=true;return;}
        const [a,b]=[...touches.values()],center=midpoint(a,b),el=stack();
        const paper=nearestPage([...node.querySelectorAll<HTMLElement>('.paper')].map(el=>({el,...rect(el)})),center);if(!el||!paper){blocked=true;return;}
        const r=el.getBoundingClientRect();const anchor={page:Number(paper.el.dataset.page),x:(center.x-paper.left)/paper.width,y:(center.y-paper.top)/paper.height,client:center};
        pinch={zoom:latest.current.zoom,distance:Math.hypot(a.x-b.x,a.y-b.y),center,scale:1,anchor,origin:{x:center.x-r.left,y:center.y-r.top}};
        el.style.transformOrigin=`${pinch.origin.x}px ${pinch.origin.y}px`;el.style.willChange='transform';active.current=true;
        // Capture only after the second contact; one-finger native text menus
        // remain available on the PDF text layer in reading/page mode.
        for(const id of touches.keys())try{node.setPointerCapture(id);}catch{/* pointer ended */}return;
      }
      single={id:e.pointerId,start:p,last:p,panning:false};
      if(!latest.current.disabled&&['select','image','read','page'].includes(latest.current.tool)&&!(e.target instanceof Element&&e.target.closest('[data-resize],[data-rotate]'))&&latest.current.menu(p,true,true)){
        timer=setTimeout(()=>{if(!single||touches.size!==1||blocked)return;latest.current.cancel();consumed=latest.current.menu(p,true);if(consumed){suppressUntil=Date.now()+1000;single=undefined;window.getSelection()?.removeAllRanges();}},LONG_PRESS_MS);
      }
    };
    const move=(e:PointerEvent)=>{
      if(!touches.has(e.pointerId))return;const p={x:e.clientX,y:e.clientY};touches.set(e.pointerId,p);
      if(blocked||consumed){stop(e);return;}
      if(pinch){stop(e);const [a,b]=[...touches.values()];if(!a||!b)return;const center=midpoint(a,b);pinch.scale=pinchZoom(pinch.zoom,pinch.distance,a,b)/pinch.zoom;pinch.anchor.client=center;
        const el=stack();if(el)el.style.transform=`translate(${center.x-pinch.center.x}px,${center.y-pinch.center.y}px) scale(${pinch.scale})`;return;}
      if(single?.id===e.pointerId){const distance=Math.hypot(p.x-single.start.x,p.y-single.start.y);if(distance>=DRAG_SLOP)stopTimer();
        if(latest.current.read&&!latest.current.disabled&&(distance>=DRAG_SLOP||single.panning)&&window.getSelection()?.isCollapsed!==false){stop(e);single.panning=true;node.scrollLeft-=p.x-single.last.x;node.scrollTop-=p.y-single.last.y;}
        single.last=p;
      }
    };
    const end=(e:PointerEvent)=>{
      if(!touches.has(e.pointerId))return;stopTimer();touches.delete(e.pointerId);
      if(pinch){stop(e);const final=pinch;pinch=undefined;clearPreview();active.current=false;blocked=true;
        if(e.type==='pointerup')latest.current.onZoom(final.zoom*final.scale,final.anchor);else latest.current.cancel();
      }else if(blocked||consumed||single?.panning)stop(e);
      single=undefined;if(!touches.size){blocked=false;consumed=false;}if(e.type==='pointercancel')latest.current.cancel();
    };
    const lost=(e:PointerEvent)=>{if(touches.has(e.pointerId)&&(!pinch||e.target===node))cancel();};
    const blur=()=>{cancel();touches.clear();blocked=false;consumed=false;};
    const scroll=()=>stopTimer();
    const click=(e:MouseEvent)=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}};
    const context=(e:MouseEvent)=>{if(touches.size===1&&latest.current.menu({x:e.clientX,y:e.clientY},true,true)){e.preventDefault();e.stopImmediatePropagation();stopTimer();latest.current.cancel();consumed=latest.current.menu({x:e.clientX,y:e.clientY},true);suppressUntil=Date.now()+1000;single=undefined;}};
    const newContact=()=>{if(!touches.size)suppressUntil=0;};
    window.addEventListener('pointerdown',newContact,true);window.addEventListener('click',click,true);node.addEventListener('contextmenu',context,true);
    node.addEventListener('pointerdown',down,true);node.addEventListener('pointermove',move,{capture:true,passive:false});
    window.addEventListener('pointerup',end,true);window.addEventListener('pointercancel',end,true);node.addEventListener('lostpointercapture',lost,true);node.addEventListener('scroll',scroll);window.addEventListener('blur',blur);
    return ()=>{blur();window.removeEventListener('pointerdown',newContact,true);window.removeEventListener('click',click,true);node.removeEventListener('contextmenu',context,true);node.removeEventListener('pointerdown',down,true);node.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',end,true);node.removeEventListener('lostpointercapture',lost,true);node.removeEventListener('scroll',scroll);window.removeEventListener('blur',blur);};
  },[root]);
  useEffect(()=>{reset.current();},[options.tool]);
  return active;
}
function rect(el:HTMLElement){const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};}
