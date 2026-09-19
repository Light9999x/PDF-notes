import { describe,it,expect,vi } from 'vitest';
import { zipSync,strToU8 } from 'fflate';
import { assetEntries,drivePage,MAX_DOCUMENT_BYTES,readFileBounded,readResponseBounded } from '../src/core/untrusted';
import { unpack } from '../src/core/archive';
const hash='a'.repeat(64);
describe('untrusted file and network boundaries',()=>{
  it('rejects oversized files before allocating their contents',async()=>{
    const arrayBuffer=vi.fn();
    await expect(readFileBounded({size:MAX_DOCUMENT_BYTES+1,arrayBuffer} as unknown as File,MAX_DOCUMENT_BYTES)).rejects.toThrow();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it('accepts a streamed response exactly at the limit',async()=>{
    const response=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3,4]));c.close();}}));
    expect(await readResponseBounded(response,4)).toEqual(new Uint8Array([1,2,3,4]));
  });
  it.each([undefined,'1'])('cancels excess bytes even with missing or false Content-Length (%s)',async declared=>{
    const cancel=vi.fn(),body=new ReadableStream({start(c){c.enqueue(new Uint8Array(3));c.enqueue(new Uint8Array(3));},cancel});
    const response=new Response(body,{headers:declared?{'content-length':declared}:{}});
    await expect(readResponseBounded(response,4)).rejects.toThrow();expect(cancel).toHaveBeenCalled();
  });
  it('cancels a declared oversized response before reading it',async()=>{
    const cancel=vi.fn(),response=new Response(new ReadableStream({cancel}),{headers:{'content-length':'20'}});
    await expect(readResponseBounded(response,4)).rejects.toThrow();expect(cancel).toHaveBeenCalled();
  });
  it('validates every asset descriptor before download',()=>{
    expect(()=>assetEntries(JSON.parse('{"__proto__":{"mime":"image/png"}}'))).toThrow();
    expect(()=>assetEntries({[hash]:null})).toThrow();
    expect(()=>assetEntries({[hash]:{hash:'b'.repeat(64),mime:'image/png'}})).toThrow();
    expect(()=>assetEntries([])).toThrow();
    expect(assetEntries({[hash]:{hash,mime:'image/png'}})).toHaveLength(1);
  });
  it('rejects malformed Drive metadata rather than trusting a type assertion',()=>{
    const file={id:'test',name:'snapshot',appProperties:{hash,type:'snapshot'}};
    expect(drivePage({files:[file]}).files).toHaveLength(1);
    expect(()=>drivePage({files:[{...file,appProperties:{hash,type:'unknown'}}]})).toThrow();
    expect(()=>drivePage({files:[{...file,size:String(MAX_DOCUMENT_BYTES+1)}]})).toThrow();
    expect(()=>drivePage({files:[null]})).toThrow();
    expect(()=>drivePage({files:[],nextPageToken:{}})).toThrow();
  });
});
describe('archive rejection',()=>{
  it('rejects traversal and unexpected ZIP entries',async()=>{
    await expect(unpack(zipSync({'../escape':strToU8('x')}))).rejects.toThrow();
  });
  it('rejects malformed and undeclared assets',async()=>{
    await expect(unpack(zipSync({'manifest.json':strToU8('{"assets":null}')}))).rejects.toThrow();
    await expect(unpack(zipSync({'manifest.json':strToU8('{"assets":{}}'),['assets/'+hash]:new Uint8Array([1])}))).rejects.toThrow();
  });
  it('rejects duplicate entry names instead of silently choosing the last',async()=>{
    const bytes=zipSync({'manifest.json':strToU8('{}'),'manifest.jsox':strToU8('{}')},{level:0});
    const needle=strToU8('manifest.jsox');
    for(let i=0;i<=bytes.length-needle.length;i++)if(needle.every((v,n)=>bytes[i+n]===v))bytes[i+needle.length-1]=110;
    await expect(unpack(bytes)).rejects.toThrow('不支援');
  });
});
