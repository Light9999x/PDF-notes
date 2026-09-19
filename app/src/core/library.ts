import { canonical, uid } from './model';
export type LibraryValue = { name: string } | { folderId: string | null } | { parentId: string | null } | null;
export type LibraryOperation = { id:string; entity:string; device:string; time:string; parents:string[]; value:LibraryValue };
export type LibraryState = { format:1|2; kind:'library'; operations:LibraryOperation[] };
export const emptyLibrary = ():LibraryState=>({format:1,kind:'library',operations:[]});
export const folderKey=(id:string)=>'folder:'+id;
export const parentKey=(id:string)=>'parent:'+id;
export const memberKey=(id:string)=>'member:'+id;
export function libraryHeads(state:LibraryState,entity:string):LibraryOperation[] {
  const ops=state.operations.filter(o=>o.entity===entity),superseded=new Set(ops.flatMap(o=>o.parents));
  return ops.filter(o=>!superseded.has(o.id)).sort((a,b)=>a.id.localeCompare(b.id));
}
export function libraryConflicts(state:LibraryState) {
  return [...new Set(state.operations.map(o=>o.entity))].map(entity=>({entity,versions:libraryHeads(state,entity)})).filter(o=>o.versions.length>1);
}
export function libraryEdit(state:LibraryState,entity:string,value:LibraryValue,device:string,resolve=false):LibraryState {
  const prior=libraryHeads(state,entity);
  if(prior.length>1&&!resolve)throw new Error('此分類有衝突，請先到衝突管理選擇版本。');
  return {...state,format:entity.startsWith('parent:')?2:state.format,operations:[...state.operations,{id:uid(),entity,value:structuredClone(value),parents:prior.map(o=>o.id),device,time:new Date().toISOString()}]};
}
export function mergeLibrary(a:LibraryState,b:LibraryState):LibraryState {
  validateLibrary(a);validateLibrary(b);
  const ops=new Map(a.operations.map(o=>[o.id,o]));
  for(const op of b.operations){if(ops.has(op.id)&&canonical(ops.get(op.id))!==canonical(op))throw new Error('分類操作 ID 的內容不一致，已停止合併。');ops.set(op.id,op);}
  return {format:Math.max(a.format,b.format) as 1|2,kind:'library',operations:[...ops.values()].sort((x,y)=>x.id.localeCompare(y.id))};
}
export function folders(state:LibraryState) {
  return [...new Set(state.operations.filter(o=>o.entity.startsWith('folder:')).map(o=>o.entity))].flatMap(entity=>{
    const versions=libraryHeads(state,entity);const names=versions.flatMap(v=>v.value&&'name' in v.value?[v.value.name]:[]);
    if(!names.length)return [];
    return [{id:entity.slice(7),name:versions.length===1?names[0]:names.join(' / '),conflicted:versions.length>1,versions}];
  }).sort((a,b)=>a.name.localeCompare(b.name,'zh-TW')||a.id.localeCompare(b.id));
}
export function classification(state:LibraryState,docId:string):{folderId:string|null;issue:string|null} {
  const versions=libraryHeads(state,memberKey(docId));
  if(versions.length>1)return {folderId:null,issue:'分類有衝突，暫列未分類'};
  const v=versions[0]?.value;const id=v&&'folderId' in v?v.folderId:null;
  if(!id)return {folderId:null,issue:null};
  const folder=libraryHeads(state,folderKey(id));
  if(folder.length!==1||!folder[0].value)return {folderId:null,issue:'資料夾已刪除、尚未同步或有衝突，請重新分類'};
  return {folderId:id,issue:null};
}
export function folderName(state:LibraryState,id:string|null):string {
  if(!id)return '未分類';const all=folders(state),folder=all.find(f=>f.id===id);
  if(!folder)return '已刪除／尚未下載的資料夾（'+id.slice(0,8)+'）';
  return folder.name+(all.some(f=>f.id!==id&&folderParent(state,f.id).parentId===folderParent(state,id).parentId&&f.name.toLocaleLowerCase()===folder.name.toLocaleLowerCase())?' · '+id.slice(0,8):'');
}
export function cleanFolderName(name:string,state:LibraryState,exceptId?:string,parentId?:string|null):string {
  const clean=name.trim();if(!clean||clean.length>100)throw new Error('資料夾名稱請輸入 1 到 100 個字。');
  if(folders(state).some(f=>f.id!==exceptId&&folderParent(state,f.id).parentId===(parentId===undefined?(exceptId?folderParent(state,exceptId).parentId:null):parentId)&&f.versions.some(v=>v.value&&'name' in v.value&&v.value.name.toLocaleLowerCase()===clean.toLocaleLowerCase())))throw new Error('已有同名資料夾，請修改名稱。');
  return clean;
}
export function validateLibrary(state:LibraryState):void {
  const fail=()=>{throw new Error('分類資料格式或版本圖無效。');};
  const str=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<512;
  if(!state||![1,2].includes(state.format)||state.kind!=='library'||!Array.isArray(state.operations)||state.operations.length>200000)fail();
  const map=new Map<string,LibraryOperation>();
  for(const op of state.operations){
    if(!op||!str(op.id)||!str(op.entity)||!str(op.device)||!str(op.time)||!(/^(folder|member|parent):.+$/.test(op.entity))||map.has(op.id)||!Array.isArray(op.parents)||op.parents.some(p=>!str(p))||new Set(op.parents).size!==op.parents.length)fail();
    const v=op.value;
    if(op.entity.startsWith('folder:')){if(v!==null&&(!v||!('name' in v)||typeof v.name!=='string'||!v.name.trim()||v.name!==v.name.trim()||v.name.length>100))fail();}
    else if(op.entity.startsWith('parent:')){if(state.format<2||!v||!('parentId' in v)||(v.parentId!==null&&!str(v.parentId)))fail();}
    else if(!v||!('folderId' in v)||(v.folderId!==null&&!str(v.folderId)))fail();
    map.set(op.id,op);
  }
  const remaining=new Map<string,number>(),children=new Map<string,string[]>();
  for(const op of state.operations){remaining.set(op.id,op.parents.length);for(const parent of op.parents){if(!map.has(parent)||map.get(parent)!.entity!==op.entity)fail();const list=children.get(parent)||[];list.push(op.id);children.set(parent,list);}}
  const queue=[...remaining].filter(([,n])=>n===0).map(([id])=>id);let count=0;
  while(queue.length){const id=queue.pop()!;count++;for(const child of children.get(id)||[]){const n=remaining.get(child)!-1;remaining.set(child,n);if(!n)queue.push(child);}}
  if(count!==map.size)fail();
}

