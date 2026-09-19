import type { Point } from './model';
export const MAX_CUTOUT_PIXELS=4*1024*1024;
export type MaskAction={kind:'remove'|'keep';polygon:Point[]}|{kind:'color';point:Point;tolerance:number;global:boolean};
export type MaskJob={width:number;height:number;rgba:Uint8ClampedArray;mask:Uint8Array;action:MaskAction};
export function checkPixelBudget(width:number,height:number){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>MAX_CUTOUT_PIXELS)throw new Error('去背支援最多 4,194,304 像素；請自行準備較小副本，原圖不會被降採樣。');}
export function imageDimensions(bytes:Uint8Array,mime:string){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(mime==='image/png'&&bytes.length>=24&&view.getUint32(0)===0x89504e47&&view.getUint32(4)===0x0d0a1a0a)return {width:view.getUint32(16),height:view.getUint32(20)};
  if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){let offset=2;while(offset+4<=bytes.length){if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;if(offset+2>bytes.length)break;const size=view.getUint16(offset);if(size<2||offset+size>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8)return {height:view.getUint16(offset+3),width:view.getUint16(offset+5)};offset+=size;}}
  throw new Error('無法讀取 PNG／JPEG 像素尺寸。');
}
export function pixelPoint(client:Point,rect:{left:number;top:number;width:number;height:number},width:number,height:number):Point{return {x:Math.max(0,Math.min(width,(client.x-rect.left)*width/rect.width)),y:Math.max(0,Math.min(height,(client.y-rect.top)*height/rect.height))};}
// A yielding kernel can run in a Worker or cooperatively on the main thread.
// Neither route mutates the source pixels or the previous undo snapshot.
export function* maskSteps({width,height,rgba,mask,action}:MaskJob):Generator<number,Uint8Array>{
  checkPixelBudget(width,height);const count=width*height;if(rgba.length!==count*4||mask.length!==count)throw new Error('像素資料不完整。');
  const next=mask.slice();
  if(action.kind==='color'){
    const x=Math.min(width-1,Math.floor(action.point.x)),y=Math.min(height-1,Math.floor(action.point.y)),seed=y*width+x,t=Math.max(0,Math.min(255,action.tolerance));
    if(x<0||y<0||!Number.isFinite(t)||!rgba[seed*4+3]||!mask[seed])return next;
    const matches=(i:number)=>!!mask[i]&&rgba[i*4+3]>0&&Math.max(Math.abs(rgba[i*4]-rgba[seed*4]),Math.abs(rgba[i*4+1]-rgba[seed*4+1]),Math.abs(rgba[i*4+2]-rgba[seed*4+2]))<=t;
    if(action.global){for(let i=0;i<count;i++){if(matches(i))next[i]=0;if(i%32768===0)yield i/count;}}
    else{
      const queue=new Uint32Array(count),seen=new Uint8Array(count);let read=0,write=1;queue[0]=seed;seen[seed]=1;
      const add=(i:number)=>{if(!seen[i]){seen[i]=1;if(matches(i))queue[write++]=i;}};
      while(read<write){const i=queue[read++];next[i]=0;const col=i%width;if(col>0)add(i-1);if(col<width-1)add(i+1);if(i>=width)add(i-width);if(i+width<count)add(i+width);if(read%32768===0)yield read/count;}
    }
  }else{
    const polygon=action.polygon;if(polygon.length<3||polygon.length>2048||polygon.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('請圈選有效範圍。');
    if(action.kind==='keep')next.fill(0);let selectedPixels=0;
    for(let y=0;y<height;y++){
      const scan=y+.5,xs:number[]=[];for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>scan)!==(b.y>scan))xs.push(a.x+(scan-a.y)*(b.x-a.x)/(b.y-a.y));}
      xs.sort((a,b)=>a-b);
      for(let k=0;k+1<xs.length;k+=2){const start=Math.min(width,Math.max(0,Math.ceil(xs[k]-.5))),end=Math.max(0,Math.min(width,Math.ceil(xs[k+1]-.5)));if(end>start){selectedPixels+=end-start;next.fill(action.kind==='keep'?255:0,y*width+start,y*width+end);}}
      if(y%32===0)yield y/height;
    }
    if(!selectedPixels)throw new Error('圈選沒有涵蓋有效像素，請重新圈選。');
  }
  yield 1;return next;
}
export function maskPixels(rgba:Uint8ClampedArray,mask:Uint8Array){const result=rgba.slice();if(result.length!==mask.length*4)throw new Error('像素遮罩大小不符。');for(let i=0;i<mask.length;i++)result[i*4+3]=Math.round(result[i*4+3]*mask[i]/255);return result;}
export class MaskHistory {
  private states:Uint8Array[];private index=0;private capacity:number;
  constructor(size:number){this.states=[new Uint8Array(size).fill(255)];this.capacity=Math.max(2,Math.min(30,Math.floor(32*1024*1024/size)));}
  get current(){return this.states[this.index];}get canUndo(){return this.index>0;}get canRedo(){return this.index<this.states.length-1;}
  push(mask:Uint8Array){if(mask.length!==this.current.length)throw new Error('遮罩大小不符');if(mask.every((v,i)=>v===this.current[i]))return;this.states=this.states.slice(0,this.index+1);this.states.push(mask);if(this.states.length>this.capacity)this.states.shift();this.index=this.states.length-1;}
  undo(){if(this.canUndo)this.index--;}redo(){if(this.canRedo)this.index++;}reset(){this.push(new Uint8Array(this.current.length).fill(255));}
}
