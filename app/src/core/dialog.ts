// Native dialogs enforce focus containment/inertness in the browser. This small
// lifecycle wrapper adds a stable initial focus and restores a still-visible
// trigger, including when a responsive drawer becomes a non-modal shelf.
export function activateDialog(node:HTMLDialogElement,options:{open:boolean;modal:boolean;heading:HTMLElement|null;returnFocusSelector?:string}):()=>void {
  const doc=node.ownerDocument,previous=doc.activeElement as HTMLElement|null;
  const visible=(element:HTMLElement|null):element is HTMLElement=>!!element?.isConnected&&typeof element.focus==='function'&&!element.closest('[inert]')&&element.getClientRects().length>0;
  const fallback=()=>options.returnFocusSelector?doc.querySelector<HTMLElement>(options.returnFocusSelector):null;
  if(options.open){
    if(options.modal){node.showModal();options.heading?.focus({preventScroll:true});}
    else {node.show();if(visible(previous))previous.focus({preventScroll:true});}
  }else if(node.contains(doc.activeElement)){const trigger=fallback();if(visible(trigger))trigger.focus({preventScroll:true});}
  return ()=>{
    if(node.open)node.close();
    if(options.open&&options.modal){const target=visible(previous)?previous:fallback();if(visible(target))target.focus({preventScroll:true});}
  };
}
export function dismissDialog(event:{preventDefault:()=>void},dismissible:boolean,onClose?:()=>void){
  event.preventDefault();if(dismissible)onClose?.();
}
