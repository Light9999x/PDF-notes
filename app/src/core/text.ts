import type { Annotation } from './model';
import { textLines } from './geometry';
export const FONT='"Microsoft JhengHei", "Noto Sans TC", system-ui, sans-serif';
export function wrapText(a:Annotation,measure?:(text:string)=>number):string[] {
  if(measure)return textLines(a.text||'',a.width,a.fontSize||18,measure);
  const ctx=document.createElement('canvas').getContext('2d')!;ctx.font=(a.fontSize||18)+'px '+FONT;
  return textLines(a.text||'',a.width,a.fontSize||18,s=>ctx.measureText(s).width);
}
export function textLayout(a:Annotation,measure?:(text:string)=>number):{text:string;x:number;y:number}[] {
  const size=a.fontSize||18;
  if(a.writingMode!=='vertical-rl')return wrapText(a,measure).map((text,i)=>({text,x:0,y:i*size*1.35}));
  const result:{text:string;x:number;y:number}[]=[];let col=0,row=0;
  const rows=Math.max(1,Math.floor(a.height/(size*1.35)));
  for(const char of a.text||''){
    if(char==='\n'){col++;row=0;continue;}
    if(row>=rows){col++;row=0;}
    result.push({text:char,x:a.width-size-col*size*1.35,y:row*size*1.35});row++;
  }
  return result;
}
