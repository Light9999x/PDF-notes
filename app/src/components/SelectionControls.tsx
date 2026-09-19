import { useLayoutEffect, useRef, useState } from 'react';
import { annotationTransform, type Matrix } from '../core/geometry';
import { selectionFrame, screenRotationControl, type Handle } from '../core/manipulation';
import type { SelectedObject } from '../core/selection';
export function SelectionControls({selection,zoom,matrix}:{selection:SelectedObject[];zoom:number;matrix:Matrix}){
  const node=useRef<SVGGElement>(null),[visible,setVisible]=useState<{top:number;left:number;right:number}>();
  useLayoutEffect(()=>{const svg=node.current?.ownerSVGElement,root=svg?.closest('.page-scroll');if(!svg||!root)return;let frame=0;
    const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const r=root.getBoundingClientRect(),b=svg.getBoundingClientRect(),cover=parseFloat(getComputedStyle(root).getPropertyValue('--panel-cover'))||0,next={top:r.top-b.top,left:r.left+cover-b.left,right:r.left+root.clientWidth-b.left};setVisible(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);});};measure();root.addEventListener('scroll',measure,{passive:true});const observer=new ResizeObserver(measure);observer.observe(root);return ()=>{cancelAnimationFrame(frame);root.removeEventListener('scroll',measure);observer.disconnect();};
  },[zoom,matrix,selection.length]);
  if(!selection.length)return null;const frame=selectionFrame(selection),w=frame.width,h=frame.height;
  const handles:[Handle,number,number][]=[['nw',0,0],['n',w/2,0],['ne',w,0],['e',w,h/2],['se',w,h],['s',w/2,h],['sw',0,h],['w',0,h/2]];
  // Omit intermediate handles on tiny frames so hit areas never overlap.
  const corners=handles.filter(([k])=>k.length===2),shown=w*zoom>=100&&h*zoom>=100?handles:w*zoom>=48&&h*zoom>=48?corners:handles.filter(([k])=>k==='se');
  const radius=22/zoom,control=screenRotationControl(frame,matrix,48,visible);
  return <g ref={node} className="selection-controls"><g transform={annotationTransform(frame)}>
    <rect width={w} height={h} fill="none" stroke="#1b7769" strokeWidth={1.5/zoom} strokeDasharray="5 3" pointerEvents="none"/>
    {([['n',0,0,w,0],['e',w,0,w,h],['s',0,h,w,h],['w',0,0,0,h]] as const).map(([k,x1,y1,x2,y2])=><line key={k} data-resize={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={Math.min(12/zoom,w/3,h/3)} style={{cursor:k==='n'||k==='s'?'ns-resize':'ew-resize'}}/>)}
    {shown.map(([k,x,y])=><g key={k} data-resize={k} style={{cursor:k+'-resize'}}><circle cx={x} cy={y} r={radius} fill="transparent"/><rect x={x-4/zoom} y={y-4/zoom} width={8/zoom} height={8/zoom} fill="white" stroke="#1b7769" strokeWidth={1/zoom} pointerEvents="none"/></g>)}
    </g>
    <line x1={control.anchor.x} x2={control.handle.x} y1={control.anchor.y} y2={control.handle.y} stroke="#1b7769" strokeWidth={1/zoom} pointerEvents="none"/>
    <circle data-rotate="true" aria-label="旋轉所選物件" cx={control.handle.x} cy={control.handle.y} r={22/zoom} fill="transparent" style={{cursor:'grab'}}/>
    <circle cx={control.handle.x} cy={control.handle.y} r={7/zoom} fill="white" stroke="#1b7769" strokeWidth={1/zoom} pointerEvents="none"/>
  </g>;
}
