import { annotationCorners, annotationMatrix, inverse, resize, transform, type Matrix } from './geometry';
import type { Annotation, Point } from './model';
import type { SelectedObject } from './selection';
export type Handle='nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
export function selectionFrame(group:SelectedObject[]):Annotation {
  if(group.length===1)return group[0].value;
  const ps=group.flatMap(o=>annotationCorners(o.value)),x=Math.min(...ps.map(p=>p.x)),y=Math.min(...ps.map(p=>p.y));
  return {...group[0].value,x,y,width:Math.max(1,...ps.map(p=>p.x-x)),height:Math.max(1,...ps.map(p=>p.y-y)),angle:0};
}
export function rotateGroup(group:SelectedObject[],degrees:number,frame=selectionFrame(group)):Annotation[] {
  const c={x:frame.x+frame.width/2,y:frame.y+frame.height/2},r=degrees*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r);
  return group.map(({value:a})=>{const x=a.x+a.width/2-c.x,y=a.y+a.height/2-c.y;return {...a,x:c.x+x*cos-y*sin-a.width/2,y:c.y+x*sin+y*cos-a.height/2,angle:(a.angle||0)+degrees};});
}
// Resize in the frozen frame's local axes; the opposite anchor never moves.
export function resizeGroup(group:SelectedObject[],handle:Handle,point:Point,frame=selectionFrame(group)):Annotation[] {
  const local=inverse(annotationMatrix(frame),point),left=handle.includes('w'),right=handle.includes('e'),top=handle.includes('n'),bottom=handle.includes('s');
  const anchor={x:left?frame.width:right?0:frame.width/2,y:top?frame.height:bottom?0:frame.height/2};
  let sx=left?Math.max(1,frame.width-local.x)/frame.width:right?Math.max(1,local.x)/frame.width:1;
  let sy=top?Math.max(1,frame.height-local.y)/frame.height:bottom?Math.max(1,local.y)/frame.height:1;
  if(group.length>1||group[0].value.kind!=='text') {const factor=left||right?sx:sy;sx=sy=Math.max(factor,1/frame.width,1/frame.height);}
  const m=annotationMatrix(frame);
  return group.map(({value:a})=>{
    const center=inverse(m,{x:a.x+a.width/2,y:a.y+a.height/2});
    const target=transform(m,{x:anchor.x+(center.x-anchor.x)*sx,y:anchor.y+(center.y-anchor.y)*sy});
    const next=resize(a,a.width*sx,a.height*sy);
    return {...next,x:target.x-next.width/2,y:target.y-next.height/2,weight:a.weight*Math.sqrt(sx*sy),...(group.length>1&&a.fontSize?{fontSize:a.fontSize*sx}:{})};
  });
}
export function visibleAngle(a:Annotation,m:Matrix){return (a.angle||0)+Math.atan2(m[1],m[0])*180/Math.PI;}
export function uprightAt(point:Point,m:Matrix,base:Annotation):Annotation {
  const angle=-Math.atan2(m[1],m[0])*180/Math.PI,a={...base,angle,x:0,y:0};
  const corner=transform(annotationMatrix(a),{x:0,y:0});return {...a,x:point.x-corner.x,y:point.y-corner.y};
}

// Compatibility alias for existing callers and stored text orientation tests.
export const uprightTextAt=uprightAt;
export function screenRotationControl(frame:Annotation,m:Matrix,offset=48,visible?:{top:number;left:number;right:number}){
  const ps=annotationCorners(frame).map(p=>transform(m,p)),left=Math.min(...ps.map(p=>p.x)),right=Math.max(...ps.map(p=>p.x)),top=Math.min(...ps.map(p=>p.y));
  const x=visible?Math.max(visible.left+22,Math.min(visible.right-22,(left+right)/2)):(left+right)/2,y=visible?Math.max(visible.top+22,top-offset):top-offset;
  return {anchor:inverse(m,{x:(left+right)/2,y:top}),handle:inverse(m,{x,y})};
}
