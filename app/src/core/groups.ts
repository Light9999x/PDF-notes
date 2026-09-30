import { canonical, heads, objects, uid, type Annotation, type EditRequest, type NoteDocument } from './model';

// The same immutable membership descriptor is saved on every member. A merge
// retains all object heads; a partial/concurrent membership is never inferred.
export type Membership={id:string;members:string[]};
export function groupState(doc:NoteDocument){
  const current=new Map(objects(doc).map(o=>[o.id,o.versions]));
  const claims=new Map<string,{members:Set<string>;descriptors:Set<string>}>();
  for(const [id,versions] of current)for(const op of versions){const v=op.value;if(!v||v.kind==='document'||!v.group)continue;
    const g=claims.get(v.group.id)||{members:new Set<string>(),descriptors:new Set<string>()};
    g.members.add(id);v.group.members.forEach(m=>g.members.add(m));g.descriptors.add(canonical(v.group));claims.set(v.group.id,g);
  }
  const issues:{id:string;members:string[];reason:string}[]=[],groups=new Map<string,string[]>();
  for(const [id,claim] of claims){const members=[...claim.members].sort();let page:number|undefined;
    const valid=claim.descriptors.size===1&&members.every(member=>{const h=current.get(member),v=h?.[0]?.value;
      if(h?.length!==1||!v||v.kind==='document'||v.group?.id!==id||canonical(v.group.members)!==canonical(members))return false;
      page??=v.page;return v.page===page;
    });
    if(valid)groups.set(id,members);else issues.push({id,members,reason:'群組成員版本不一致、遺失或有衝突；整組暫停編輯。請先處理物件版本，再解除不一致的群組。'});
  }
  const blocked=new Set(issues.flatMap(g=>g.members));
  let changed=true;while(changed){changed=false;for(const [id,members] of groups)if(members.some(m=>blocked.has(m))){groups.delete(id);members.forEach(m=>blocked.add(m));issues.push({id,members,reason:'與不一致的群組共用成員；請先處理成員版本與群組關係。'});changed=true;}}
  return {groups,issues,blocked};
}
export function expandGroups(doc:NoteDocument,ids:string[]):string[]{
  const {groups,blocked}=groupState(doc),result=new Set<string>();
  for(const id of ids){if(blocked.has(id))continue;const h=heads(doc,id),v=h[0]?.value;if(h.length!==1||!v||v.kind==='document')continue;
    for(const member of v.group?groups.get(v.group.id)||[]:[id])result.add(member);
  }
  return [...result];
}
export function groupingChanges(doc:NoteDocument,ids:string[],ungroup=false):EditRequest[]{
  const members=expandGroups(doc,ids).sort();if(ids.some(id=>!members.includes(id)))throw new Error('群組有衝突，請先到衝突管理處理。');
  if(members.length>10000)throw new Error('單一群組上限為 10,000 個物件。');
  const selected=members.map(id=>({id,op:heads(doc,id)[0]}));
  if(!selected.length||!ungroup&&selected.length<2)return [];
  const values=selected.map(o=>o.op.value as Annotation);
  if(new Set(values.map(v=>v.page)).size!==1)throw new Error('只能群組同一頁的物件。');
  if(!ungroup&&values.every(v=>v.group?.id===values[0].group?.id)&&values[0].group)return [];
  const group:Membership|undefined=ungroup?undefined:{id:uid(),members};
  return selected.filter((_,i)=>!ungroup||values[i].group).map(({id,op})=>{const value={...op.value as Annotation};delete value.group;if(group)value.group=group;return {id,expected:[op.id],value};});
}
// Callers include unchanged members as guards, so storage rechecks every head
// inside its transaction and undo/redo has one complete snapshot.
export function completeGroupBatch(doc:NoteDocument,changes:EditRequest[]):EditRequest[]{
  const result=new Map(changes.map(c=>[c.id,c]));const state=groupState(doc);
  for(const change of changes){if(state.blocked.has(change.id))throw new Error('群組有衝突，整組操作已取消。請先到衝突管理處理。');
    const old=heads(doc,change.id)[0]?.value;
    for(const v of [old,change.value])if(v&&v.kind!=='document'&&v.group)for(const id of v.group.members)if(!result.has(id)){
      const h=heads(doc,id);if(h.length!==1||!h[0].value)throw new Error('群組成員已改變，整組操作已取消。');result.set(id,{id,value:h[0].value,expected:[h[0].id]});
    }
  }
  return [...result.values()];
}
export function assertGroupBatch(doc:NoteDocument,changes:EditRequest[]){
  const complete=completeGroupBatch(doc,changes);
  if(complete.length!==changes.length)throw new Error('群組操作缺少成員版本，整組操作已取消。');
}
export function repairGroupChanges(doc:NoteDocument,groupId:string):EditRequest[]{
  const state=groupState(doc),issue=state.issues.find(g=>g.id===groupId);if(!issue)return [];
  // Resolve connected inconsistent groups together; never drop a competing
  // claim from an object that still has multiple causal heads.
  const ids=new Set(issue.members);let size=0;
  while(size!==ids.size){size=ids.size;for(const g of state.issues)if(g.members.some(id=>ids.has(id)))g.members.forEach(id=>ids.add(id));}
  const result:EditRequest[]=[];
  for(const id of ids){const h=heads(doc,id);if(h.length>1)throw new Error('請先逐一選擇成員的衝突版本，再解除群組關係。');const value=h[0]?.value;
    if(value&&value.kind!=='document'){const next={...value};delete next.group;result.push({id,value:next,expected:h.map(o=>o.id)});}
    else result.push({id,value:null,expected:h.map(o=>o.id)});
  }
  return result;
}
