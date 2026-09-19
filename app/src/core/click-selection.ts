import type { NoteDocument } from './model';
import { editableObjects, type SelectedObject } from './selection';
export function clickSelection(doc:NoteDocument,before:string[],target:SelectedObject|undefined,shift:boolean):string[]{
  const live=editableObjects(doc),prior=before.filter(id=>live.some(o=>o.id===id));
  if(!target)return shift?prior:[];
  const current=live.find(o=>o.id===target.id&&o.head===target.head);if(!current)return prior;
  if(!shift)return [target.id];
  const samePage=prior.filter(id=>live.find(o=>o.id===id)?.value.page===current.value.page);
  return samePage.includes(target.id)?samePage.filter(id=>id!==target.id):[...samePage,target.id];
}
