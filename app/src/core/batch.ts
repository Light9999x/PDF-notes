import { edit, heads, type EditRequest, type NoteDocument } from './model';

export function assertExpected(doc:NoteDocument,changes:EditRequest[]):void {
  for(const change of changes){
    const current=heads(doc,change.id).map(h=>h.id).sort();
    const expected=[...change.expected].sort();
    if(current.length!==expected.length||current.some((id,i)=>id!==expected[i]))
      throw new Error('物件已收到其他修改，這次操作未套用。請重新操作或處理衝突。');
  }
}
// Validate the whole snapshot before constructing any operations. The storage
// transaction checks it again against the latest durable document before writing.
export function editBatch(doc:NoteDocument,changes:EditRequest[],device:string):NoteDocument {
  if(new Set(changes.map(c=>c.id)).size!==changes.length)throw new Error('同一批次不可重複修改同一物件。');
  assertExpected(doc,changes);
  return changes.reduce((next,c)=>edit(next,c.id,c.value,device),doc);
}
