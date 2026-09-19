import { useEffect, useRef } from 'react';
import { annotationMatrix, type Matrix } from '../core/geometry';
import { FONT } from '../core/text';
import type { Annotation } from '../core/model';
export type TextDraft={id:string;expected:string[];value:Annotation;error?:string;originalText?:string;caret?:number};
export function InlineText({draft,matrix,busy,onComposition,onChange,onFinish,onCancel}:{draft:TextDraft;matrix:Matrix;busy:boolean;onComposition:(active:boolean)=>void;onChange:(text:string)=>void;onFinish:()=>void;onCancel:()=>void}){
  const input=useRef<HTMLTextAreaElement>(null),composing=useRef(false),pendingBlur=useRef(false);
  useEffect(()=>{const el=input.current;if(el){el.focus();const caret=draft.caret??el.value.length;el.setSelectionRange(caret,caret);}},[draft.id]);
  const a=draft.value,m=annotationMatrix(a),[b,c,d,e,x,y]=matrix;
  const combined=[b*m[0]+d*m[1],c*m[0]+e*m[1],b*m[2]+d*m[3],c*m[2]+e*m[3],b*m[4]+d*m[5]+x,c*m[4]+e*m[5]+y];
  return <div className="inline-text" style={{width:a.width,height:a.height,transform:`matrix(${combined.join(',')})`}}>
    <textarea ref={input} aria-label="原位文字內容" maxLength={100000} value={a.text||''} readOnly={busy} style={{fontFamily:FONT,fontSize:a.fontSize,lineHeight:1.35,color:a.color,writingMode:a.writingMode||'horizontal-tb'}} onChange={e=>onChange(e.target.value)}
      onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={()=>{composing.current=false;onComposition(false);if(pendingBlur.current){pendingBlur.current=false;onFinish();}}}
      onBlur={e=>{if(e.relatedTarget instanceof Element&&e.relatedTarget.closest('[data-panel-toggle],[data-text-action]'))return;if(composing.current)pendingBlur.current=true;else onFinish();}}
      onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing||composing.current)return;if(e.key==='Escape'){e.preventDefault();onCancel();}if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();onFinish();}}}/>
  </div>;
}
