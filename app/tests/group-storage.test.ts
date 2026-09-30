import { beforeEach,describe,expect,it,vi } from 'vitest';
import { createBlank } from '../src/core/blank';
import { edit,heads,type Annotation,type NoteDocument } from '../src/core/model';
import { editBatch } from '../src/core/batch';
import { groupingChanges,repairGroupChanges,groupState } from '../src/core/groups';
import { store } from '../src/core/storage';
import { BatchRejectedError } from '../src/core/edit-error';
const disk=vi.hoisted(()=>({current:undefined as unknown,abort:vi.fn(),put:vi.fn()}));
vi.mock('idb',()=>({openDB:()=>Promise.resolve({transaction:()=>({done:Promise.resolve(),abort:disk.abort,objectStore:()=>({get:async()=>disk.current,put:disk.put})})})}));
const value:Annotation={kind:'text',page:1,x:0,y:0,width:20,height:20,color:'#123456',opacity:1,weight:1,text:'text',fontSize:12};
async function fixture(){let d=await createBlank('storage','portrait','A');for(const id of ['a','b','c'])d=edit(d,id,value,'A');return d;}
beforeEach(()=>{disk.abort.mockClear();disk.put.mockClear();});
describe('transaction boundary rechecks before any store writes',()=>{
  it('rejects one changed member even after the batch was successfully constructed',async()=>{const d=await fixture(),changes=groupingChanges(d,['a','b']),staged=editBatch(d,changes,'A');disk.current=edit(d,'b',{...value,text:'new'},'B');await expect(store.save(staged,undefined,changes)).rejects.toBeInstanceOf(BatchRejectedError);expect(disk.abort).toHaveBeenCalledOnce();expect(disk.put).not.toHaveBeenCalled();});
  it('rejects a newly arriving membership claim even if the selected member heads did not change',async()=>{const d=await fixture(),changes=groupingChanges(d,['a','b']),staged=editBatch(d,changes,'A');const latest=edit(d,'c',{...value,group:{id:'other',members:['a','c']}},'B');expect(heads(latest,'a')[0].id).toBe(heads(d,'a')[0].id);disk.current=latest;await expect(store.save(staged,undefined,changes)).rejects.toBeInstanceOf(BatchRejectedError);expect(disk.put).not.toHaveBeenCalled();});
  it('refuses stale group repair when a newly connected membership appeared',async()=>{let d=await fixture();d=edit(d,'a',{...value,group:{id:'broken',members:['a','b']}},'A');const id=groupState(d).issues[0].id,changes=repairGroupChanges(d,id),staged=changes.reduce((next,c)=>edit(next,c.id,c.value,'A'),d);disk.current=edit(d,'c',{...value,group:{id:'another',members:['b','c']}},'B') as NoteDocument;await expect(store.save(staged,undefined,changes,id)).rejects.toBeInstanceOf(BatchRejectedError);expect(disk.put).not.toHaveBeenCalled();});
});
