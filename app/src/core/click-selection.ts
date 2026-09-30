import { expandGroups } from './groups';
import type { NoteDocument } from './model';
import { editableObjects, type SelectedObject } from './selection';
export function clickSelection(doc:NoteDocument,before:string[],target:SelectedObject|undefined,shift:boolean,touch=false):string[]{
  const live=editableObjects(doc),prior=before.filter(id=>live.some(o=>o.id===id));
  if(touch&&prior.length)return prior;
  if(!target)return shift?prior:[];
  const current=live.find(o=>o.id===target.id&&o.head===target.head);if(!current)return prior;
  const members=expandGroups(doc,[target.id]);if(!members.length)return prior;
  if(!shift)return members;
  const samePage=prior.filter(id=>live.find(o=>o.id===id)?.value.page===current.value.page);
  return samePage.includes(target.id)?samePage.filter(id=>!members.includes(id)):[...new Set([...samePage,...members])];
}
