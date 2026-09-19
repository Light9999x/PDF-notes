import { StatusBadge } from './ui';
import { useEffect, useState } from 'react';
import { resizeGroup } from '../core/manipulation';
import { annotationMatrix, transform, resize } from '../core/geometry';
import { applyCommon, commonValue, selectionChanges, type CommonPatch, type SelectedObject } from '../core/selection';
import type { Annotation, EditRequest } from '../core/model';

type Props={selection:SelectedObject[];working:boolean;onCommit:(changes:EditRequest[])=>Promise<void>;onDelete:()=>void;onDirty:(dirty:boolean)=>void;onError:(e:unknown)=>void};
export function PropertiesPanel({selection,working,onCommit,onDelete,onDirty,onError}:Props){
  const [single,setSingle]=useState<Annotation|undefined>(()=>selection.length===1?structuredClone(selection[0].value):undefined);
  const [patch,setPatch]=useState<CommonPatch>({});
  const dirty=single?JSON.stringify(single)!==JSON.stringify(selection[0]?.value):Object.keys(patch).length>0;
  useEffect(()=>onDirty(dirty),[dirty,onDirty]);
  const allText=selection.length>0&&selection.every(o=>o.value.kind==='text');
  const allStrokes=selection.length>0&&selection.every(o=>o.value.kind==='pen'||o.value.kind==='highlight');
  const noImages=selection.every(o=>o.value.kind!=='image');
  const number=(key:'opacity'|'weight'|'fontSize'|'angle',label:string,min:number,max:number)=>{
    const value=patch[key]??commonValue(selection,key);
    return <label>{label}{value===undefined&&<small>多個值</small>}<input aria-label={'共同'+label} type="number" step="any" min={min} max={max} placeholder="多個值" value={value??''} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n))setPatch({...patch,[key]:Math.max(min,Math.min(max,n))});}}/></label>;
  };
  return <>
    <p className="selection-heading">{selection.length>1?`已選取 ${selection.length} 個物件`:selection.length?'已選取 1 個物件':'尚未選取物件'}</p>
    {dirty&&<StatusBadge tone="warning">未套用</StatusBadge>}
    {!selection.length?<p className="properties-empty">點選或圈選物件以編輯屬性。</p>:<>
      {single?<>
        {single.kind==='text'&&<><label>文字內容<textarea aria-label="編輯文字" value={single.text} onChange={e=>setSingle({...single,text:e.target.value})}/></label>
          <label>排字方向<select aria-label="文字方向" value={single.writingMode||'horizontal-tb'} onChange={e=>setSingle({...single,writingMode:e.target.value as Annotation['writingMode']})}><option value="horizontal-tb">水平向右</option><option value="vertical-rl">直排向下・換欄向左</option></select></label>
        </>}
        <div className="property-grid">{(['x','y','width','height'] as const).map(key=><label key={key}>{{x:'X 位置',y:'Y 位置',width:'寬度',height:'高度'}[key]}<input aria-label={{x:'X 位置',y:'Y 位置',width:'寬度',height:'高度'}[key]} type="number" value={Math.round(single[key]*100)/100} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))setSingle(key==='width'||key==='height'?resizeGroup([{...selection[0],value:single}],key==='width'?'e':'s',transform(annotationMatrix(single),{x:key==='width'?Math.max(1,n):single.width/2,y:key==='height'?Math.max(1,n):single.height/2}))[0]:{...single,[key]:n});}}/></label>)}</div>
        {single.kind!=='image'&&<label>顏色<input type="color" aria-label="物件顏色" value={single.color} onChange={e=>setSingle({...single,color:e.target.value})}/></label>}
        <label>透明度<input aria-label="物件透明度" type="range" min="0" max="1" step="0.05" value={single.opacity} onChange={e=>setSingle({...single,opacity:Number(e.target.value)})}/></label>
        {single.kind!=='image'&&<label>{single.kind==='text'?'文字大小':'線條粗細'}<input aria-label="物件字級或粗細" type="number" min="1" max="200" value={single.kind==='text'?single.fontSize:single.weight} onChange={e=>setSingle({...single,[single.kind==='text'?'fontSize':'weight']:Math.max(1,Math.min(200,Number(e.target.value)))})}/></label>}
        <button className="primary" disabled={working||!dirty} onClick={()=>void onCommit(selectionChanges(selection,()=>single)).catch(onError)}>套用變更</button>
      </>:<>

        {noImages&&<label>共同顏色{(patch.color??commonValue(selection,'color'))===undefined&&<small>多個值</small>}<input aria-label="共同顏色" type="color" value={patch.color??commonValue(selection,'color')??'#000000'} onChange={e=>setPatch({...patch,color:e.target.value})}/></label>}
        {number('opacity','透明度',0,1)}{allStrokes&&number('weight','線條粗細',1,200)}
        {allText&&<>{number('fontSize','文字大小',1,200)}<label>共同文字方向<select aria-label="共同文字方向" value={patch.writingMode??commonValue(selection,'writingMode')??''} onChange={e=>{if(e.target.value)setPatch({...patch,writingMode:e.target.value as Annotation['writingMode']});}}><option value="" disabled>多個值</option><option value="horizontal-tb">水平向右</option><option value="vertical-rl">直排向下・換欄向左</option></select></label></>}
        <button className="primary" disabled={working||!Object.keys(patch).length} onClick={()=>void onCommit(applyCommon(selection,patch)).catch(onError)}>套用共同屬性</button>
      </>}
      <button className="danger" disabled={working} onClick={onDelete}>{selection.length>1?'刪除所選物件':'刪除物件'}</button>
    </>}
  </>;
}
