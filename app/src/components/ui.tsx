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

export function ActionMenu({label,children}:{label:string;children:ReactNode}){
  const ref=useRef<HTMLDetailsElement>(null);
  function close(){if(ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus({preventScroll:true});}}
  return <details ref={ref} className="action-menu" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}}}>
    <summary aria-label={label}>更多</summary><div className="card-menu" onClick={e=>{if((e.target as Element).closest('button'))close();}}><p className="menu-title">{label}</p>{children}</div>
  </details>;
}
