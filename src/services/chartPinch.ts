/** Pure two-finger zoom classifier. Pinch angle determines the axes; magnitude
 * determines zoom. Locking axes on touch-start avoids mid-gesture jitter. */
export type PinchAxis='horizontal'|'vertical'|'both';
export type Finger={x:number;y:number};
export interface PinchGeometry{axis:PinchAxis;distance:number;midX:number;midY:number}
export function pinchGeometry(a:Finger,b:Finger):PinchGeometry{
  const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
  const angle=Math.atan2(dy,dx)*180/Math.PI;
  return {
    axis:angle<=30?'horizontal':angle>=60?'vertical':'both',
    distance:Math.max(1,Math.hypot(dx,dy)),
    midX:(a.x+b.x)/2,midY:(a.y+b.y)/2,
  };
}
export function pinchFactor(startDistance:number,nextDistance:number):number{
  if(!Number.isFinite(startDistance)||!Number.isFinite(nextDistance)||startDistance<=0)return 1;
  return Math.max(0.2,Math.min(5,nextDistance/startDistance));
}
export function scaleAboutAnchor(range:{from:number;to:number},anchor:number,factor:number){
  const safe=pinchFactor(1,factor);
  return {from:anchor+(range.from-anchor)/safe,to:anchor+(range.to-anchor)/safe};
}
