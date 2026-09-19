import { mergeGallery, validateGallery, type GalleryOperation } from './gallery';
import { assetEntries, MAX_DOCUMENT_BYTES } from './untrusted';
export type Point = { x: number; y: number; pressure?: number };
export type Annotation = {
  kind: 'pen' | 'highlight' | 'text' | 'image'; page: number;
  x: number; y: number; width: number; height: number;
  color: string; weight: number; opacity: number; points?: Point[];
  text?: string; fontSize?: number; asset?: string;
  writingMode?: 'horizontal-tb' | 'vertical-rl'; angle?: number; layer?: number;
};
export type DocValue = { kind: 'document'; name: string };
export type Value = Annotation | DocValue | null;
export type EditRequest={id:string;value:Value;expected:string[]};
export type Operation = { id: string; objectId: string; device: string; time: string; parents: string[]; value: Value };
export type Asset = { hash: string; mime: string; bytes: Uint8Array };
export type NoteDocument = {
  format: 1 | 2 | 3 | 4 | 5; galleryOps?:GalleryOperation[]; gallery?: string[]; id: string; originalName: string; originalHash: string; pdfHash: string;
  pageCount: number; created: string; operations: Operation[]; assets: Record<string, Asset>; origin?: 'blank';
};
export const META = '$document';
export const uid = () => crypto.randomUUID();
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function heads(doc: NoteDocument, objectId: string): Operation[] {
  const ops = doc.operations.filter(o => o.objectId === objectId);
  const superseded = new Set(ops.flatMap(o => o.parents));
  return ops.filter(o => !superseded.has(o.id)).sort((a,b)=>a.id.localeCompare(b.id));
}
export function objects(doc: NoteDocument) {
  return [...new Set(doc.operations.map(o => o.objectId))].map(id => ({id, versions: heads(doc,id)}));
}
export function conflicts(doc: NoteDocument) { return objects(doc).filter(o => o.versions.length > 1); }
export function nameOf(doc: NoteDocument): string {
  const versions = heads(doc,META);
  return versions.length===1 && versions[0].value?.kind==='document' ? versions[0].value.name : doc.originalName;
}
export function deleted(doc: NoteDocument) { const h=heads(doc,META); return h.length===1 && h[0].value===null; }
export function edit(doc: NoteDocument, objectId: string, value: Value, device: string, resolve = false): NoteDocument {
  const prior = heads(doc,objectId);
  if (prior.length > 1 && !resolve) throw new Error('請先在衝突管理中選擇此物件的版本。');
  const op: Operation = {id:uid(), objectId, device, time:new Date().toISOString(), parents:prior.map(o=>o.id), value:structuredClone(value)};
  return {...doc,format:Math.max(doc.format,value&&value.kind!=='document'&&value.layer!==undefined?5:1,value&&value.kind!=='document'&&value.kind!=='text'&&value.angle!==undefined?3:value?.kind==='text'&&(value.angle!==undefined||value.writingMode!==undefined)?2:1) as 1|2|3|4|5,operations:[...doc.operations,op]};
}
export function merge(a: NoteDocument, b: NoteDocument): NoteDocument {
  if(a.id!==b.id || a.pdfHash!==b.pdfHash || a.originalHash!==b.originalHash || a.pageCount!==b.pageCount) throw new Error('文件 ID 或基底 PDF 不相容，請建立副本。');
  const ops = new Map(a.operations.map(o=>[o.id,o]));
  for(const op of b.operations) {
    if(ops.has(op.id) && canonical(ops.get(op.id))!==canonical(op)) throw new Error('操作 ID 的內容不一致，已停止合併。');
    ops.set(op.id,op);
  }
  return {...a, format:Math.max(a.format,b.format) as 1|2|3|4|5, ...(a.galleryOps||b.galleryOps?{galleryOps:mergeGallery(a.galleryOps,b.galleryOps)}:{}), ...(a.gallery||b.gallery?{gallery:[...new Set([...(a.gallery||[]),...(b.gallery||[])])].sort()}:{}), ...(a.origin||b.origin?{origin:a.origin||b.origin}:{}), operations:[...ops.values()].sort((x,y)=>x.id.localeCompare(y.id)),assets:{...a.assets,...b.assets}};
}
export function duplicate(doc: NoteDocument): NoteDocument { return {...structuredClone(doc),id:uid(),created:new Date().toISOString()}; }
export async function addAsset(bytes: Uint8Array,mime: string): Promise<Asset> { return {hash:await sha256(bytes),mime,bytes}; }

