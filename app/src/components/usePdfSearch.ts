import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { findText, indexText, type SearchHit, type TextIndex, type TextPart } from '../core/search';
export function usePdfSearch(reader:PDFDocumentProxy|undefined,query:string,onPage:(n:number)=>void){
  const cache=useRef(new Map<number,TextIndex>()),[hits,setHits]=useState<SearchHit[]>([]),[current,setCurrent]=useState(0),[progress,setProgress]=useState('');
  const navigate=useRef(onPage);navigate.current=onPage;
  useEffect(()=>{cache.current.clear();},[reader]);
  useEffect(()=>{let cancelled=false;setHits([]);setCurrent(0);setProgress('');if(!reader||!query.trim())return;
    const timer=setTimeout(()=>void(async()=>{let anyText=false;const result:SearchHit[]=[];
      for(let page=1;page<=reader.numPages;page++){
        if(cancelled)return;setProgress(`搜尋 ${page} / ${reader.numPages}`);
        let index=cache.current.get(page);if(!index){const content=await (await reader.getPage(page)).getTextContent();if(cancelled)return;index=indexText(content.items.filter((i):i is typeof i & TextPart=>'str' in i));cache.current.set(page,index);if(cache.current.size>48)cache.current.delete(cache.current.keys().next().value!);}
        anyText ||= !!index.text.trim();result.push(...findText(index,query,page));
      }
      if(cancelled)return;setHits(result);setProgress(result.length?'':anyText?'找不到符合的文字':'此文件沒有文字層；不支援 OCR。');if(result[0])navigate.current(result[0].page);
    })().catch(e=>{if(!cancelled)setProgress('搜尋失敗：'+String(e));}),180);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[reader,query]);
  function step(delta:number){if(!hits.length)return;const next=(current+delta+hits.length)%hits.length;setCurrent(next);navigate.current(hits[next].page);}
  return {hits,currentHit:hits[current],summary:progress||(hits.length?`${current+1} / ${hits.length}`:''),step};
}
