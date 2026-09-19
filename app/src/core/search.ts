export type TextPart={str:string;hasEOL?:boolean};
export type TextPosition={item:number;offset:number};
export type TextIndex={text:string;positions:TextPosition[];ends:TextPosition[]};
export type SearchHit={page:number;start:TextPosition;end:TextPosition};
// Keep UTF-16 offsets for DOM Range. Case expansion and collapsed whitespace
// retain their source intervals, including characters spanning PDF text items.
export function indexText(items:TextPart[]):TextIndex {
  let text='';const positions:TextPosition[]=[],ends:TextPosition[]=[];
  function append(char:string,start:TextPosition,end:TextPosition){
    const normalized=/\s/u.test(char)?' ':char.toLowerCase();
    if(normalized===' '&&text.endsWith(' ')){ends[ends.length-1]=end;return;}
    text+=normalized;for(let j=0;j<normalized.length;j++){positions.push(start);ends.push(end);}
  }
  items.forEach((part,item)=>{let offset=0;for(const char of part.str){append(char,{item,offset},{item,offset:offset+char.length});offset+=char.length;}
    const next=items[item+1]?.str||'',cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    // A Chinese line wrap is not a word separator. Explicit spaces still remain.
    if(part.hasEOL&&!(cjk.test([...part.str].at(-1)||'')&&cjk.test([...next][0]||'')))append(' ',{item,offset},{item,offset});});
  return {text,positions,ends};
}
export function findText(index:TextIndex,query:string,page:number):SearchHit[]{
  const needle=query.toLowerCase().replace(/\s+/gu,' ').trim();if(!needle)return [];
  const hits:SearchHit[]=[];let offset=0;
  while(offset<=index.text.length-needle.length){const at=index.text.indexOf(needle,offset);if(at<0)break;hits.push({page,start:index.positions[at],end:index.ends[at+needle.length-1]});offset=at+Math.max(1,needle.length);}
  return hits;
}
export type HighlightRect={left:number;top:number;width:number;height:number;current:boolean};
export function highlightRects(divs:HTMLElement[],hits:SearchHit[],current:SearchHit|undefined,container:HTMLElement):HighlightRect[]{
  const origin=container.getBoundingClientRect(),rects:HighlightRect[]=[];
  for(const hit of hits)for(let i=hit.start.item;i<=hit.end.item;i++){
    const div=divs[i],node=div?.firstChild;if(!node||node.nodeType!==3)continue;
    const start=i===hit.start.item?hit.start.offset:0,end=i===hit.end.item?hit.end.offset:node.textContent!.length;if(start===end)continue;
    const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);
    // Separate ranges per item and getClientRects per line avoid whole-line boxes.
    for(const r of range.getClientRects())if(r.width&&r.height)rects.push({left:r.left-origin.left,top:r.top-origin.top,width:r.width,height:r.height,current:hit===current});
  }
  return rects;
}
