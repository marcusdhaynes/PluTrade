import type {Asset} from '../types';
import type {PaperPortfolio} from './paperTrading';
import type {OrderExecutionDetails} from '../types/conditionalOrders';
import {estimatePaperQty} from './paperOrders';

export function quantityForConditional(
  execution:OrderExecutionDetails,portfolio:PaperPortfolio,market:Asset,price:number
):number{
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(execution.size)||
    execution.size<=0)throw new Error('Conditional size and reference price must be positive.');
  if((execution.sizeUnit==='percent'||execution.sizeUnit==='equity_percent')&&execution.size>100)
    throw new Error('Percentage conditional entry must be at most 100%.');
  if(execution.sizeUnit==='equity_percent')
    return portfolio.account.equity*execution.size/100/price;
  if(execution.sizeUnit==='percent')
    return estimatePaperQty(portfolio,market,execution.size,price);
  if(execution.sizeUnit==='usd')
    return execution.size/price;
  return execution.size;
}
