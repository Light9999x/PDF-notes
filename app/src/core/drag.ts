export type DragItem={kind:'folder'|'document';id:string};
let active:DragItem|undefined;
let suppressUntil=0;
export function startDrag(e:React.DragEvent,item:DragItem){active=item;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-pdfnote',JSON.stringify(item));}
export function endDrag(){active=undefined;suppressUntil=Date.now()+300;window.dispatchEvent(new Event('pdfnote-drag-end'));}
export function dragged(){return active;}
export function suppressDragClick(){return !!active||Date.now()<suppressUntil;}

window.addEventListener('pointerdown',()=>{suppressUntil=0;},{capture:true});
