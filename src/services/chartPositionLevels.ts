import type {PaperPosition} from '../types';

export interface ChartExitLevel{
  id:string;
  kind:'sl'|'tp';
  label:string;
  price:number;
  quantity?:number;
}

/** Show the effective (ratcheted) protective stop, not a fictional second order.
 * Multiple partial targets are represented individually at their actual levels. */
export function chartPositionExitLevels(position?:PaperPosition|null):ChartExitLevel[]{
  if(!position)return [];
  const levels:ChartExitLevel[]=[];
  const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;
  const trailing=positive(position.trailingPercent)&&positive(position.trailingAnchor)?
    (position.side==='Long'?1-position.trailingPercent/100:1+position.trailingPercent/100)*position.trailingAnchor:undefined;
  const stop=positive(position.sl)?position.sl:trailing;
  if(positive(stop)){
    levels.push({id:position.id+'-sl',kind:'sl',
      label:position.dynamicTrailing?'SL · ATR '+position.dynamicTrailing.period+'×'+position.dynamicTrailing.multiplier:
        position.trailingPercent?'SL · Trail '+position.trailingPercent+'%':'Stop Loss',
      price:stop});
  }
  if(position.tpLevels?.length){
    position.tpLevels.forEach((target,index)=>{
      if(positive(target.price)&&positive(target.quantity))
        levels.push({id:target.id,kind:'tp',label:'TP '+(index+1),price:target.price,quantity:target.quantity});
    });
  }else if(positive(position.tp)){
    levels.push({id:position.id+'-tp',kind:'tp',label:'Take Profit',price:position.tp});
  }
  return levels;
}
