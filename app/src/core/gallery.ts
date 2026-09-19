import { canonical, uid, type NoteDocument } from './model';
export type GalleryOperation={id:string;hash:string;present:boolean;parents:string[];device:string;time:string};
export type GalleryChange={hash:string;present:boolean;parents:string[]};
export function galleryHeads(doc:Pick<NoteDocument,'galleryOps'>,hash:string){
  const ops=(doc.galleryOps||[]).filter(o=>o.hash===hash),superseded=new Set(ops.flatMap(o=>o.parents));
  return ops.filter(o=>!superseded.has(o.id)).sort((a,b)=>a.id.localeCompare(b.id));
}
export function galleryHashes(doc:NoteDocument){
  const hashes=new Set([...(doc.gallery||[]),...doc.operations.flatMap(o=>o.value?.kind==='image'&&o.value.asset?[o.value.asset]:[]),...(doc.galleryOps||[]).map(o=>o.hash)]);
  return [...hashes].filter(hash=>!galleryHeads(doc,hash).some(o=>!o.present));
}
export function galleryChange(doc:NoteDocument,hash:string,present:boolean):GalleryChange{return {hash,present,parents:galleryHeads(doc,hash).map(o=>o.id)};}
export function editGallery(doc:NoteDocument,change:GalleryChange,device:string):NoteDocument {
  if(!doc.assets[change.hash]||!['image/png','image/jpeg'].includes(doc.assets[change.hash].mime))throw new Error('圖片資產遺失或不支援。');
  if(new Set(change.parents).size!==change.parents.length||change.parents.some(id=>!doc.galleryOps?.some(o=>o.id===id&&o.hash===change.hash)))throw new Error('圖片庫版本不完整，請重新操作。');
  return {...doc,format:Math.max(4,doc.format) as NoteDocument['format'],galleryOps:[...(doc.galleryOps||[]),{...change,parents:[...change.parents],id:uid(),device,time:new Date().toISOString()}]};
}
export function mergeGallery(a:GalleryOperation[]=[],b:GalleryOperation[]=[]){
  const result=new Map(a.map(o=>[o.id,o]));for(const op of b){if(result.has(op.id)&&canonical(result.get(op.id))!==canonical(op))throw new Error('圖片庫操作 ID 的內容不一致。');result.set(op.id,op);}
  return [...result.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
export function validateGallery(doc:NoteDocument){
  const fail=()=>{throw new Error('圖片庫會員紀錄不完整或版本不支援。');};
  if(doc.galleryOps===undefined)return;
  if(doc.format<4||!Array.isArray(doc.galleryOps)||doc.galleryOps.length>200000)fail();
  const map=new Map<string,GalleryOperation>(),string=(s:unknown)=>typeof s==='string'&&s.length>0&&s.length<512;
  for(const op of doc.galleryOps){if(!op||!string(op.id)||map.has(op.id)||!string(op.device)||!string(op.time)||typeof op.present!=='boolean'||typeof op.hash!=='string'||!(/^[a-f0-9]{64}$/.test(op.hash))||!Array.isArray(op.parents)||op.parents.some(p=>!string(p))||new Set(op.parents).size!==op.parents.length||!doc.assets[op.hash]||!['image/png','image/jpeg'].includes(doc.assets[op.hash].mime))fail();map.set(op.id,op);}
  const degree=new Map<string,number>(),children=new Map<string,string[]>();
  for(const op of doc.galleryOps){degree.set(op.id,op.parents.length);for(const id of op.parents){if(!map.has(id)||map.get(id)!.hash!==op.hash)fail();const list=children.get(id)||[];list.push(op.id);children.set(id,list);}}
  const queue=[...degree].filter(([,n])=>n===0).map(([id])=>id);let count=0;
  while(queue.length){const id=queue.pop()!;count++;for(const child of children.get(id)||[]){const n=degree.get(child)!-1;degree.set(child,n);if(!n)queue.push(child);}}
  if(count!==map.size)fail();
}
