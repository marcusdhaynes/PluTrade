import assert from 'node:assert/strict';
import type {Asset,Drawing} from '../types';
import type {ConditionalOrder,SingleCondition,OrderExecutionDetails} from '../types/conditionalOrders';
import {ruleConditionMet,ruleConditionsMet,ruleEligibleOnTick} from './conditionalEvaluation';
import {conditionSupported,ruleCanActivate} from './conditionalSafety';
import {drawingConditionMet,drawingPriceAt} from './drawingConditions';
import {initialPaperAccounts,createPaperAccountRecord} from './paperAccounts';
import {routeConditionalRuleToPaperAccounts} from './conditionalAccountRouting';
import {quantityForConditional} from './conditionalExecution';
import {placePaperPosition,emptyPaperPortfolio} from './paperTrading';

const at=1_700_000_000_000;
const a:Asset={symbol:'BTCUSD',name:'BTC/USD',source:'Coinbase',exchange:'Coinbase',
 category:'crypto',marketType:'spot',price:100,change24h:0,changePercent24h:0,
 high24h:102,low24h:98,volume24h:'12',digits:2,currency:'USD',
 quoteStatus:'live',quoteUpdatedAt:at,streamConnected:true};
const equity=emptyPaperPortfolio();
const cond=(type:SingleCondition['dependencyType'],op:SingleCondition['operator'],
  threshold?:number):SingleCondition=>({id:'condition-1',dependencyType:type,
  dependencyLabel:'Test',operator:op,thresholdValue:threshold});
const rule=(conditions:SingleCondition[],logic:ConditionalOrder['conditionLogic']='IF'):ConditionalOrder=>({
 id:'rule-1',symbol:a.symbol,exchange:'Coinbase',marketType:'spot',
 conditionLogic:logic,conditions,action:'enter_long',
 execution:{orderType:'market',size:99,sizeUnit:'equity_percent'},
 title:'Cross Trendline X → Enter 99% of Equity',status:'active',
 createdAt:at-1000,triggerCount:0,maxTriggers:logic==='WHILE'||logic==='WHENEVER'?9999:1,
});
const line:Drawing={id:'trendline-X',type:'trendline',points:[{time:100,price:10},{time:200,price:20}],
  color:'#fff',lineWidth:2,label:'Trendline X'};
const rectangle:Drawing={id:'zone-1',type:'rectangle',points:[{time:100,price:10},{time:200,price:20}],
  color:'#fff',lineWidth:2,label:'Demand zone'};
