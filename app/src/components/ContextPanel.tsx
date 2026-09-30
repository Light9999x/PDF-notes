import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
// The dock moves as one shell, including its outside toggle. Its button never
// consumes a grid track. Only desktop changes the reader's reserved body width.
export function ContextPanel({open,narrow,contentRef,readerRef,onToggle,onSettled,children}:{open:boolean;narrow:boolean;contentRef:{current:HTMLDivElement|null};readerRef:{current:HTMLDivElement|null};onToggle:()=>void;onSettled:()=>void;children:ReactNode}){
  const [retained,setRetained]=useState(open),button=useRef<HTMLButtonElement>(null),previous=useRef<DOMRect|undefined>(undefined),settled=useRef(onSettled);settled.current=onSettled;
  useLayoutEffect(()=>{
    if(open)setRetained(true);else if(contentRef.current?.contains(document.activeElement))button.current?.focus({preventScroll:true});
    const reader=readerRef.current,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,duration=reduced?0:180;
    const next=reader?.getBoundingClientRect(),old=previous.current;previous.current=next;
    let animation:Animation|undefined;
    if(reader&&!narrow&&old&&next){reader.dataset.panelAnimating='true';animation=reader.animate([{transformOrigin:'0 0',transform:`translateX(${old.left-next.left}px) scaleX(${old.width/next.width})`},{transformOrigin:'0 0',transform:'none'}],{duration,easing:'ease-out'});}
    const timer=setTimeout(()=>{if(!open)setRetained(false);animation?.cancel();if(reader)delete reader.dataset.panelAnimating;if(!narrow)settled.current();},duration);
    return ()=>{clearTimeout(timer);if(reader&&animation)previous.current=reader.getBoundingClientRect();animation?.cancel();if(reader)delete reader.dataset.panelAnimating;};
  },[open,narrow]);
  const dock=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!narrow)return;const viewport=window.visualViewport;
    const update=()=>{const body=readerRef.current?.parentElement?.getBoundingClientRect();if(!body||!dock.current)return;const bottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight);dock.current.style.setProperty('--keyboard-inset',Math.max(0,body.bottom-bottom)+'px');dock.current.style.setProperty('--sheet-available',Math.max(80,Math.min(body.bottom,bottom)-Math.max(body.top,viewport?.offsetTop||0)-44)+'px');};
    update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('resize',update);return ()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[narrow,readerRef]);
  return <div ref={dock} className={'panel-dock'+(open?' open':'')}>
    <aside className="context-panel properties" aria-label="工具與物件面板" hidden={!open&&!retained} inert={!open} aria-hidden={!open}>
      <div id="context-content" ref={contentRef} className="context-content" onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();e.stopPropagation();onToggle();}}}>{children}</div>
    </aside>
    <button ref={button} data-panel-toggle className="panel-toggle" aria-label={open?'收合側面板':'展開側面板'} aria-controls="context-content" aria-expanded={open} onPointerDown={e=>e.preventDefault()} onClick={onToggle}>{narrow?(open?'⌄':'⌃'):(open?'‹':'›')}</button>
  </div>;
}
