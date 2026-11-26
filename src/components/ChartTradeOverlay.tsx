import React,{useEffect,useRef,useState} from 'react';
import type {PaperPosition} from '../types';
import type {ChartExitLevel} from '../services/chartPositionLevels';
import type {ChartExitEdit} from '../services/chartExitEditing';
import {useExclusiveWindow} from '../services/exclusiveWindow';

type Kind='sl'|'tp';
type Handle={kind:Kind;levelId?:string};
type Props={
  position:PaperPosition;positionY:number|null;levels:Array<ChartExitLevel&{y:number}>;
  height:number;axisWidth:number;digits:number;currency:string;
  coordinateToPrice:(y:number)=>number|null;
  onEdit?:(id:string,edit:ChartExitEdit)=>string|null;
  onAdvanced?:(id:string,kind:Kind)=>void;onClose?:(id:string)=>void;
};
type Menu=Handle&{x:number;y:number};
type Drag=Handle&{pointer:number;startX:number;startY:number;y:number;moved:boolean};
const tint=(kind:Kind)=>kind==='sl'?'#f05e74':'#00dca0';
export function ChartTradeOverlay({position,positionY,levels,height,axisWidth,digits,currency,coordinateToPrice,onEdit,onAdvanced,onClose}:Props){
  const root=useRef<HTMLDivElement>(null);
  const dragRef=useRef<Drag|null>(null);
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null);
  const held=useRef(false);
  const [preview,setPreview]=useState<Drag|null>(null);
  const [menu,setMenu]=useExclusiveWindow<Menu|null>(null);
  const [price,setPrice]=useState('');
  const [percent,setPercent]=useState('0.5');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const clearHold=()=>{if(hold.current!==null){clearTimeout(hold.current);hold.current=null;}};
  useEffect(()=>()=>clearHold(),[]);
  useEffect(()=>{setMenu(null);setPreview(null);dragRef.current=null;clearHold();},[position.id]);
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(id);},[notice]);
  useEffect(()=>{
    if(!menu)return;
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(null);};
    const outside=(e:PointerEvent)=>{if(!(e.target instanceof Element)||!e.target.closest('[data-chart-exit-menu],[data-chart-exit-handle]'))setMenu(null);};
    window.addEventListener('keydown',escape);window.addEventListener('pointerdown',outside,true);
    return()=>{window.removeEventListener('keydown',escape);window.removeEventListener('pointerdown',outside,true);};
  },[menu,setMenu]);
  const clampY=(y:number)=>Math.max(10,Math.min(Math.max(10,height-34),y));
  const origin=positionY===null?null:clampY(positionY);
  const selected=(h:Handle)=>levels.find(l=>l.kind===h.kind&&(!h.levelId||l.id===h.levelId));
  const openMenu=(h:Handle,x:number,y:number)=>{
    const r=root.current?.getBoundingClientRect();if(!r)return;
    setPrice(String(selected(h)?.price??''));setPercent(String(position.trailingPercent??0.5));setError('');
    setMenu({...h,x:Math.max(2,Math.min(x-r.left,r.width-230)),y:Math.max(2,Math.min(y-r.top,r.height-215))});
  };
  const apply=(edit:ChartExitEdit,close=true)=>{
    const result=onEdit?onEdit(position.id,edit):'Chart editing unavailable.';
    if(result){setError(result);setNotice(result);return false;}
    setError('');if(close)setMenu(null);return true;
  };
  const handlers=(h:Handle)=>({
    onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{
      if(e.button!==0)return;e.stopPropagation();e.preventDefault();clearHold();held.current=false;
      e.currentTarget.setPointerCapture(e.pointerId);
      const r=root.current?.getBoundingClientRect();if(!r)return;
      dragRef.current={...h,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,y:clampY(e.clientY-r.top),moved:false};
      hold.current=setTimeout(()=>{held.current=true;dragRef.current=null;openMenu(h,e.clientX,e.clientY);},480);
    },
    onPointerMove:(e:React.PointerEvent<HTMLButtonElement>)=>{
      const d=dragRef.current;if(!d||d.pointer!==e.pointerId)return;
      if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>5){clearHold();d.moved=true;}
      if(!d.moved)return;e.stopPropagation();
      const r=root.current?.getBoundingClientRect();if(!r)return;
      d.y=clampY(e.clientY-r.top);setPreview({...d});setMenu(null);
    },
    onPointerUp:(e:React.PointerEvent<HTMLButtonElement>)=>{
      e.stopPropagation();clearHold();const d=dragRef.current;dragRef.current=null;setPreview(null);
      if(held.current){held.current=false;return;}
      if(!d||!d.moved){if(menu?.kind===h.kind&&menu.levelId===h.levelId)setMenu(null);else openMenu(h,e.clientX,e.clientY);return;}
      if(origin!==null&&Math.abs(d.y-origin)<=10){if(selected(h))apply({action:'remove',kind:h.kind,levelId:h.levelId});return;}
      const raw=coordinateToPrice(d.y);
      if(raw===null||!Number.isFinite(raw)){setNotice('No chart price at this location.');return;}
      const next=Number(raw.toFixed(Math.max(0,Math.min(10,digits))));
      apply({action:'place',kind:h.kind,levelId:h.levelId,price:next});
    },
    onPointerCancel:()=>{clearHold();dragRef.current=null;setPreview(null);},
    onContextMenu:(e:React.MouseEvent<HTMLButtonElement>)=>{e.preventDefault();e.stopPropagation();clearHold();dragRef.current=null;setPreview(null);openMenu(h,e.clientX,e.clientY);},
    onKeyDown:(e:React.KeyboardEvent<HTMLButtonElement>)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();openMenu(h,r.left,r.top);}},
  });
  const controls=(kind:Kind)=>{
    const matches=levels.filter(l=>l.kind===kind);
    const h:Handle={kind,levelId:matches.length===1?matches[0].id:undefined};
    return <button type="button" data-chart-exit-handle={kind} data-attached={matches.length?'false':'true'}
      aria-label={kind==='sl'?'Edit or drag stop loss':'Edit or drag take profit'}
      title={matches.length?'Drag to adjust; drop on entry to remove; right-click to edit':'Drag to place; right-click to edit'}
      {...handlers(h)} className="chart-exit-handle" style={{color:tint(kind),borderColor:tint(kind),borderStyle:matches.length?'solid':'dotted'}}>{kind.toUpperCase()}</button>;
  };
  const pnlColor=position.unrealizedPnL>=0?'#00dca0':'#f05e74';
  const right=Math.max(26,axisWidth)+4;
  return <div ref={root} className="absolute inset-0 pointer-events-none z-30" data-chart-trade-overlay={position.id}>
    {origin!==null&&<>
      {positionY!==null&&positionY>=0&&positionY<=height-24&&<div className="absolute left-0 border-b" style={{top:positionY,right,borderColor:'#00b889'}}/>}
      <div className="chart-position-badge" style={{top:origin,right}}>
        {controls('tp')}{controls('sl')}
        <span className="chart-position-values" style={{borderColor:pnlColor,color:pnlColor}}>
          <span>{position.qty.toLocaleString()}</span>
          <span aria-label="Unrealized profit or loss">{position.unrealizedPnL>=0?'+':''}{position.unrealizedPnL.toFixed(2)} {currency}</span>
          <button type="button" title="Close Position" onClick={e=>{e.stopPropagation();onClose?.(position.id);}}>×</button>
        </span>
      </div>
    </>}
    {levels.map(level=>{
      const h:Handle={kind:level.kind,levelId:level.id};
      const y=clampY(level.y);const color=tint(level.kind);
      return <React.Fragment key={level.id}>
        {level.y>=0&&level.y<=height-24&&<div className="absolute left-0 border-b border-dashed" style={{top:y,right,borderColor:color}}/>}
        <button type="button" data-chart-exit-handle={level.kind} aria-label={'Edit '+level.label+' at '+level.price}
          {...handlers(h)} className="chart-exit-level" title="Drag to adjust; drop on entry to remove; right-click for settings"
          style={{top:y,right,color,borderColor:color}}>{level.kind.toUpperCase()} {level.price.toFixed(digits)}{level.quantity!==undefined?' · '+level.quantity.toLocaleString():''}</button>
      </React.Fragment>;
    })}
    {preview&&<div className="absolute left-0 border-b border-dashed" style={{top:preview.y,right,borderColor:tint(preview.kind)}}><span className="absolute right-0 -translate-y-full text-[10px]" style={{color:tint(preview.kind)}}>{origin!==null&&Math.abs(preview.y-origin)<=10?'Remove':coordinateToPrice(preview.y)?.toFixed(digits)}</span></div>}
    {menu&&<div role="dialog" aria-label={menu.kind==='sl'?'Stop loss chart settings':'Take profit chart settings'} data-chart-exit-menu className="chart-exit-menu" style={{left:menu.x,top:menu.y}} onPointerDown={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between"><strong>{menu.kind==='sl'?'Stop Loss':'Take Profit'}</strong><button type="button" onClick={()=>setMenu(null)} aria-label="Close exit settings">×</button></div>
      <label>Exact Price <input aria-label="Exact exit price" type="number" min="0" step="any" value={price} onChange={e=>setPrice(e.target.value)}/></label>
      <button type="button" onClick={()=>apply({action:'place',kind:menu.kind,levelId:menu.levelId,price:Number(price)})}>Save Price</button>
      {menu.kind==='sl'&&<>
        <label><input type="checkbox" checked={!!position.trailingPercent} onChange={e=>apply({action:'trailing',enabled:e.target.checked,percent:Number(percent)},false)}/> Trailing Stop</label>
        <label>Trail % <input aria-label="Trailing percent" type="number" min="0.01" max="99.99" step="0.01" value={percent} onChange={e=>setPercent(e.target.value)}/></label>
        {position.trailingPercent!==undefined&&<button type="button" onClick={()=>apply({action:'trailing',enabled:true,percent:Number(percent)},false)}>Save Trailing %</button>}
        <label><input type="checkbox" checked={!!position.dynamicTrailing} onChange={e=>apply({action:'intelligent',enabled:e.target.checked},false)}/> Intelligent Trailing</label>
        {position.dynamicTrailing&&<small>Automatic ATR protection · never loosens the stop.</small>}
      </>}
      <div className="flex gap-1"><button type="button" onClick={()=>apply({action:'remove',kind:menu.kind,levelId:menu.levelId})}>Remove</button><button type="button" onClick={()=>{setMenu(null);onAdvanced?.(position.id,menu.kind);}}>Advanced</button></div>
      {error&&<small role="alert" className="text-[#ff9eac]">{error}</small>}
    </div>}
    {notice&&<div role="alert" className="absolute bottom-8 left-2 rounded bg-[#3b2028] p-2 text-[10px] text-[#ffbac4]">{notice}</div>}
  </div>;
}
