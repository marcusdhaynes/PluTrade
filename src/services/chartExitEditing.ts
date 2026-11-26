import type {PaperPortfolio} from './paperTrading';
import {enableTrailingPaperStop,disableTrailingPaperStop} from './paperTrading';
import {attachDynamicTrailing,disableDynamicTrailing,DEFAULT_DYNAMIC_TRAIL} from './dynamicTrailing';

export type ChartExitEdit =
  | {action:'place';kind:'sl'|'tp';price:number;levelId?:string}
  | {action:'remove';kind:'sl'|'tp';levelId?:string}
  | {action:'trailing';enabled:boolean;percent?:number}
  | {action:'intelligent';enabled:boolean};

/** Update only the selected exit, preserving the other exit and remaining quantities.
 * Active trailing stops never move in an adverse direction. */
export function editChartExit(input:PaperPortfolio,id:string,edit:ChartExitEdit):PaperPortfolio {
  const p=input.positions.find(x=>x.id===id);
  if(!p)throw new Error('Position is no longer open.');
  if(edit.action==='trailing'){
    return edit.enabled?enableTrailingPaperStop(input,id,edit.percent??0.5):disableTrailingPaperStop(input,id);
  }
  if(edit.action==='intelligent'){
    if(!edit.enabled)return disableDynamicTrailing(input,id);
    // Provisional one-percent protection until verified ATR history arrives.
    const base=Number.isFinite(p.currentPrice)&&p.currentPrice>0?p.currentPrice:p.entryPrice;
    const provisional=p.side==='Long'?base*0.99:base*1.01;
    const seeded={...input,positions:input.positions.map(x=>x.id!==id?x:{
      ...x,sl:x.sl===undefined?provisional:x.side==='Long'?Math.max(x.sl,provisional):Math.min(x.sl,provisional)
    })};
    return attachDynamicTrailing(seeded,id,{...DEFAULT_DYNAMIC_TRAIL,intrabar:true});
  }
  if(edit.action==='remove'){
    return {...input,positions:input.positions.map(x=>{
      if(x.id!==id)return x;
      if(edit.kind==='sl')return {...x,sl:undefined,trailingPercent:undefined,trailingAnchor:undefined,dynamicTrailing:undefined};
      if(edit.levelId&&x.tpLevels?.length){
        if(!x.tpLevels.some(t=>t.id===edit.levelId))throw new Error('Target no longer exists.');
        const remaining=x.tpLevels.filter(t=>t.id!==edit.levelId);
        return {...x,tp:undefined,tpLevels:remaining.length?remaining:undefined};
      }
      return {...x,tp:undefined,tpLevels:undefined};
    })};
  }
  const price=edit.price;
  if(!Number.isFinite(price)||price<=0)throw new Error('Enter a positive price.');
  if(edit.kind==='sl'){
    if(p.side==='Long'?price>=p.currentPrice:price<=p.currentPrice)throw new Error('Stop must be on the protective side of the current market price.');
    if((p.trailingPercent||p.dynamicTrailing)&&p.sl!==undefined&&(p.side==='Long'?price<p.sl:price>p.sl))throw new Error('Disable trailing before loosening its ratcheted stop.');
    return {...input,positions:input.positions.map(x=>x.id===id?{...x,sl:price}:x)};
  }
  if(p.side==='Long'?price<=Math.max(p.entryPrice,p.currentPrice):price>=Math.min(p.entryPrice,p.currentPrice))throw new Error('Target must be beyond entry and current price in the profitable direction.');
  if(p.tpLevels?.length){
    if(!edit.levelId||!p.tpLevels.some(t=>t.id===edit.levelId))throw new Error('Select an individual target to move.');
    return {...input,positions:input.positions.map(x=>x.id===id?{...x,tpLevels:x.tpLevels?.map(t=>t.id===edit.levelId?{...t,price}:t)}:x)};
  }
  return {...input,positions:input.positions.map(x=>x.id===id?{...x,tp:price}:x)};
}
