import { useEffect, useState, useId } from 'react';
import type { Annotation, NoteDocument } from '../core/model';
import { annotationTransform, linePoints } from '../core/geometry';
import { FONT, textLayout } from '../core/text';
export function AnnotationShape({value:a,doc}:{value:Annotation;doc:NoteDocument}) {
  const [url,setUrl]=useState('');
  const asset=a.asset?doc.assets[a.asset]:undefined;
  useEffect(()=>{if(!asset)return;const u=URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)],{type:asset.mime}));setUrl(u);return ()=>URL.revokeObjectURL(u);},[asset]);
  const clipId=useId();
  return <g transform={annotationTransform(a)} opacity={a.opacity}>
    {(a.kind==='pen'||a.kind==='highlight') && ((a.points?.length||0)>1?<polyline points={linePoints(a.points||[])} fill="none" stroke={a.color} strokeWidth={a.weight} strokeLinecap="round" strokeLinejoin="round"/>:<circle cx={a.points?.[0]?.x} cy={a.points?.[0]?.y} r={a.weight/2} fill={a.color}/>)}
    {a.kind==='image'&&url&&<image href={url} width={a.width} height={a.height} preserveAspectRatio="none"/>}
    {a.kind==='text'&&<><defs><clipPath id={clipId}><rect width={a.width} height={a.height}/></clipPath></defs><text fill={a.color} fontSize={a.fontSize||18} fontFamily={FONT} style={{writingMode:'horizontal-tb',direction:'ltr',unicodeBidi:'isolate',textOrientation:'mixed'}} textAnchor="start" dominantBaseline="alphabetic" clipPath={`url(#${clipId})`}>{textLayout(a).map((g,i)=><tspan key={i} x={g.x} y={g.y+(a.fontSize||18)}>{g.text}</tspan>)}</text></>}
  </g>;
}
