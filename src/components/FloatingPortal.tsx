import React,{useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

type Placement='bottom-start'|'bottom-end'|'top-end'|'right-start';
interface FloatingPortalProps {
  anchor:React.RefObject<HTMLElement|null>;
  children:React.ReactNode;
  id?:string;
  role?:'dialog'|'menu';
  ariaLabel?:string;
  className?:string;
  width?:number;
  zIndex?:number;
  placement?:Placement;
}
/** Draw transient tool windows in the document-level overlay layer so that
 * chart canvases, sidebars, clipped scroll containers and sticky headers
 * cannot cover them. Positioning follows the anchor on scroll and resize. */
export function FloatingPortal({
  anchor,children,id,role='dialog',ariaLabel,className='',width=290,zIndex=1400,placement='bottom-end'
}:FloatingPortalProps){
  const popup=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState<{top:number;left:number;maxHeight:number;ready:boolean}>({
    top:0,left:0,maxHeight:240,ready:false
  });
  useLayoutEffect(()=>{
    let raf=0;
    const place=()=>{
      const rect=anchor.current?.getBoundingClientRect();
      if(!rect)return;
      const vw=window.innerWidth,vh=window.innerHeight,pad=8;
      const actualWidth=Math.min(width,vw-pad*2);
      const panelHeight=popup.current?.offsetHeight||300;
      const spaceBelow=vh-rect.bottom-pad*2;
      const spaceAbove=rect.top-pad*2;
      const flyout=placement==='right-start';
      const flip=!flyout&&(placement==='top-end'||(spaceBelow<Math.min(panelHeight,300)&&spaceAbove>spaceBelow));
      // Menus opening near the bottom slide upward, then scroll within the
      // remaining viewport. Do not let maxHeight grow below the screen edge.
      const flyoutTop=Math.max(pad,Math.min(rect.top,vh-pad-Math.min(120,Math.max(90,panelHeight))));
      const availableHeight=Math.max(90,flyout?vh-flyoutTop-pad:flip?spaceAbove:spaceBelow);
      const maxHeight=Math.min(vh-pad*2,availableHeight);
      const top=flyout?flyoutTop:flip?
        Math.max(pad,rect.top-Math.min(panelHeight,maxHeight)-4):
        Math.min(vh-pad,rect.bottom+4);
      const desiredLeft=flyout?
        (vw-rect.right>=actualWidth+pad+4?rect.right+4:rect.left-actualWidth-4):
        placement==='bottom-start'?rect.left:rect.right-actualWidth;
      const left=Math.max(pad,Math.min(desiredLeft,vw-actualWidth-pad));
      setPosition(prev=>prev.ready&&prev.top===top&&prev.left===left&&prev.maxHeight===maxHeight?
        prev:{top,left,maxHeight,ready:true});
    };
    const reposition=()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(place);
    };
    place();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(reposition);
    if(popup.current)observer?.observe(popup.current);
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    return ()=>{
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize',reposition);
      window.removeEventListener('scroll',reposition,true);
    };
  },[anchor,placement,width]);
  if(typeof document==='undefined')return null;
  return createPortal(<div ref={popup} id={id} role={role} aria-label={ariaLabel}
    className={className}
    style={{position:'fixed',zIndex,top:position.top,left:position.left,
      width:'min('+width+'px, calc(100vw - 16px))',
      maxHeight:position.maxHeight,overflowY:'auto',
      visibility:position.ready?'visible':'hidden'}}>
    {children}
  </div>,document.body);
}

/** Top-level viewport overlay host for popups and dialogs that must escape
 * clipped chart/toolbar containers and their independent stacking contexts.
 * The wrapper is intentionally not positioned: fixed descendants resolve
 * against the viewport, and no invisible layer intercepts chart interactions. */
export function ViewportPortal({children}:{children:React.ReactNode}){
  if(typeof document==='undefined')return null;
  return createPortal(
    <div data-plutrade-viewport-portal="" className="font-sans text-[#d1d4dc]">
      {children}
    </div>,
    document.body
  );
}
