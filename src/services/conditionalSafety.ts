import {validDynamicTrail} from './dynamicTrailing';
import type {Asset} from '../types';
import type {ConditionalOrder,SingleCondition} from '../types/conditionalOrders';
import {matchesExactMarket} from './marketIdentity';
/** Never execute an unbound legacy order on an identically named market. */
export const ruleMatchesMarket=(o:ConditionalOrder,a:Asset):boolean=>
  !!o.exchange && !!o.marketType && matchesExactMarket(o,a);
export function conditionSupported(c:SingleCondition):boolean {
  if(c.dependencyType==='alert')return c.operator==='triggered'&&!!c.dependencyId;
  if(c.dependencyType==='position')return c.operator==='position_exists'||(
    ['pnl_above_percent','pnl_below_percent'].includes(c.operator)&&
    Number.isFinite(c.thresholdValue));
  if(c.dependencyType==='account')return [
    'equity_greater_than','equity_less_than','available_greater_than','available_less_than'
  ].includes(c.operator)&&Number.isFinite(c.thresholdValue)&&c.thresholdValue!>=0;
  if(c.dependencyType==='utc_session')return
    ['in_utc_hours','outside_utc_hours'].includes(c.operator)&&
    Number.isFinite(c.thresholdValue)&&Number.isFinite(c.secondaryValue)&&
    c.thresholdValue!>=0&&c.thresholdValue!<24&&c.secondaryValue!>=0&&c.secondaryValue!<24&&
    c.thresholdValue!==c.secondaryValue;
  if(c.dependencyType==='drawing')
    return !!c.dependencyId&&['crosses_above','crosses_below','crosses_either','touches','greater_than','less_than',
      'enters_zone','exits_zone','inside_zone','outside_zone'].includes(c.operator);
  if(c.dependencyType==='price')
    return ['crosses_above','crosses_below','crosses_either','touches','greater_than','less_than'].includes(c.operator)
      &&Number.isFinite(c.thresholdValue)&&Number(c.thresholdValue)>0;
  if(c.dependencyType==='indicator')
    return ['rsi14','price_minus_sma20'].includes(c.dependencyId||'')&&
      ['crosses_above','crosses_below','greater_than','less_than'].includes(c.operator)&&
      Number.isFinite(c.thresholdValue)&&
      (c.dependencyId!=='rsi14'||(c.thresholdValue!>=0&&c.thresholdValue!<=100));
  return false;
}
export const ruleCanActivate=(o:ConditionalOrder):boolean=>
  !!o.exchange&&!!o.marketType&&Array.isArray(o.conditions)&&o.conditions.length>0&&
  o.conditions.every(conditionSupported) &&
  ['IF','IF (AND)','IF (OR)','WHENEVER','WHILE'].includes(o.conditionLogic)&&
  ['enter_long','enter_short','exit_long','exit_short','tp','sl_set','sl_trailing',
   'sl_dynamic','reduce_position','increase_position','cancel_all'].includes(o.action)&&
  Number.isFinite(o.execution?.size)&&o.execution.size>0&&
  (!['percent','equity_percent'].includes(o.execution.sizeUnit)||
     o.execution.size<=100)&&
  (o.action!=='sl_dynamic'||validDynamicTrail(o.execution.dynamicTrailing))&&
  (o.action!=='sl_trailing'||(Number.isFinite(o.execution.trailingPercent)&&
     o.execution.trailingPercent!>0&&o.execution.trailingPercent!<100));
