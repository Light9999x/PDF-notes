import { slideMotion } from '../core/motion';
import { menuPosition } from '../core/menu-position';
import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { activateDialog, dismissDialog } from '../core/dialog';

type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{busy?:boolean;variant?:'primary'|'secondary'|'quiet'|'danger'};
export function Button({busy=false,variant='secondary',className='',disabled,children,type='button',...props}:ButtonProps){
  return <button {...props} type={type} className={`ui-button ${variant} ${className}`} disabled={disabled||busy} aria-busy={busy||undefined}>{busy?'處理中…':children}</button>;
}
export function IconButton({label,children,...props}:ButtonProps&{label:string}){
  return <Button {...props} className={`icon-button ${props.className||''}`} aria-label={label} title={label}>{children}</Button>;
}
export function Field({label,hint,error,children}:{label:string;hint?:string;error?:string;children:ReactNode}){
  const id=useId(),child=children as ReactElement<{id?:string;'aria-describedby'?:string;'aria-invalid'?:boolean}>,inputId=isValidElement(child)?child.props.id||id:id;
  const control=isValidElement(child)?cloneElement(child,{id:inputId,'aria-describedby':[child.props['aria-describedby'],hint?`${id}-hint`:'',error?`${id}-error`:''].filter(Boolean).join(' ')||undefined,'aria-invalid':error?true:child.props['aria-invalid']}):children;
  return <label className="field" htmlFor={inputId}><span>{label}</span>{control}{hint&&<small id={`${id}-hint`}>{hint}</small>}{error&&<small id={`${id}-error`} role="alert" className="field-error">{error}</small>}</label>;
}
export function StatusBadge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'danger'}){
  return <span className={`status-badge ${tone}`}>{children}</span>;
}
export function EmptyState({title,children,actions}:{title:string;children:ReactNode;actions?:ReactNode}){
  return <div className="empty-state"><h2>{title}</h2><p>{children}</p>{actions&&<div className="empty-actions">{actions}</div>}</div>;
}
export function useMedia(query:string){
  const [matches,setMatches]=useState(()=>typeof window!=='undefined'&&window.matchMedia(query).matches);
  useEffect(()=>{const m=window.matchMedia(query),update=()=>setMatches(m.matches);update();m.addEventListener('change',update);return ()=>m.removeEventListener('change',update);},[query]);
  return matches;
}
// Native showModal supplies top-layer rendering, background inertness and focus
// containment. Non-modal desktop shelves deliberately use show(), not showModal().
type DialogProps={title:string;children:ReactNode;open?:boolean;onClose?:()=>void;dismissible?:boolean;modal?:boolean;portal?:boolean;drawer?:boolean;alert?:boolean;className?:string;returnFocusSelector?:string};
export function Dialog({title,children,open=true,onClose,dismissible=true,modal=true,portal=true,drawer=false,alert=false,className='',returnFocusSelector}:DialogProps){
  const ref=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),id=useId();
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const dismissRef=useRef(dismissible);dismissRef.current=dismissible;
  useLayoutEffect(()=>{
    const node=ref.current;if(!node)return;
    return activateDialog(node,{open,modal,heading:heading.current,returnFocusSelector});
  },[open,modal,returnFocusSelector]);
  // VisualViewport bounds protect scrollable forms when a soft keyboard covers
  // part of the layout viewport. CSS dvh remains the fallback.
  useEffect(()=>{
    const viewport=window.visualViewport;if(!viewport||!modal||!open)return;
    const update=()=>{ref.current?.style.setProperty('--dialog-height',`${viewport.height}px`);ref.current?.style.setProperty('--dialog-top',`${viewport.offsetTop}px`);};
    update();viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);
    return ()=>{viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);ref.current?.style.removeProperty('--dialog-height');ref.current?.style.removeProperty('--dialog-top');};
  },[modal,open]);
  const content=<dialog ref={ref} className={`ui-dialog ${drawer?'drawer':''} ${!modal?'property-shelf':''} ${className}`} role={alert?'alertdialog':'dialog'} aria-modal={modal&&open?true:undefined} aria-labelledby={id} data-modal={modal&&open?'true':'false'}
    onCancel={e=>dismissDialog(e,dismissRef.current,closeRef.current)}
    onKeyDown={e=>{if(modal)e.stopPropagation();if(e.key==='Escape'&&modal)dismissDialog(e,dismissRef.current,closeRef.current);}}>
    <header className="dialog-header"><h2 ref={heading} id={id} tabIndex={-1}>{title}</h2>{modal&&onClose&&<IconButton label={`關閉${title}`} disabled={!dismissible} onClick={onClose}><X size={20}/></IconButton>}</header>
    <div className="dialog-content">{children}</div>
  </dialog>;
  return portal&&typeof document!=='undefined'?createPortal(content,document.body):content;
}
export function Drawer(props:Omit<DialogProps,'drawer'|'portal'>){return <Dialog {...props} drawer portal={false}/>;}

export function Notification({children,error=false,onClose}:{children:ReactNode;error?:boolean;onClose:()=>void}){
  const [target,setTarget]=useState<Element|null>(null),ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const update=()=>setTarget([...document.querySelectorAll('dialog[open][data-modal="true"]')].at(-1)?.querySelector('.dialog-content')||null);
    update();const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','data-modal']});return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{if(target)ref.current?.scrollIntoView({block:'nearest'});},[target,children]);
  const content=<div ref={ref} className={`toast ${error?'error':''}`} role={error?'alert':'status'}><div>{error&&<strong>操作未完成</strong>}<p>{children}</p></div><IconButton label={error?'關閉錯誤':'關閉提示'} onClick={onClose}><X size={20}/></IconButton></div>;
  return target?createPortal(content,target):content;
}

