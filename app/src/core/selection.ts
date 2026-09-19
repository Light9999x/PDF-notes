import { annotationMatrix, transform, annotationCorners, segmentDistance, sweptHit, contains } from './geometry';
import { heads, objects, type Annotation, type EditRequest, type NoteDocument, type Point } from './model';

const EPS=1e-7;
type Edge=[Point,Point];
export type Region={points:Point[];edges:Edge[]};
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const sub=(a:Point,b:Point)=>({x:a.x-b.x,y:a.y-b.y});
const lerp=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const parameter=(p:Point,a:Point,b:Point)=>Math.abs(b.x-a.x)>Math.abs(b.y-a.y)?(p.x-a.x)/(b.x-a.x):(p.y-a.y)/(b.y-a.y);
function cuts(a:Point,b:Point,c:Point,d:Point):number[]{
  const r=sub(b,a),s=sub(d,c),den=cross(r,s),delta=sub(c,a);
  if(Math.abs(den)>EPS){const t=cross(delta,s)/den,u=cross(delta,r)/den;return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?[Math.max(0,Math.min(1,t))]:[];}
  if(Math.abs(cross(delta,r))>EPS)return [];
  return [parameter(c,a,b),parameter(d,a,b)].filter(t=>Number.isFinite(t)&&t>=0&&t<=1);
}
function intervals(a:Point,b:Point,edges:Edge[]){return [...new Set([0,1,...edges.flatMap(([c,d])=>cuts(a,b,c,d))])].sort((x,y)=>x-y);}
function onEdge(p:Point,a:Point,b:Point){return segmentDistance(p,p,a,b)<=EPS;}
export function regionContains(region:Region,p:Point,includeBoundary=true):boolean {
  let inside=false;
  for(const [a,b] of region.edges){
    if(onEdge(p,a,b))return includeBoundary;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export function makeRegion(points:Point[]):Region {
  const raw:Edge[]=points.map((a,i)=>[a,points[(i+1)%points.length]] as Edge).filter(([a,b])=>Math.hypot(a.x-b.x,a.y-b.y)>EPS);
  // Split crossings and overlaps, then cancel duplicate edges modulo two. This
  // matches SVG evenodd, including holes and paths retraced in either direction.
  const unique=new Map<string,Edge>();
  const key=(p:Point)=>`${p.x.toFixed(6)},${p.y.toFixed(6)}`;
  for(const [a,b] of raw){const ts=intervals(a,b,raw);for(let i=1;i<ts.length;i++){
    const c=lerp(a,b,ts[i-1]),d=lerp(a,b,ts[i]);if(Math.hypot(c.x-d.x,c.y-d.y)<EPS)continue;
    const k=[key(c),key(d)].sort().join('|');if(unique.has(k))unique.delete(k);else unique.set(k,[c,d]);
  }}
  return {points,edges:[...unique.values()]};
}
export function rectangleRegion(a:Point,b:Point){return makeRegion([{x:a.x,y:a.y},{x:b.x,y:a.y},{x:b.x,y:b.y},{x:a.x,y:b.y}]);}
export function validRegion(region:Region):boolean {
  const points=region.edges.flat();if(points.length<6)return false;
  const a=points[0],b=points.find(p=>Math.hypot(p.x-a.x,p.y-a.y)>EPS);return !!b&&points.some(c=>Math.abs(cross(sub(b,a),sub(c,a)))>EPS);
}
export function hitAnnotation(a:Annotation,p:Point,tolerance=3):boolean {
  return a.kind==='pen'||a.kind==='highlight'?sweptHit(a,p,p,tolerance):contains(a,p);
}
export type SelectedObject={id:string;head:string;value:Annotation};
export function editableObjects(doc:NoteDocument):SelectedObject[]{return objects(doc).flatMap(o=>{
  const h=o.versions[0],v=h?.value;return o.versions.length===1&&v&&v.kind!=='document'?[{id:o.id,head:h.id,value:v}]:[];
});}
export function selectRegion(doc:NoteDocument,page:number,region:Region){
  const selected=editableObjects(doc).filter(o=>o.value.page===page&&intersectsRegion(o.value,region));
  const skipped=objects(doc).filter(o=>o.versions.length>1&&o.versions.some(v=>v.value&&v.value.kind!=='document'&&v.value.page===page&&intersectsRegion(v.value,region))).length;
  return {selected,skipped};
}
export function selectionChanges(selection:SelectedObject[],change:(a:Annotation)=>Annotation|null):EditRequest[]{
  return selection.map(o=>({id:o.id,expected:[o.head],value:change(o.value)}));
}
export function selectionIsCurrent(doc:NoteDocument,selection:SelectedObject[]){return selection.every(o=>{const h=heads(doc,o.id);return h.length===1&&h[0].id===o.head;});}
export function commonValue<K extends keyof Annotation>(selection:SelectedObject[],key:K):Annotation[K]|undefined {
  const value=(a:Annotation)=>key==='angle'?a.angle||0:key==='writingMode'?a.writingMode||'horizontal-tb':a[key];
  const first=selection[0]&&value(selection[0].value);
  return selection.length&&selection.every(o=>value(o.value)===first)?first as Annotation[K]:undefined;
}
export type CommonPatch=Partial<Pick<Annotation,'color'|'opacity'|'weight'|'fontSize'|'writingMode'|'angle'>>;
export function applyCommon(selection:SelectedObject[],patch:CommonPatch):EditRequest[]{
  const allText=selection.every(o=>o.value.kind==='text'),allStrokes=selection.every(o=>o.value.kind==='pen'||o.value.kind==='highlight');
  for(const key of Object.keys(patch)){
    if(!['color','opacity',...(allText?['fontSize','writingMode','angle']:[]),...(allStrokes?['weight']:[])].includes(key))throw new Error('此屬性不適用於整個選取集合。');
    if(key==='color'&&selection.some(o=>o.value.kind==='image'))throw new Error('圖片不支援顏色屬性。');
  }
  return selectionChanges(selection,a=>({...a,...patch}));
}

export function intersectsRegion(a:Annotation,region:Region):boolean {
  if(!validRegion(region))return false;
  if(a.kind==='pen'||a.kind==='highlight'){
    const ps=(a.points||[]).map(p=>transform(annotationMatrix(a),p));
    return ps.some((p,i)=>regionContains(region,p)||region.edges.some(([c,d])=>segmentDistance(ps[Math.max(0,i-1)],p,c,d)<=a.weight/2+EPS));
  }
  const cs=annotationCorners(a);
  return cs.some(p=>regionContains(region,p))||region.edges.some(([c,d])=>contains(a,c)||cs.some((p,i)=>segmentDistance(p,cs[(i+1)%4],c,d)<=EPS));
}
