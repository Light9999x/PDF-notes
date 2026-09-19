import { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from './ui';
import { checkPixelBudget, imageDimensions, MaskHistory, maskPixels, pixelPoint, type MaskAction } from '../core/cutout';
import { runMask } from '../core/cutout-runner';
import type { Asset, Point } from '../core/model';

type Source={width:number;height:number;rgba:Uint8ClampedArray};
export function ImageCutout({asset,instance,onApply,onClose}:{asset:Asset;instance:boolean;onApply:(bytes:Uint8Array)=>Promise<void>;onClose:()=>void}){
  const [source,setSource]=useState<Source>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[progress,setProgress]=useState(0),[revision,setRevision]=useState(0);
  const [mode,setMode]=useState<'remove'|'keep'|'color'|'pan'>('remove'),[shape,setShape]=useState<'box'|'lasso'>('box'),[tolerance,setTolerance]=useState(24),[global,setGlobal]=useState(false),[zoom,setZoom]=useState(100),[fitWidth,setFitWidth]=useState(600),[path,setPath]=useState<Point[]>([]);
  const canvas=useRef<HTMLCanvasElement>(null),viewport=useRef<HTMLDivElement>(null),history=useRef<MaskHistory|undefined>(undefined),job=useRef<AbortController|undefined>(undefined),alive=useRef(true),savingRef=useRef(false);
  const gesture=useRef<{pointer:number;points:Point[];start:Point}|undefined>(undefined);
  useEffect(()=>{alive.current=true;let disposed=false;void (async()=>{
    const dimensions=imageDimensions(asset.bytes,asset.mime);checkPixelBudget(dimensions.width,dimensions.height);
    const bitmap=await createImageBitmap(new Blob([new Uint8Array(asset.bytes)],{type:asset.mime}),{imageOrientation:'from-image'});
    try{checkPixelBudget(bitmap.width,bitmap.height);if(disposed)return;const temp=document.createElement('canvas');temp.width=bitmap.width;temp.height=bitmap.height;const ctx=temp.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('此瀏覽器無法開啟圖片處理。');ctx.drawImage(bitmap,0,0);const rgba=ctx.getImageData(0,0,temp.width,temp.height).data;history.current=new MaskHistory(bitmap.width*bitmap.height);setSource({width:bitmap.width,height:bitmap.height,rgba});temp.width=temp.height=1;}finally{bitmap.close();}
  })().catch(e=>{if(!disposed)setError(String(e));});return ()=>{disposed=true;alive.current=false;job.current?.abort();};},[asset.hash]);
  useEffect(()=>{const root=viewport.current;if(!root)return;const observer=new ResizeObserver(()=>setFitWidth(Math.max(1,root.clientWidth-24)));observer.observe(root);return ()=>observer.disconnect();},[source]);
  useEffect(()=>{if(!source||!canvas.current||!history.current)return;const el=canvas.current;el.width=source.width;el.height=source.height;el.getContext('2d')!.putImageData(new ImageData(maskPixels(source.rgba,history.current.current),source.width,source.height),0,0);},[source,revision]);
  useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(revision||busy||saving){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);return ()=>window.removeEventListener('beforeunload',leave);},[revision,busy,saving]);
  const cancelGesture=()=>{gesture.current=undefined;setPath([]);};
  useEffect(()=>{window.addEventListener('blur',cancelGesture);return ()=>window.removeEventListener('blur',cancelGesture);},[]);
  function close(){if(savingRef.current)return;job.current?.abort();onClose();}
  async function process(action:MaskAction){
    if(!source||!history.current||busy||saving)return;const controller=new AbortController();job.current=controller;setBusy(true);setProgress(0);setError('');
    try{const mask=await runMask({...source,mask:history.current.current,action},controller.signal,setProgress);if(alive.current&&!controller.signal.aborted){history.current.push(mask);setRevision(n=>n+1);}}
    catch(e){if(alive.current&&!controller.signal.aborted)setError(String(e));}finally{if(alive.current&&job.current===controller){setBusy(false);job.current=undefined;}}
  }
  function point(e:React.PointerEvent<SVGSVGElement>){return pixelPoint({x:e.clientX,y:e.clientY},e.currentTarget.getBoundingClientRect(),source!.width,source!.height);}
  function move(e:React.PointerEvent<SVGSVGElement>){const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;const p=point(e);if(shape==='box')g.points=[g.start,{x:p.x,y:g.start.y},p,{x:g.start.x,y:p.y}];else if(Math.hypot(p.x-g.points.at(-1)!.x,p.y-g.points.at(-1)!.y)>1){g.points.push(p);if(g.points.length>1024)g.points=g.points.filter((_,i)=>i%2===0||i===g.points.length-1);}setPath([...g.points]);}
  async function apply(){
    if(!source||!canvas.current||!history.current||busy||savingRef.current)return;savingRef.current=true;setSaving(true);setError('');
    try{const blob=await new Promise<Blob>((resolve,reject)=>canvas.current!.toBlob(value=>value?resolve(value):reject(new Error('無法產生透明 PNG。')),'image/png'));await onApply(new Uint8Array(await blob.arrayBuffer()));onClose();}
    catch(e){if(alive.current)setError(String(e));}finally{savingRef.current=false;if(alive.current)setSaving(false);}
  }
  const scale=source?Math.min(1,fitWidth/source.width)*zoom/100:1;
  return <Dialog title="圖片去背" onClose={close} dismissible={!saving} className="cutout-dialog">
    <p>{instance?'套用只替換選定圖片；其他實例保持原樣。':'套用會新增透明 PNG 副本到圖片庫。'}原圖保留，全部在本機處理。</p>
    <div className="cutout-tools" role="toolbar" aria-label="去背操作">{([['remove','移除區域'],['keep','保留區域'],['color','按顏色移除'],['pan','平移']] as const).map(([value,label])=><Button key={value} disabled={busy||saving||!source} aria-pressed={mode===value} onClick={()=>{cancelGesture();setMode(value);}}>{label}</Button>)}</div>
    {mode==='remove'||mode==='keep'?<><label>圈選方式<select disabled={busy||saving} value={shape} onChange={e=>{cancelGesture();setShape(e.target.value as typeof shape);}}><option value="box">方框</option><option value="lasso">自由圈選</option></select></label>{mode==='keep'&&<p className="small">每次保留圈選會以原圖圈內重建遮罩，取代先前去背結果；可按復原返回。</p>}</>:mode==='color'?<div className="cutout-color"><label>顏色容差（RGB 最大差）<input aria-label="顏色容差" type="range" min={0} max={255} value={tolerance} disabled={busy||saving} onChange={e=>setTolerance(Number(e.target.value))}/><output>{tolerance}</output></label><label><input type="checkbox" checked={global} disabled={busy||saving} onChange={e=>setGlobal(e.target.checked)}/>全部相近顏色（預設只移除相連區域）</label><p className="small">點圖片取樣並移除；調整容差後可復原再點選。</p></div>:<p className="small">以捲軸／觸控捲動查看圖片。</p>}
    {!source&&!error&&<p role="status">正在解碼原圖…</p>}{error&&<p role="alert" className="field-error">{error}</p>}
    {source&&<><div className="cutout-actions"><label>預覽縮放<input aria-label="去背預覽縮放" type="range" min={25} max={300} value={zoom} disabled={busy||saving} onChange={e=>{cancelGesture();setZoom(Number(e.target.value));}}/><output>{zoom}%</output></label><span>{source.width} × {source.height} px · 輸出尺寸保持原圖</span></div>
      <div ref={viewport} className="cutout-scroll"><div className="cutout-surface" style={{width:source.width*scale,height:source.height*scale}}><canvas ref={canvas}/><svg aria-label="去背圈選畫布" viewBox={`0 0 ${source.width} ${source.height}`} style={{pointerEvents:mode==='pan'?'none':'auto',touchAction:'none'}}
        onPointerDown={e=>{if(e.button!==0||busy||saving||gesture.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);gesture.current={pointer:e.pointerId,start:p,points:[p]};}}
        onPointerMove={move} onPointerUp={e=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;move(e);cancelGesture();if(mode==='color'){if(Math.hypot(point(e).x-g.start.x,point(e).y-g.start.y)*scale<5)void process({kind:'color',point:g.start,tolerance,global});}else if((mode==='remove'||mode==='keep')&&g.points.length>=3)void process({kind:mode,polygon:g.points});}}
        onPointerCancel={cancelGesture} onLostPointerCapture={()=>{if(gesture.current)cancelGesture();}} onContextMenu={e=>e.preventDefault()}>
        {!!path.length&&mode!=='color'&&<path d={path.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')+' Z'} fill="#176dba33" fillRule="evenodd" stroke="#176dba" strokeWidth={2/scale} pointerEvents="none"/>}
      </svg></div></div></>}
    {busy&&<div role="status"><progress max={1} value={progress}/><span>本機處理 {Math.round(progress*100)}%</span><Button onClick={()=>job.current?.abort()}>取消處理</Button></div>}
    <div className="modal-actions"><Button disabled={busy||saving||!history.current?.canUndo} onClick={()=>{history.current?.undo();setRevision(n=>n+1);}}>復原去背</Button><Button disabled={busy||saving||!history.current?.canRedo} onClick={()=>{history.current?.redo();setRevision(n=>n+1);}}>重做去背</Button><Button disabled={busy||saving||!source} onClick={()=>{history.current?.reset();setRevision(n=>n+1);}}>重設原圖</Button><Button disabled={saving} onClick={close}>取消</Button><Button variant="primary" disabled={!source||busy||saving||revision===0} onClick={()=>void apply()}>{saving?'保存中…':instance?'套用至這個圖片':'新增去背副本'}</Button></div>
  </Dialog>;
}
