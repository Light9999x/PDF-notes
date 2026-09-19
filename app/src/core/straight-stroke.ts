import type { Annotation, Point } from './model';
export const STRAIGHT_DELAY=1000;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function nearStraight(raw:Point[]):boolean {
  if(raw.length<2)return false;
  const points=[raw[0]];
  for(const p of raw.slice(1,-1))if(distance(p,points.at(-1)!)>=2)points.push(p);
  points.push(raw.at(-1)!);
  const a=points[0],b=points.at(-1)!,length=distance(a,b);if(length<20)return false;
  let path=0;const tolerance=Math.max(3,length*.04);
  for(let i=1;i<points.length;i++){
    const p=points[i];path+=distance(points[i-1],p);
    const t=Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/(length*length)));
    if(Math.hypot(p.x-a.x-t*(b.x-a.x),p.y-a.y-t*(b.y-a.y))>tolerance)return false;
  }
  return path/length<=1.15;
}
// One instance per captured pointer. Fixed dwell anchor prevents slow drift
// from satisfying a long press; cancellation invalidates even queued callbacks.
export class StraightStroke {
  private points:Point[]=[];private anchor?:Point;private timer?:ReturnType<typeof setTimeout>;private generation=0;private alive=true;
  straight=false;
  constructor(private onStraight:()=>void){}
  move(point:Point){
    if(!this.alive||this.straight)return;this.points.push(point);
    if(this.anchor&&distance(this.anchor,point)<=3&&(this.timer!==undefined||!nearStraight(this.points)))return;
    this.clear();this.anchor={...point};if(!nearStraight(this.points))return;
    const generation=this.generation;
    this.timer=setTimeout(()=>{if(this.alive&&generation===this.generation&&nearStraight(this.points)){this.straight=true;this.onStraight();}},STRAIGHT_DELAY);
  }
  private clear(){clearTimeout(this.timer);this.timer=undefined;this.generation++;}
  cancel(){this.alive=false;this.clear();}
}
export function strokeDraft(base:Annotation,points:Point[]):Annotation {
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
  for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
  return {...base,x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y),points:points.map(p=>({x:p.x-x,y:p.y-y}))};
}