// Validate untrusted archives / remote data BEFORE committing it to local storage.
export async function validate(doc: NoteDocument): Promise<void> {
  const fail=()=>{throw new Error('存檔內容不完整、格式不支援或完整性檢查失敗。');};
  const string=(s:unknown):s is string=>typeof s==='string' && s.length>0 && s.length<512;
  const hash=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
  if(doc?.origin!==undefined&&doc.origin!=='blank')fail();
  if(!doc || ![1,2,3,4,5].includes(doc.format) || !string(doc.id) || !string(doc.originalName) || !string(doc.created) || !hash(doc.pdfHash) || !hash(doc.originalHash) || !Number.isInteger(doc.pageCount) || doc.pageCount<1 || doc.pageCount>10000 || !Array.isArray(doc.operations) || doc.operations.length>200000 || !doc.assets) fail();
  assetEntries(doc.assets);let assetBytes=0;
  for(const [key,asset] of Object.entries(doc.assets)) {
    assetBytes+=asset.bytes?.byteLength||0;if(assetBytes>MAX_DOCUMENT_BYTES)fail();
    if(!hash(key) || asset.hash!==key || !(asset.bytes instanceof Uint8Array) || !string(asset.mime) || await sha256(asset.bytes)!==key) fail();
  }
  if(!doc.assets[doc.pdfHash] || !doc.assets[doc.originalHash]) fail();
  if(doc.gallery!==undefined&&(doc.format<3||!Array.isArray(doc.gallery)||doc.gallery.length>200000||new Set(doc.gallery).size!==doc.gallery.length||doc.gallery.some(h=>!hash(h)||!doc.assets[h]||!['image/png','image/jpeg'].includes(doc.assets[h].mime))))fail();
  validateGallery(doc);
  const ids=new Map<string,Operation>();
  const finite=(n:unknown)=>typeof n==='number' && Number.isFinite(n) && Math.abs(n)<1e7;
  for(const op of doc.operations) {
    if(!op || !string(op.id) || !string(op.objectId) || !string(op.device) || !string(op.time) || ids.has(op.id) || !Array.isArray(op.parents) || op.parents.some(p=>!string(p)) || new Set(op.parents).size!==op.parents.length) fail();
    ids.set(op.id,op);
    const v=op.value;
    if(v===null) continue;
    if(!v || typeof v!=='object') fail();
    if(op.objectId===META) {if(v.kind!=='document' || !string((v as DocValue).name)) fail();continue;}
    if(!['pen','highlight','text','image'].includes(v.kind)) fail();
    const a=v as Annotation;
    if(!Number.isInteger(a.page) || a.page<1 || a.page>doc.pageCount || ![a.x,a.y,a.width,a.height,a.weight,a.opacity].every(finite) || a.width<=0 || a.height<=0 || a.weight<=0 || a.opacity<0 || a.opacity>1 || !/^#[a-fA-F0-9]{6}$/.test(a.color)) fail();
    if(a.writingMode!==undefined&&(!['horizontal-tb','vertical-rl'].includes(a.writingMode)||a.kind!=='text'||doc.format<2))fail();
    if(a.layer!==undefined&&(doc.format<5||!Number.isSafeInteger(a.layer)||Math.abs(a.layer)>1e12))fail();
    if(a.angle!==undefined&&(!finite(a.angle)||doc.format<(a.kind==='text'?2:3)))fail();
    if(a.kind==='image' && (!a.asset || !doc.assets[a.asset] || !['image/png','image/jpeg'].includes(doc.assets[a.asset].mime))) fail();
    if(a.kind==='text' && (typeof a.text!=='string' || a.text.length>100000 || !finite(a.fontSize) || a.fontSize!<=0)) fail();
    if((a.kind==='pen'||a.kind==='highlight') && (!Array.isArray(a.points) || a.points.length<1 || a.points.length>200000 || a.points.some(p=>!finite(p.x)||!finite(p.y)))) fail();
  }
  if(!doc.operations.some(o=>o.objectId===META)) fail();
  const children=new Map<string,string[]>(); const indegree=new Map<string,number>();
  for(const op of doc.operations) {
    indegree.set(op.id,op.parents.length);
    for(const parent of op.parents) {
      if(!ids.has(parent) || ids.get(parent)!.objectId!==op.objectId) fail();
      const list=children.get(parent)||[];list.push(op.id);children.set(parent,list);
    }
  }
  const queue=[...indegree].filter(([,n])=>n===0).map(([id])=>id); let visited=0;
  while(queue.length) {const id=queue.pop()!;visited++;for(const child of children.get(id)||[]) {const n=indegree.get(child)!-1;indegree.set(child,n);if(!n)queue.push(child);}}
  if(visited!==doc.operations.length) fail();
}
