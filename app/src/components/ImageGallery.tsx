import { galleryHashes } from '../core/gallery';
export { galleryHashes } from '../core/gallery';
import { uprightAt } from '../core/manipulation';
import { annotationTransform, type Matrix } from '../core/geometry';
import { ActionMenu } from './ui';
import { useEffect, useRef, useState } from 'react';
import type { Asset, NoteDocument, Point } from '../core/model';
import { AnnotationShape } from './AnnotationShape';
export function ImageDropPreview({doc,hash,page,point,width,matrix}:{doc:NoteDocument;hash:string;page:number;point:Point;width:number;matrix:Matrix}){
  const [ratio,setRatio]=useState(1),asset=doc.assets[hash];
  useEffect(()=>{let disposed=false;void createImageBitmap(new Blob([new Uint8Array(asset.bytes)],{type:asset.mime})).then(bitmap=>{if(!disposed)setRatio(bitmap.height/bitmap.width);bitmap.close();}).catch(()=>{});return ()=>{disposed=true;};},[asset]);
  const value=uprightAt(point,matrix,{kind:'image',page,x:point.x,y:point.y,width,height:width*ratio,color:'#000000',weight:1,opacity:.5,asset:hash});return <g pointerEvents="none"><AnnotationShape doc={doc} value={value}/><rect transform={annotationTransform(value)} width={width} height={width*ratio} fill="none" stroke="#1b7769"/></g>;
}
function Thumbnail({asset,onPick,onDrag,disabled}:{disabled:boolean;asset:Asset;onPick:(hash:string)=>void;onDrag:(hash:string,phase:'move'|'up'|'cancel',p:Point)=>void}){
  const [url,setUrl]=useState(''),start=useRef<Point|undefined>(undefined),dragged=useRef(false);
  useEffect(()=>{const cancel=(e:Event)=>{if(e.type==='blur'||(e as KeyboardEvent).key==='Escape'){start.current=undefined;}};window.addEventListener('blur',cancel);window.addEventListener('keydown',cancel);return ()=>{window.removeEventListener('blur',cancel);window.removeEventListener('keydown',cancel);};},[]);
  useEffect(()=>{const u=URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)],{type:asset.mime}));setUrl(u);return ()=>URL.revokeObjectURL(u);},[asset]);
  return <button disabled={disabled} aria-label={'放置圖片 '+asset.hash.slice(0,8)} className="gallery-thumb" style={{touchAction:'none'}} onClick={e=>{if(e.detail===0)onPick(asset.hash);}}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);start.current={x:e.clientX,y:e.clientY};dragged.current=false;}}
    onPointerMove={e=>{if(!start.current)return;const p={x:e.clientX,y:e.clientY};if(Math.hypot(p.x-start.current.x,p.y-start.current.y)>5)dragged.current=true;if(dragged.current)onDrag(asset.hash,'move',p);}}
    onPointerUp={e=>{if(!start.current)return;start.current=undefined;if(dragged.current)onDrag(asset.hash,'up',{x:e.clientX,y:e.clientY});else onPick(asset.hash);}}
    onPointerCancel={()=>{start.current=undefined;onDrag(asset.hash,'cancel',{x:0,y:0});}} onLostPointerCapture={()=>{if(start.current){start.current=undefined;onDrag(asset.hash,'cancel',{x:0,y:0});}}}><img src={url} alt="" draggable={false}/></button>;
}
export function ImageGallery({doc,onImport,onPick,onDrag,onRemove,onRestore,onCutout,busy}:{onRemove:(hash:string)=>Promise<void>;onRestore:(hash:string)=>Promise<void>;onCutout:(hash:string)=>void;doc:NoteDocument;onImport:(file:File)=>Promise<void>;onPick:(hash:string)=>void;onDrag:(hash:string,phase:'move'|'up'|'cancel',p:Point)=>void;busy:boolean}){
  const input=useRef<HTMLInputElement>(null),[error,setError]=useState(''),[importing,setImporting]=useState(false),hashes=galleryHashes(doc),[removed,setRemoved]=useState<string>(),[removing,setRemoving]=useState(false);
  async function membership(hash:string,present:boolean){setRemoving(true);setError('');try{if(present){await onRestore(hash);setRemoved(undefined);}else{await onRemove(hash);setRemoved(hash);}}catch(e){setError(String(e));}finally{setRemoving(false);}}
  return <><button disabled={busy||importing||removing} onClick={()=>input.current?.click()}>選取檔案</button><input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){setError('');setImporting(true);void onImport(file).catch(e=>setError(String(e))).finally(()=>setImporting(false));}}}/>{error&&<p role="alert">{error}</p>}{removed&&<p role="status">已從圖片庫移除；頁面圖片仍保留。<button disabled={busy||removing} onClick={()=>void membership(removed,true)}>復原移除</button></p>}{!hashes.length&&<p>匯入 PNG／JPG，拖到頁面或點選後放置。</p>}<div className="gallery-grid">{hashes.map(h=>doc.assets[h]&&<div className="gallery-item" key={h}><Thumbnail disabled={busy||importing||removing} asset={doc.assets[h]} onPick={onPick} onDrag={onDrag}/><ActionMenu label={'圖片素材 '+h.slice(0,8)}><button disabled={busy||removing} onClick={()=>onCutout(h)}>去背副本</button><button disabled={busy||removing} onClick={()=>void membership(h,false)}>從圖片庫移除</button></ActionMenu></div>)}</div></>;
}
