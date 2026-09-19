import type { Annotation, NoteDocument, Point } from './model';
import { editableObjects, type SelectedObject } from './selection';
import { textLayout } from './text';

export function selectedText(doc:NoteDocument,selection:SelectedObject[]){
  if(selection.length!==1||selection[0].value.kind!=='text')return;
  const viewed=selection[0];
  return editableObjects(doc).find(o=>o.id===viewed.id&&o.head===viewed.head&&o.value.kind==='text');
}
// Map a local click to a UTF-16 offset using the same wrapping as rendering.
export function textCaret(a:Annotation,point:Point,measure:(text:string)=>number):number {
  const text=a.text||'',size=a.fontSize||18,lines=textLayout(a,measure);
  if(!lines.length)return 0;
  let best=lines[0],distance=Infinity;
  for(const line of lines){const dx=a.writingMode==='vertical-rl'?point.x-(line.x+size/2):0,dy=point.y-(line.y+size*.675),d=dx*dx+dy*dy;if(d<distance){best=line;distance=d;}}
  let offset=0;
  for(const line of lines){if(a.writingMode==='vertical-rl')while(text[offset]==='\n')offset++;if(line===best)break;offset+=line.text.length;if(a.writingMode!=='vertical-rl'&&text[offset]==='\n')offset++;}
  if(a.writingMode==='vertical-rl')return offset+(point.y>best.y+size*.675?best.text.length:0);
  let before=0,index=0;for(const char of best.text){const after=measure(best.text.slice(0,index+char.length));if(point.x<(before+after)/2)break;index+=char.length;before=after;}
  return Math.min(text.length,offset+index);
}

export function textChanged(originalText:string|undefined,value:Annotation){return (originalText||'')!==(value.text||'');}
