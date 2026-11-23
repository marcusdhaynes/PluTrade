import type {ConditionalOrder} from '../types/conditionalOrders';
import type {PaperAccountsState} from './paperAccounts';
import {ruleCanActivate} from './conditionalSafety';

/** One saved copy per paper ledger. No automatic transfer to a broker account. */
export function routeConditionalRuleToPaperAccounts(
  state:PaperAccountsState,order:ConditionalOrder
):PaperAccountsState{
  const all=order.accountScope==='all_paper';
  const selected=order.accountId||state.activeId;
  if(!all&&!state.accounts.some(record=>record.id===selected))
    throw new Error('Selected paper account does not exist.');
  const valid=ruleCanActivate(order);
  const accounts=state.accounts.map(record=>{
    const target=all||record.id===selected;
    const idx=record.orders.findIndex(existing=>existing.id===order.id);
    if(!target){
      // Deactivate old copies (even if they were single-account) when moving
      // a revised rule to another ledger. Retain their execution history.
      if(idx<0||record.orders[idx].status==='paused')return record;
      return {...record,orders:record.orders.map((item,i)=>i===idx?
        {...item,status:'paused' as const}:item)};
    }
    const prepared:ConditionalOrder={...order,accountId:record.id,
      accountScope:all?'all_paper':'single',
      status:valid?'active':'paused'};
    if(idx<0)return {...record,orders:[prepared,...record.orders]};
    const old=record.orders[idx];
    const updated:ConditionalOrder={...prepared,
      priorTriggerCount:(old.priorTriggerCount||0)+old.triggerCount,
      rearmCount:(old.rearmCount||0)+1,
      triggerCount:0,lastTriggeredAt:undefined,lastConditionSatisfied:false,
      status:!valid||old.status==='paused'?'paused':'active'};
    return {...record,orders:record.orders.map((item,i)=>i===idx?updated:item)};
  });
  return {...state,accounts};
}
