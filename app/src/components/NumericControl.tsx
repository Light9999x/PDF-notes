import { useEffect, useState } from 'react';
export function parseNumber(text:string,min:number,max:number,integer=false):number|undefined {
  if(!/^\d+(\.\d+)?$/.test(text.trim()))return;
  const n=Number(text);return Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n))?n:undefined;
}
export function NumberInput({label,value,min,max,onCommit,integer=false,disabled=false}:{label:string;value:number;min:number;max:number;onCommit:(n:number)=>void;integer?:boolean;disabled?:boolean}){
  const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
  function commit(){const n=parseNumber(draft,min,max,integer);if(n!==undefined)onCommit(n);setDraft(String(n??value));}
  return <input aria-label={label} type="text" inputMode={integer?'numeric':'decimal'} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.stopPropagation();setDraft(String(value));}}}/>;
}
export function SizeControl({label,value,min=1,onChange}:{label:string;value:number;min?:number;onChange:(n:number)=>void}){return <div className="size-control"><span>{label}</span><input type="range" aria-label={label+'滑條'} min={min} max={200} step="0.1" value={value} onChange={e=>onChange(Number(e.target.value))}/><NumberInput label={label} value={value} min={min} max={200} onCommit={onChange}/><span>pt</span></div>;}