const checks:[string,()=>void][]=[
 ['IF trendline crossing either direction is true only on a verified crossing',()=>{
   const d=cond('drawing','crosses_either');d.dependencyId=line.id;
   assert.equal(ruleConditionMet(d,{...a,price:16,quoteUpdatedAt:150000},13,equity,new Set(),[line],140000),true);
   assert.equal(ruleConditionMet(d,{...a,price:13,quoteUpdatedAt:150000},16,equity,new Set(),[line],140000),true);
   assert.equal(ruleConditionMet(d,{...a,price:16,quoteUpdatedAt:150000},15,equity,new Set(),[line],140000),false);
   assert.equal(ruleConditionMet(d,{...a,price:16,quoteUpdatedAt:150000},undefined,equity,new Set(),[line],undefined),false);
 }],
 ['rectangle zone enter, exit, inside/outside are time-bounded',()=>{
   assert.equal(drawingConditionMet(rectangle,'enters_zone',15,25,150,140),true);
   assert.equal(drawingConditionMet(rectangle,'exits_zone',25,15,150,140),true);
   assert.equal(drawingConditionMet(rectangle,'inside_zone',15,undefined,150,undefined),true);
   assert.equal(drawingConditionMet(rectangle,'outside_zone',25,undefined,150,undefined),true);
   assert.equal(drawingConditionMet(rectangle,'enters_zone',15,25,250,240),false);
   assert.equal(drawingPriceAt(rectangle,250,'greater_than'),undefined);
 }],
 ['rule rejects missing drawing and cannot inherit another venue',()=>{
   const d={...cond('drawing','crosses_above'),dependencyId:'missing'};
   assert.equal(ruleConditionsMet(rule([d]),{...a,price:16,quoteUpdatedAt:150000},13,equity,new Set(),[line],140000),false);
   assert.equal(ruleConditionsMet(rule([d]),{...a,source:'Kraken'},13,equity,new Set(),[line],140000),false);
   assert.equal(conditionSupported({...d,operator:'not_existing' as any}),false);
 }],
 ['account equity / free funds compare the selected paper ledger',()=>{
   assert.equal(ruleConditionMet(cond('account','equity_greater_than',9000),a,99,equity,new Set()),true);
   assert.equal(ruleConditionMet(cond('account','equity_less_than',9000),a,99,equity,new Set()),false);
   assert.equal(ruleConditionMet(cond('account','available_greater_than',9000),a,99,equity,new Set()),true);
   assert.equal(ruleConditionMet(cond('account','available_less_than',9000),a,99,equity,new Set()),false);
 }],
 ['UTC session respects wrap-around and strict boundaries',()=>{
   const market={...a,quoteUpdatedAt:Date.UTC(2026,10,22,23,30)};
   const c={...cond('utc_session','in_utc_hours',22),secondaryValue:2};
   assert.equal(ruleConditionMet(c,market,99,equity,new Set()),true);
   assert.equal(ruleConditionMet({...c,operator:'outside_utc_hours'},market,99,equity,new Set()),false);
   assert.equal(ruleConditionMet(c,{...market,quoteUpdatedAt:Date.UTC(2026,10,22,14,0)},99,equity,new Set()),false);
   assert.equal(conditionSupported({...c,secondaryValue:24}),false);
 }],
 ['position existence is bound to the exact market and optional position id',()=>{
   const p=placePaperPosition(emptyPaperPortfolio(),a,'Long',1,1,undefined,undefined,at);
   assert.equal(ruleConditionMet(cond('position','position_exists'),a,99,p,new Set()),true);
   assert.equal(ruleConditionMet({...cond('position','position_exists'),dependencyId:'unknown'},a,99,p,new Set()),false);
   assert.equal(ruleConditionMet(cond('position','position_exists'),{...a,source:'Kraken'},99,p,new Set()),false);
 }],
 ['IF AND requires all; IF OR accepts either',()=>{
   const conditions=[cond('price','greater_than',90),cond('account','equity_greater_than',20000)];
   assert.equal(ruleConditionsMet(rule(conditions,'IF (AND)'),a,99,equity,new Set()),false);
   assert.equal(ruleConditionsMet(rule(conditions,'IF (OR)'),a,99,equity,new Set()),true);
 }],
 ['WHILE is evaluated continuously but fires once per false-true activation',()=>{
   const o=rule([cond('price','greater_than',95),cond('account','equity_greater_than',9000)],'WHILE');
   assert.equal(ruleCanActivate(o),true);
   assert.equal(ruleConditionsMet(o,a,98,equity,new Set()),true);
   assert.equal(ruleEligibleOnTick(o,true,at),true);
   assert.equal(ruleEligibleOnTick({...o,lastConditionSatisfied:true,lastTriggeredAt:at},true,at+20001),false);
   assert.equal(ruleEligibleOnTick({...o,lastConditionSatisfied:false,lastTriggeredAt:at},true,at+20001),true);
   assert.equal(ruleConditionsMet(o,{...a,price:90},100,equity,new Set()),false);
 }],
 ['99 percent equity means 99 percent of equity not leveraged available funds',()=>{
   const spec:OrderExecutionDetails={orderType:'market',size:99,sizeUnit:'equity_percent'};
   assert.equal(quantityForConditional(spec,equity,a,100),99);
   assert.equal(quantityForConditional({...spec,size:100},equity,a,100),100);
   assert.throws(()=>quantityForConditional({...spec,size:101},equity,a,100),/100%/);
 }],
 ['all-paper route clones rule to every independent ledger without touching balances',()=>{
   const state=initialPaperAccounts();
   state.accounts.push(createPaperAccountRecord('Secondary'));
   const r=routeConditionalRuleToPaperAccounts(state,{...rule([cond('price','greater_than',90)]),accountScope:'all_paper'});
   assert.equal(r.accounts.length,2);
   assert.ok(r.accounts.every(a=>a.orders.length===1&&a.orders[0].accountId===a.id));
   assert.equal(r.accounts[0].portfolio.account.balance,state.accounts[0].portfolio.account.balance);
   assert.equal(r.accounts[1].portfolio.account.balance,state.accounts[1].portfolio.account.balance);
   r.accounts[0].orders[0].triggerCount=1;
   assert.equal(r.accounts[1].orders[0].triggerCount,0);
 }],
 ['revision to a single account pauses old global copies and retains history',()=>{
   const state=initialPaperAccounts();
   state.accounts.push(createPaperAccountRecord('Secondary'));
   const template=rule([cond('price','greater_than',90)]);
   const global=routeConditionalRuleToPaperAccounts(state,{...template,accountScope:'all_paper'});
   const revised=routeConditionalRuleToPaperAccounts(global,{...template,accountScope:'single',
     accountId:global.accounts[1].id});
   assert.equal(revised.accounts[0].orders[0].status,'paused');
   assert.equal(revised.accounts[1].orders[0].status,'active');
   assert.equal(revised.accounts[1].orders[0].rearmCount,1);
   assert.throws(()=>routeConditionalRuleToPaperAccounts(global,{...template,accountId:'fake-account'}),/does not exist/);
 }],
];
for(let round=1;round<=10;round++)for(const [name,check] of checks){
 try{check();}catch(error){throw new Error('Conditional rule round '+round+': '+name,{cause:error});}
}
console.log('IF / WHILE conditional rules: 11 independent scenarios × 10 rounds = 110 scenario runs passed.');
