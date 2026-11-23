import React,{useEffect,useRef,useState} from 'react';
import type {Asset,OHLCV,Timeframe} from '../types';
import {fetchHistoricalData} from '../services/dataFeed';
import {DEFAULT_BACKTEST,validateHistoricalBacktestBars,type BacktestConfig} from '../services/historicalBacktest';
import {marketIdentity} from '../services/marketIdentity';
import {smaCrossStrategy,rsiRecoveryStrategy,runStrategyLabBacktest,walkForwardSma,
  optimizeSmaCandidates,latestLabSignal,validateLabStrategy,type LabCondition,type LabMetric,type LabOperand,
  type LabResult,type LabRule,type LabStrategy} from '../services/strategyLab';

type Props={asset:Asset;timeframe:Timeframe;markets:Asset[]};
type MatrixRow={key:string;label:string;at?:number;entry?:boolean;exit?:boolean;
  result?:LabResult;error?:string};
type Part='entry'|'exit';
const STORE='plutrade-strategy-lab-v1';
const number=(n:number)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:2}):'—';
const pct=(n:number)=>number(n)+'%';
const baseCondition=():LabCondition=>({left:{metric:'close'},operator:'greater_than',right:{constant:100}});
const metricChoices:LabMetric[]=['close','sma','ema','rsi'];
const operand=(metric:LabMetric):LabOperand=>metric==='close'?{metric}:{metric,period:metric==='rsi'?14:20};
function spark(equity:LabResult['equity']){
 if(equity.length<2)return '';
 const sampled=equity.filter((_,i)=>i%Math.max(1,Math.ceil(equity.length/500))===0);
 const prices=sampled.map(x=>x.equity),low=Math.min(...prices),high=Math.max(...prices);
 return sampled.map((x,i)=>(i/Math.max(1,sampled.length-1)*600).toFixed(1)+','+
   (65-(x.equity-low)/(high-low||1)*60).toFixed(1)).join(' ');
}
function downloadTrades(result:LabResult){
 const rows=[['side','entry_utc','exit_utc','entry_price','exit_price','quantity','net_pnl','exit_reason'].join(','),
  ...result.trades.map(t=>[t.side,new Date(t.entryAt*1000).toISOString(),new Date(t.exitAt*1000).toISOString(),
   t.entryPrice,t.exitPrice,t.quantity,t.netPnL,t.exitReason].join(','))];
 const url=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='plutrade-strategy-trades.csv';
 link.click();URL.revokeObjectURL(url);
}
export const StrategyLabPanel:React.FC<Props>=({asset,timeframe,markets})=>{
 const [history,setHistory]=useState<OHLCV[]>([]);
 const [strategy,setStrategy]=useState<LabStrategy>(smaCrossStrategy);
 const [config,setConfig]=useState<BacktestConfig>({...DEFAULT_BACKTEST});
 const [result,setResult]=useState<LabResult|null>(null);
 const [comparison,setComparison]=useState<LabResult[]>([]);
 const [walk,setWalk]=useState<ReturnType<typeof walkForwardSma>|null>(null);
 const [candidates,setCandidates]=useState<ReturnType<typeof optimizeSmaCandidates>>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [selectedKeys,setSelectedKeys]=useState<string[]>([marketIdentity(asset)]);
 const [picker,setPicker]=useState('');
 const [matrix,setMatrix]=useState<MatrixRow[]>([]);
 const [scanning,setScanning]=useState(false);
 const [showJson,setShowJson]=useState(false);
 const [draft,setDraft]=useState('');
 const request=useRef(0);
 const scanRequest=useRef(0);
 const marketIndex=new Map<string,Asset>([...markets,asset].map((m):[string,Asset]=>[marketIdentity(m),m]));
 const available=[...marketIndex.entries()].filter(([,m])=>m.quoteStatus!=='unavailable').slice(0,200);
 const key=marketIdentity(asset)+'|'+timeframe;
 useEffect(()=>{request.current++;scanRequest.current++;setHistory([]);setResult(null);setComparison([]);setWalk(null);
   setCandidates([]);setMatrix([]);setScanning(false);setSelectedKeys([marketIdentity(asset)]);
   setPicker('');setError('');setMessage('');setLoading(false);},[key]);
 const clear=()=>{scanRequest.current++;setScanning(false);setMatrix([]);
   setResult(null);setComparison([]);setWalk(null);setCandidates([]);setError('');setMessage('');};
 const updateStrategy=(next:LabStrategy)=>{setStrategy(next);clear();};
 const editRule=(part:Part,mutate:(old:LabRule)=>LabRule)=>{
   updateStrategy({...strategy,[part]:mutate(strategy[part])});
 };
 const patchCondition=(part:Part,index:number,patch:Partial<LabCondition>)=>
   editRule(part,r=>({...r,conditions:r.conditions.map((c,i)=>i===index?{...c,...patch}:c)}));
 const load=async()=>{
   const id=++request.current;
   setLoading(true);setHistory([]);clear();
   try{
     const raw=await fetchHistoricalData(asset,timeframe);
     if(id!==request.current)return;
     const verified=validateHistoricalBacktestBars(raw,timeframe);
     if(verified.error){setError(verified.error);return;}
     setHistory(verified.bars);
     setMessage(verified.bars.length+' consecutive, completed venue candles loaded. '+
       (verified.excludedForming?'Forming candle excluded.':''));
   }catch(e){if(id===request.current)setError(e instanceof Error?e.message:'History unavailable.');}
   finally{if(id===request.current)setLoading(false);}
 };
 const run=()=>{
   clear();
   const output=runStrategyLabBacktest(history,timeframe,strategy,config);
   if(output.error){setError(output.error);return;}
   setResult(output.result||null);
 };
 const compare=()=>{
   clear();
   const outputs=[strategy,smaCrossStrategy(),rsiRecoveryStrategy()].map(s=>
     runStrategyLabBacktest(history,timeframe,s,config));
   const failure=outputs.find(x=>x.error);
   if(failure){setError(failure.error||'Backtest failed');return;}
   setComparison(outputs.flatMap(x=>x.result?[x.result]:[]));
 };
 const optimize=()=>{
   clear();
   const found=optimizeSmaCandidates(history,timeframe,config);
   if(!found.length){setError('No SMA candidate produced two trades on this verified history.');return;}
   setCandidates(found.slice(0,8));
   setMessage('In-sample ranking only. Evaluate unseen data before interpreting results.');
 };
 const walkForward=()=>{
   clear();
   const output=walkForwardSma(history,timeframe,config);
   if(output.error){setError(output.error);return;}
   setWalk(output);
   setMessage('Best SMA parameters selected using training bars only. Holdout never used for selection.');
 };
 const scanMarkets=async()=>{
   const id=++scanRequest.current;
   const selected=selectedKeys.map(k=>[k,marketIndex.get(k)] as const)
     .filter((item):item is readonly [string,Asset]=>item[1]!==undefined);
   if(!selected.length){setError('Select at least one market.');return;}
   setScanning(true);setMatrix([]);setError('');setMessage('');
   const at=Date.now()/1000;
   const rows=await Promise.all(selected.slice(0,6).map(async ([marketKey,market])=>{
     const label=market.symbol+' · '+(market.source||market.exchange);
     try{
       const raw=await fetchHistoricalData(market,timeframe);
       const checked=validateHistoricalBacktestBars(raw,timeframe,at);
       if(checked.error)return {key:marketKey,label,error:checked.error};
       const snap=latestLabSignal(checked.bars,timeframe,strategy,at);
       const backtest=runStrategyLabBacktest(checked.bars,timeframe,strategy,config,at);
       if(snap.error||backtest.error)return {key:marketKey,label,
         error:snap.error||backtest.error};
       return {key:marketKey,label,at:snap.at,entry:snap.entry,exit:snap.exit,
         result:backtest.result} as MatrixRow;
     }catch(e){return {key:marketKey,label,
       error:e instanceof Error?e.message:'History request failed.'};}
   }));
   if(id===scanRequest.current){setMatrix(rows);setScanning(false);
     setMessage('Snapshot only: latest completed candle, not an automated alert or continuous scan.');}
 };
 const save=()=>{
   if(!validateLabStrategy(strategy)){setError('Strategy failed validation.');return;}
   try{localStorage.setItem(STORE,JSON.stringify(strategy));setMessage('Saved to this browser only. No cloud sync.');setError('');}
   catch{setError('Browser storage unavailable. Strategy not saved.');}
 };
 const restore=()=>{
   try{const raw=localStorage.getItem(STORE);
     if(!raw){setError('No saved strategy in this browser.');return;}
     const parsed:unknown=JSON.parse(raw);
     if(!validateLabStrategy(parsed)){setError('Saved rules are invalid.');return;}
     updateStrategy(parsed);setMessage('Local strategy loaded.');
   }catch{setError('Saved rules could not be opened.');}
 };
 const applyJson=()=>{
   try{const parsed:unknown=JSON.parse(draft);
     if(!validateLabStrategy(parsed)){setError('Invalid strategy JSON (v1, bounded conditions and supported metrics required).');return;}
     updateStrategy(parsed);setShowJson(false);setMessage('Validated, data-only rules applied. No code executed.');
   }catch{setError('Strategy JSON cannot be parsed.');}
 };
 const inputClass='bg-[#111925] text-[#ebeff8] border border-[#3b4659] rounded px-2 py-1 min-w-0';
 const pill='border border-[#465065] rounded px-2 py-1 hover:bg-[#293448] disabled:opacity-40';
 const setting=(name:keyof BacktestConfig,label:string,min:number,max:number)=><label className="text-[10px] space-y-1">
   <span className="block text-[#bac6d6]">{label}</span>
   <input type="number" className={inputClass+' w-full'} step="any" min={min} max={max}
     value={config[name]} onChange={e=>{const n=Number(e.target.value);
       if(e.target.value.trim()!==''&&Number.isFinite(n)&&n>=min&&n<=max){
         setConfig(previous=>({...previous,[name]:n}));clear();}}}/>
 </label>;
 const renderOperand=(part:Part,index:number,side:'left'|'right',c:LabCondition)=>{
   const op=c[side];const constant='constant' in op;
   return <span className="inline-flex items-center gap-1">
     <select aria-label={part+' condition '+(index+1)+' '+side+' metric'} className={inputClass}
       value={constant?'constant':op.metric}
       onChange={e=>patchCondition(part,index,{[side]:e.target.value==='constant'?
         {constant:100}:operand(e.target.value as LabMetric)})}>
       {side==='right'&&<option value="constant">Value</option>}
       {metricChoices.map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}
     </select>
     {constant?<input className={inputClass+' w-20'} aria-label={part+' value '+(index+1)}
       type="number" step="any" value={op.constant}
       onChange={e=>{const v=Number(e.target.value);if(e.target.value&&Number.isFinite(v))
         patchCondition(part,index,{[side]:{constant:v}});}}/>:
       op.metric!=='close'&&<input aria-label={part+' period '+(index+1)} className={inputClass+' w-14'}
         type="number" min={2} max={200} value={op.period??14}
         onChange={e=>{const p=Number(e.target.value);if(Number.isInteger(p)&&p>=2&&p<=200)
           patchCondition(part,index,{[side]:{...op,period:p}});}}/>}
   </span>;
 };
 const ruleEditor=(part:Part)=><div className="rounded-lg border border-[#344157] p-3 space-y-2 bg-[#161f2e]">
   <div className="flex gap-2 items-center">
     <strong className="text-[#e0eaff]">{part==='entry'?'Entry when':'Exit when'}</strong>
     <select aria-label={part+' rule logic'} className={inputClass} value={strategy[part].logic}
       onChange={e=>editRule(part,r=>({...r,logic:e.target.value as LabRule['logic']}))}>
       <option value="all">ALL conditions</option><option value="any">ANY condition</option>
     </select>
   </div>
   {strategy[part].conditions.map((c,i)=><div key={i} className="flex flex-wrap gap-2 items-center text-[10px]">
     {renderOperand(part,i,'left',c)}
     <select aria-label={part+' comparison '+(i+1)} className={inputClass} value={c.operator}
       onChange={e=>patchCondition(part,i,{operator:e.target.value as LabCondition['operator']})}>
       <option value="crosses_above">Crosses above</option><option value="crosses_below">Crosses below</option>
       <option value="greater_than">Greater than</option><option value="less_than">Less than</option>
     </select>
     {renderOperand(part,i,'right',c)}
     <button className={pill} type="button" aria-label={'Remove '+part+' condition '+(i+1)}
       disabled={strategy[part].conditions.length===1}
       onClick={()=>editRule(part,r=>({...r,conditions:r.conditions.filter((_,j)=>j!==i)}))}>×</button>
   </div>)}
   <button type="button" className={pill} disabled={strategy[part].conditions.length>=6}
     onClick={()=>editRule(part,r=>({...r,conditions:[...r.conditions,baseCondition()]}))}>+ Condition</button>
 </div>;
 const report=(r:LabResult)=><div className="space-y-2">
   <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
     {([['Net return',pct(r.totalReturnPct)],['Worst close drawdown',pct(r.maxDrawdownPct)],
       ['Completed trades',number(r.trades.length)],['Win rate',pct(r.winRatePct)],
       ['Profit factor',r.profitFactor===null?'N/A':number(r.profitFactor)],
       ['Mean trade P&L',number(r.expectancy)],
       ['Bar Sharpe (not annualized)',r.sharpePerBar===null?'N/A':number(r.sharpePerBar)],
       ['Bar Sortino (not annualized)',r.sortinoPerBar===null?'N/A':number(r.sortinoPerBar)],
       ['Exposure',pct(r.exposurePct)],['Drawdown length (bars)',number(r.maxDrawdownBars)],
       ['Buy/hold (uncosted)',pct(r.benchmarkReturnPct)],['Final balance',number(r.finalBalance)]
     ] as const).map(([label,value])=><div key={label} className="border border-[#354355] rounded p-2">
       <span className="block text-[#98a8c2] text-[10px]">{label}</span><strong>{value}</strong></div>)}
   </div>
   <svg viewBox="0 0 600 72" className="w-full h-24 border border-[#344257] rounded" role="img"
     aria-label="Strategy balance and unrealized P&L equity curve">
     <polyline points={spark(r.equity)} fill="none" stroke="#7fafff" strokeWidth="2"/>
   </svg>
   <p className="text-[10px] text-[#9aaecb]">
     Input hash {r.historyKey} · {r.barsUsed} bars · {new Date(r.firstBar*1000).toISOString()} to {new Date(r.lastBar*1000).toISOString()}.
     Closed-bar signals, next-open fills, conservative stop-first intrabar handling. Intrabar liquidity and queue position are not modeled.
   </p>
 </div>;
 return <section id="plutrade-strategy-lab" className="p-3 text-[11px] text-[#dce4f2] space-y-3">
   <div className="flex flex-wrap gap-2 items-center">
     <strong className="text-base">Strategy Lab · {asset.symbol} · {timeframe}</strong>
     <span className="rounded bg-[#30394a] px-2 py-1">Research & simulation only</span>
     <button className={pill} type="button" disabled={loading} onClick={load}>
       {loading?'Loading…':'Load Verified History'}</button>
     <span className="text-[#aab9d0]">{history.length} completed bars</span>
   </div>
   <p className="text-[#aab9cd]">Build deterministic rules using completed venue candles. No real orders,
     automatic execution, user code evaluation, or fabricated prices. Saved strategies stay local to this browser.</p>
   {error&&<p role="alert" className="text-[#ffb9a7]">{error}</p>}
   {message&&<p role="status" className="text-[#9ed7c1]">{message}</p>}
   <div className="flex flex-wrap gap-2 items-center">
     <label>Strategy <select className={inputClass} value={strategy.name.startsWith('SMA ')?'sma':
       strategy.name.startsWith('RSI ')?'rsi':'custom'}
       onChange={e=>updateStrategy(e.target.value==='rsi'?rsiRecoveryStrategy():smaCrossStrategy())}>
       <option value="sma">SMA crossover</option><option value="rsi">RSI recovery</option>
       <option value="custom">Custom rules</option></select></label>
     <label>Side <select className={inputClass} value={strategy.side}
       onChange={e=>updateStrategy({...strategy,side:e.target.value as LabStrategy['side']})}>
       <option value="long">Long</option><option value="short">Short</option></select></label>
     <label>Name <input className={inputClass+' w-48'} maxLength={80} value={strategy.name}
       onChange={e=>updateStrategy({...strategy,name:e.target.value})}/></label>
     <button type="button" className={pill} onClick={save}>Save locally</button>
     <button type="button" className={pill} onClick={restore}>Load saved</button>
     <button type="button" className={pill} onClick={()=>{setShowJson(!showJson);setDraft(JSON.stringify(strategy,null,2));}}>
       {showJson?'Close JSON':'Edit rule JSON'}</button>
   </div>
   {showJson&&<div className="space-y-2"><p>Data-only JSON; arbitrary scripts are not executed.</p>
     <textarea spellCheck={false} aria-label="Strategy rules JSON" rows={9} value={draft}
       onChange={e=>setDraft(e.target.value)} className={inputClass+' w-full font-mono'}/>
     <button type="button" className={pill} onClick={applyJson}>Validate & Apply JSON</button>
   </div>}
   <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{ruleEditor('entry')}{ruleEditor('exit')}</div>
   <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
     {setting('startingBalance','Starting balance',1,1e10)}
     {setting('allocationPct','Allocation %',0.01,100)}
     {setting('feeBps','Fee bps/side',0,1000)}
     {setting('spreadBps','Full spread bps',0,1000)}
     {setting('slippageBps','Slippage bps/side',0,1000)}
     {setting('stopLossPct','Stop loss %',0.01,100)}
     {setting('takeProfitPct','Take profit %',0.01,1000)}
   </div>
   <div className="flex gap-2 flex-wrap">
     <button type="button" disabled={!history.length} onClick={run} className={pill}>Run Strategy</button>
     <button type="button" disabled={!history.length} onClick={compare} className={pill}>Compare 3 Strategies</button>
     <button type="button" disabled={!history.length} onClick={optimize} className={pill}>Rank SMA Parameters</button>
     <button type="button" disabled={history.length<120} onClick={walkForward} className={pill}>70/30 Walk-Forward</button>
     {result&&<button type="button" className={pill} onClick={()=>downloadTrades(result)}>Export Trades CSV</button>}
   </div>
   <div className="rounded-lg border border-[#334157] bg-[#151e2c] p-3 space-y-2">
     <strong>Multi-Market Strategy Scan · Up to 6 exact venue instruments</strong>
     <p className="text-[#aab9cd]">Run this same rule set across separately fetched completed histories.
       Symbols that lack qualifying history show an error instead of an invented result.</p>
     <div className="flex flex-wrap gap-2 items-center">
       <select aria-label="Choose market for strategy scan" className={inputClass}
         value={picker} onChange={e=>setPicker(e.target.value)}>
         <option value="">Choose market…</option>
         {available.map(([id,m])=><option value={id} key={id}>{m.symbol} · {m.source||m.exchange}</option>)}
       </select>
       <button type="button" className={pill} disabled={!picker||selectedKeys.includes(picker)||selectedKeys.length>=6}
         onClick={()=>{setSelectedKeys(previous=>[...previous,picker]);setPicker('');setMatrix([]);}}>Add Market</button>
       <button type="button" className={pill} disabled={scanning||selectedKeys.length===0}
         onClick={scanMarkets}>{scanning?'Scanning…':'Scan Selected Markets'}</button>
     </div>
     <div className="flex flex-wrap gap-1">
       {selectedKeys.map(key=><button type="button" key={key} className={pill}
         aria-label={'Remove '+(marketIndex.get(key)?.symbol||key)}
         title="Remove market" onClick={()=>{setSelectedKeys(previous=>previous.filter(k=>k!==key));setMatrix([]);}}>
         {marketIndex.get(key)?.symbol||key} ×</button>)}
     </div>
     {!!matrix.length&&<div className="max-h-56 overflow-auto">
       <table className="w-full text-left"><thead><tr>
         {['Venue · Symbol','Closed-bar signal','Last signal bar (UTC)','Strategy return','Max drawdown','Completed trades / Error']
           .map(h=><th key={h} className="px-2">{h}</th>)}
       </tr></thead><tbody>{matrix.map(row=><tr key={row.key} className="border-t border-[#344357]">
         <td className="px-2">{row.label}</td>
         <td>{row.error?'Unavailable':row.entry&&row.exit?'Entry & exit':row.entry?'Entry':row.exit?'Exit':'None'}</td>
         <td>{row.at?new Date(row.at*1000).toISOString():'—'}</td>
         <td>{row.result?pct(row.result.totalReturnPct):'—'}</td>
         <td>{row.result?pct(row.result.maxDrawdownPct):'—'}</td>
         <td>{row.error||row.result?.trades.length||0}</td>
       </tr>)}</tbody></table>
     </div>}
   </div>
   {result&&<div className="space-y-2 border-t border-[#38455c] pt-3">
     <strong>Results · {result.strategy.name} ({result.strategy.side})</strong>{report(result)}
     <div className="overflow-auto max-h-40"><table className="w-full text-left">
       <thead><tr>{['Entry','Exit','Direction','Entry price','Exit price','Net P&L','Reason'].map(x=><th key={x} className="px-2">{x}</th>)}</tr></thead>
       <tbody>{result.trades.map((t,i)=><tr key={i} className="border-t border-[#334255]">
         <td className="px-2">{new Date(t.entryAt*1000).toLocaleString()}</td>
         <td>{new Date(t.exitAt*1000).toLocaleString()}</td><td>{t.side}</td>
         <td>{number(t.entryPrice)}</td><td>{number(t.exitPrice)}</td>
         <td className={t.netPnL>=0?'text-[#7bd8b9]':'text-[#ff98a4]'}>{number(t.netPnL)}</td>
         <td>{t.exitReason}</td></tr>)}</tbody>
     </table></div>
   </div>}
   {!!comparison.length&&<div className="overflow-auto border-t border-[#38455c] pt-3">
     <strong>Strategy Comparison (same venue candles and cost assumptions)</strong>
     <table className="w-full text-left mt-2"><thead><tr>
       {['Strategy','Side','Return','Drawdown','Trades','Win rate','Expectancy'].map(x=><th key={x}>{x}</th>)}
     </tr></thead><tbody>{comparison.map((r,i)=><tr key={i} className="border-t border-[#35425a]">
       <td>{r.strategy.name}</td><td>{r.strategy.side}</td><td>{pct(r.totalReturnPct)}</td>
       <td>{pct(r.maxDrawdownPct)}</td><td>{r.trades.length}</td>
       <td>{pct(r.winRatePct)}</td><td>{number(r.expectancy)}</td></tr>)}</tbody></table>
   </div>}
   {!!candidates.length&&<div className="overflow-auto border-t border-[#38455c] pt-3">
     <strong>In-Sample SMA Candidate Ranking (return minus maximum close drawdown)</strong>
     <table className="w-full text-left mt-2"><thead><tr><th>Fast / Slow</th><th>Score</th><th>Return</th><th>Drawdown</th><th>Trades</th><th>Action</th></tr></thead>
       <tbody>{candidates.map(c=><tr key={c.fast+'-'+c.slow} className="border-t border-[#35425a]">
         <td>{c.fast} / {c.slow}</td><td>{number(c.score)}</td>
         <td>{pct(c.result.totalReturnPct)}</td><td>{pct(c.result.maxDrawdownPct)}</td><td>{c.result.trades.length}</td>
         <td><button className={pill} type="button" onClick={()=>updateStrategy(smaCrossStrategy(c.fast,c.slow))}>Use rules</button></td>
       </tr>)}</tbody></table>
   </div>}
   {walk?.train&&walk.test&&<div className="space-y-3 border-t border-[#38455c] pt-3">
     <strong>Out-of-Sample Holdout · SMA {walk.fast}/{walk.slow}</strong>
     <p>Selection before {new Date(walk.splitAt!*1000).toISOString()}.
       The final 30% is evaluated independently with fresh indicator warm-up.</p>
     <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
       <div><strong>Training 70%</strong>{report(walk.train)}</div>
       <div><strong>Unseen holdout 30%</strong>{report(walk.test)}</div>
     </div>
   </div>}
 </section>;
};
