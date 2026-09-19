import { objects, type Annotation, type EditRequest, type NoteDocument, type Operation } from './model';
import { editableObjects, type SelectedObject } from './selection';
export type LayerAction='up'|'down'|'top'|'bottom';
export const layerLabels:Record<LayerAction,string>={up:'往上一層',down:'往下一層',top:'移到最上層',bottom:'移到最下層'};
export function compareLayers(a:{id:string;value:Annotation},b:{id:string;value:Annotation}){return (a.value.layer??0)-(b.value.layer??0)||a.id.localeCompare(b.id);}
export function orderedAnnotations(doc:NoteDocument,page?:number,candidate?:Operation){
  return objects(doc).flatMap(o=>{const op=candidate?.objectId===o.id?candidate:o.versions.length===1?o.versions[0]:undefined;return op?.value&&op.value.kind!=='document'&&(page===undefined||op.value.page===page)?[{id:o.id,value:op.value}]:[];}).sort(compareLayers);
}
export function nextLayer(doc:NoteDocument,page:number){
  const max=objects(doc).flatMap(o=>o.versions).reduce((n,o)=>o.value&&o.value.kind!=='document'&&o.value.page===page?Math.max(n,o.value.layer??0):n,0);
  if(max>=1e12)throw new Error('圖層數值已達上限，請先調整此頁圖層。');return max+1;
}
export function layerChanges(doc:NoteDocument,selection:SelectedObject[],action:LayerAction):EditRequest[]{
  if(!selection.length)return [];const page=selection[0].value.page;
  const current=editableObjects(doc).filter(o=>o.value.page===page).sort(compareLayers),selected=new Set(selection.map(o=>o.id));
  if(selection.some(o=>o.value.page!==page||!current.some(c=>c.id===o.id&&c.head===o.head)))throw new Error('選取版本已改變，請重新選取。');
  const next=[...current];
  if(action==='top'||action==='bottom'){const chosen=next.filter(o=>selected.has(o.id)),rest=next.filter(o=>!selected.has(o.id));next.splice(0,next.length,...(action==='top'?[...rest,...chosen]:[...chosen,...rest]));}
  else if(action==='up'){for(let i=next.length-2;i>=0;i--)if(selected.has(next[i].id)&&!selected.has(next[i+1].id))[next[i],next[i+1]]=[next[i+1],next[i]];}
  else for(let i=1;i<next.length;i++)if(selected.has(next[i].id)&&!selected.has(next[i-1].id))[next[i],next[i-1]]=[next[i-1],next[i]];
  if(next.every((o,i)=>o.id===current[i].id))return [];
  // Normalize only on an explicit reorder. All affected versions form one batch;
  // overlapping offline reorders remain ordinary object conflicts.
  return next.flatMap((o,i)=>(o.value.layer??0)===i+1?[]:[{id:o.id,value:{...o.value,layer:i+1},expected:[o.head]}]);
}