// Parentage is an independent causal register. Missing old registers mean root.
export function folderParent(state:LibraryState,id:string):{parentId:string|null;issue:string|null} {
  const h=libraryHeads(state,parentKey(id));
  if(h.length>1)return {parentId:null,issue:'父層有衝突，暫列根層'};
  const v=h[0]?.value,p=v&&'parentId' in v?v.parentId:null;
  if(!p)return {parentId:null,issue:null};
  const folder=libraryHeads(state,folderKey(p));
  if(folder.length!==1||!folder[0].value)return {parentId:null,issue:'父層已刪除、遺失或有衝突，暫列根層'};
  const seen=new Set([id]);let next:string|null=p;
  while(next){
    if(seen.has(next))return {parentId:null,issue:'資料夾階層循環，請移回根層或選擇其他父層'};
    seen.add(next);const versions=libraryHeads(state,parentKey(next)),value=versions[0]?.value;
    next=versions.length===1&&value&&'parentId' in value?value.parentId:null;
  }
  return {parentId:p,issue:null};
}
export function hierarchyIssues(state:LibraryState){return folders(state).flatMap(f=>{const p=folderParent(state,f.id);return p.issue?[{...f,issue:p.issue}]:[];});}
export function canMoveFolder(state:LibraryState,id:string,target:string|null):void {
  if(!folders(state).some(f=>f.id===id&&!f.conflicted))throw new Error('來源資料夾不存在或有名稱衝突。');
  if(target){
    if(!folders(state).some(f=>f.id===target&&!f.conflicted)||folderParent(state,target).issue)throw new Error('目的資料夾不存在或階層待處理。');
    const seen=new Set<string>();let next:string|null=target;
    while(next){if(next===id||seen.has(next))throw new Error('不能移入自己或子孫資料夾。');seen.add(next);next=folderParent(state,next).parentId;}
  }
  cleanFolderName(folders(state).find(f=>f.id===id)!.name,state,id,target);
}
export function folderTree(state:LibraryState){
  const all=folders(state),out:(ReturnType<typeof folders>[number]&{depth:number;issue:string|null})[]=[];
  const seen=new Set<string>(),parents=new Map(all.map(f=>[f.id,folderParent(state,f.id)]));
  const children=new Map<string|null,typeof all>();for(const f of all){const parent=parents.get(f.id)!.parentId;children.set(parent,[...(children.get(parent)||[]),f]);}
  const stack=(children.get(null)||[]).map(f=>({f,depth:0})).reverse();
  while(stack.length){const {f,depth}=stack.pop()!;if(seen.has(f.id))continue;seen.add(f.id);out.push({...f,depth,issue:parents.get(f.id)!.issue});for(const child of [...(children.get(f.id)||[])].reverse())stack.push({f:child,depth:depth+1});}
  for(const f of all)if(!seen.has(f.id))out.push({...f,depth:0,issue:'階層待處理'});return out;
}
export function folderPath(state:LibraryState,id:string|null):string {
  if(!id)return '未分類';
  const names:string[]=[],seen=new Set<string>();let current:string|null=id;
  while(current&&!seen.has(current)){seen.add(current);names.unshift(folderName(state,current));current=folderParent(state,current).parentId;}
  return names.join(' / ');
}