let activeMenu:((restore?:boolean)=>void)|undefined;
export function ActionMenu({label,children,caption='更多'}:{label:string;children:ReactNode;caption?:string}){
  const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false),id=useId();
  const closeRef=useRef<(restore?:boolean)=>void>(()=>{}),present=useSlide(open,menu);
  closeRef.current=(restore=true)=>{setOpen(false);if(restore)trigger.current?.focus({preventScroll:true});};
  useLayoutEffect(()=>{
    if(!open||!present||!menu.current||!trigger.current)return;const node=menu.current,button=trigger.current,supported=typeof node.showPopover==='function',close=(restore=true)=>{if(!restore&&supported&&node.matches(':popover-open'))node.hidePopover();closeRef.current(restore);};activeMenu?.(false);activeMenu=close;
    if(supported&&!node.matches(':popover-open'))node.showPopover();
    const position=()=>{const v=window.visualViewport,r=button.getBoundingClientRect(),css=getComputedStyle(node),safe=(side:string)=>parseFloat(css.getPropertyValue('--menu-safe-'+side))||0,box={left:(v?.offsetLeft||0)+safe('left'),top:(v?.offsetTop||0)+safe('top'),width:(v?.width||window.innerWidth)-safe('left')-safe('right'),height:(v?.height||window.innerHeight)-safe('top')-safe('bottom')};
      if(r.bottom<box.top||r.top>box.top+box.height||r.right<box.left||r.left>box.left+box.width){close(false);return;}
      const p=menuPosition(r,box,node.scrollHeight);Object.assign(node.style,{left:p.left+'px',top:p.top+'px',width:p.width+'px',maxHeight:p.maxHeight+'px'});
    };position();const buttons=()=>[...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];buttons()[0]?.focus({preventScroll:true});
    const outside=(e:PointerEvent)=>{if(!node.contains(e.target as Node)&&!button.contains(e.target as Node))close(false);};
    const toggle=(e:Event)=>{if((e as ToggleEvent).newState==='closed')close(node.contains(document.activeElement));};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const list=buttons(),index=list.indexOf(document.activeElement as HTMLButtonElement),next=e.key==='Home'?0:e.key==='End'?list.length-1:(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length;list[next]?.focus();}else if(e.key==='Tab'){e.preventDefault();close();if(!e.shiftKey){const all=[...document.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex="0"]')].filter(el=>!node.contains(el)&&!el.closest('[inert]')&&el.getClientRects().length&&!el.hasAttribute('disabled'));all[all.indexOf(button)+1]?.focus();}}};
    document.addEventListener('pointerdown',outside,true);node.addEventListener('keydown',key);node.addEventListener('toggle',toggle);window.addEventListener('scroll',position,true);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
    const observer=new ResizeObserver(position);observer.observe(button);observer.observe(node);
    return ()=>{if(activeMenu===close)activeMenu=undefined;observer.disconnect();document.removeEventListener('pointerdown',outside,true);node.removeEventListener('keydown',key);node.removeEventListener('toggle',toggle);window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position);};
  },[open,present]);
  const content=present?<div ref={menu} id={id} popover="manual" inert={!open} aria-hidden={!open} className="card-menu floating-menu" role="group" aria-label={label} onClick={e=>{if((e.target as Element).closest('button'))closeRef.current();}}><p className="menu-title">{label}</p>{children}</div>:null;
  const host=trigger.current?.closest('dialog')||(typeof document!=='undefined'?document.body:null);
  return <span className="action-menu"><button type="button" ref={trigger} className="menu-trigger" aria-expanded={open} aria-controls={id} aria-label={label} onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);}}}>{caption}</button>{host&&content?createPortal(content,host):null}</span>;
}

export function useSlide(open:boolean,ref:{current:HTMLElement|null},direction:'x'|'y'='y'){
  const [retained,setRetained]=useState(open),initial=useRef(true);const present=open||retained;
  useLayoutEffect(()=>{
    const first=initial.current;initial.current=false;const node=ref.current;
    if(open)setRetained(true);
    if(!node)return;
    const reduced=first||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transform=direction==='x'?`translateX(-${Math.max(24,node.getBoundingClientRect().width)}px)`:'translateY(-12px)';
    return slideMotion(node,open,transform,reduced,()=>{if(!open)setRetained(false);});
  },[open,direction]);
  return present;
}
export function SlideRegion({open,children,id,className='',returnFocus}:{open:boolean;children:ReactNode;id?:string;className?:string;returnFocus?:()=>void}){
  const ref=useRef<HTMLDivElement>(null),present=useSlide(open,ref);
  useLayoutEffect(()=>{if(!open&&ref.current?.contains(document.activeElement))returnFocus?.();},[open]);
  return <div ref={ref} id={id} className={className} hidden={!present} inert={!open} aria-hidden={!open}>{children}</div>;
}
export function Disclosure({title,children,className=''}:{title:string;children:ReactNode;className?:string}){
  const [open,setOpen]=useState(false),button=useRef<HTMLButtonElement>(null),id=useId();
  return <div className={'disclosure '+className}><button ref={button} className="disclosure-trigger" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>{title}</button><SlideRegion open={open} id={id} returnFocus={()=>button.current?.focus()}>{children}</SlideRegion></div>;
}
