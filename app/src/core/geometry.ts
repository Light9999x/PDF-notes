import type { Annotation, Point } from './model';
export type Matrix=[number,number,number,number,number,number];
export function transform(m:Matrix,p:Point):Point {return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
export function inverse(m:Matrix,p:Point):Point {const d=m[0]*m[3]-m[1]*m[2];return {x:(m[3]*(p.x-m[4])-m[2]*(p.y-m[5]))/d,y:(-m[1]*(p.x-m[4])+m[0]*(p.y-m[5]))/d};}
export function pageMatrix(viewportTransform:number[],view:number[]):Matrix {
  const [a,b,c,d,e,f]=viewportTransform;return [a,b,-c,-d,a*view[0]+c*view[3]+e,b*view[0]+d*view[3]+f];
}
export function resize(a:Annotation,width:number,height:number):Annotation {
  return {...a,width,height,points:a.points?.map(p=>({...p,x:p.x*width/a.width,y:p.y*height/a.height}))};
}
export function linePoints(points:Point[]):string {return points.map(p=>p.x+','+p.y).join(' ');}
export function textLines(text:string,width:number,size:number,measure?:(t:string)=>number):string[] {
  const lines:string[]=[];
  for(const paragraph of text.split('\n')) {
    let line='';
    for(const char of paragraph) {if(line && (measure?measure(line+char):(line.length+1)*size)>width){lines.push(line);line='';}line+=char;}
    lines.push(line);
  }
  return lines;
}

export function localPoint(a:Annotation,p:Point):Point {
  return inverse(annotationMatrix(a),p);
}
export function contains(a:Annotation,p:Point):boolean {const q=localPoint(a,p);return q.x>=0&&q.y>=0&&q.x<=a.width&&q.y<=a.height;}
function pointSegment(p:Point,a:Point,b:Point):number {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
// All annotation coordinates use crop-local x-right/y-down axes. Positive angles
// turn clockwise, exactly as SVG/Canvas in those axes; page rotation is separate.
export function annotationMatrix(a:Annotation):Matrix {
  const r=(a.angle||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),cx=a.width/2,cy=a.height/2;
  return [c,s,-s,c,a.x+cx-c*cx+s*cy,a.y+cy-s*cx-c*cy];
}
export const annotationTransform=(a:Annotation)=>`matrix(${annotationMatrix(a).join(' ')})`;
export function annotationCorners(a:Annotation):Point[]{return [{x:0,y:0},{x:a.width,y:0},{x:a.width,y:a.height},{x:0,y:a.height}].map(p=>transform(annotationMatrix(a),p));}
export function segmentDistance(a:Point,b:Point,c:Point,d:Point):number {
  const cross=(p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
export function sweptHit(a:Annotation,start:Point,end:Point,radius:number):boolean {
  if(a.kind!=='pen'&&a.kind!=='highlight')return false;
  const points=(a.points||[]).map(p=>transform(annotationMatrix(a),p));
  return points.some((p,i)=>segmentDistance(start,end,points[Math.max(0,i-1)],p)<=radius+a.weight/2);
}
export function clipSegment(a:Point,b:Point,width:number,height:number):[Point,Point]|null {
  let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x],[dx,width-a.x],[-dy,a.y],[dy,height-a.y]]){
    if(p===0){if(q<0)return null;continue;}const t=q/p;
    if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
  }
  return [{x:a.x+lo*dx,y:a.y+lo*dy},{x:a.x+hi*dx,y:a.y+hi*dy}];
}
