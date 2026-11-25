import React,{useEffect,useState} from 'react';
import {X,Info} from 'lucide-react';
import type {PaperAccountRecord} from '../services/paperAccounts';
import {DEFAULT_PAPER_SETTINGS,normalizePaperSettings,type PaperSettings} from '../services/paperTrading';
import {parsePaperSettingsPreset,exportPaperSettingsPreset} from '../services/paperSettingsImport';

interface Props{
  existing?:PaperAccountRecord|null;
  proposedName:string;
  onClose:()=>void;
  onSave:(name:string,settings:PaperSettings)=>void;
  onDelete?:()=>void;
}
const currencyOptions=['USD','USDT','USDC','EUR','GBP','JPY','BTC'];
const cls='w-full min-w-0 h-9 rounded-md bg-[#202124] border border-[#4b4d51] text-[#f1f3f5] px-2 outline-none focus:border-[#91ade7]';
const label='block text-[11px] text-[#b8bbbf] mb-1';
const groupNames: {id:keyof PaperSettings['leverages'];title:string}[]=[
  {id:'stocks',title:'Stocks / Funds'},
  {id:'futures',title:'Futures / Options'},
  {id:'forex',title:'Forex'},
  {id:'crypto',title:'Crypto'},
  {id:'others',title:'Others'},
];
export function PaperAccountModal({existing,proposedName,onClose,onSave,onDelete}:Props){
  const [name,setName]=useState(existing?.portfolio.account.name||proposedName);
  const [settings,setSettings]=useState<PaperSettings>(()=>normalizePaperSettings(existing?.portfolio.settings||DEFAULT_PAPER_SETTINGS));
  const [error,setError]=useState('');
  const [importNotice,setImportNotice]=useState('');
  const [compactSection,setCompactSection]=useState<'account'|'leverage'|'fees'>('account');
  const importSettings=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    try{
      if(file.size>65536)throw new Error('Settings preset must be smaller than 64 KB.');
      if(!/\.(json|csv)$/i.test(file.name))throw new Error('Choose a CSV or JSON settings preset.');
      const next=parsePaperSettingsPreset(await file.text(),settings,locked);
      setSettings(next);
      setError('');
      setImportNotice('Settings imported for review. Press '+(existing?'Save Changes':'Create')+' to apply; no trades or positions were imported.');
    }catch(e){
      setImportNotice('');
      setError(e instanceof Error?e.message:'Could not read the settings preset.');
    }
  };
  const downloadPreset=()=>{
    try{
      const data=exportPaperSettingsPreset(settings);
      const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
      const link=document.createElement('a');
      link.href=url;link.download='plutrade-paper-account-settings.json';link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),500);
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not export preset.');}
  };
  const locked=!!existing&&(existing.portfolio.positions.length>0||existing.portfolio.fills.length>0||(existing.portfolio.pendingOrders?.length||0)>0);
  useEffect(()=>{
    const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc);
  },[onClose]);
  const save=()=>{
    try{onSave(name,settings);onClose();}
    catch(e){setError(e instanceof Error?e.message:'Unable to save account');}
  };
  const change=(patch:Partial<PaperSettings>)=>setSettings(s=>({...s,...patch}));
  return <div id="paper-account-editor-backdrop" className="fixed inset-0 z-[1900] bg-black/70 flex items-center justify-center p-4" role="presentation"
    onPointerDown={e=>{if(e.currentTarget===e.target)onClose();}}>
    <section role="dialog" aria-modal="true" aria-label={existing?'Paper Trading account settings':'Create Paper Trading account'}
      id="paper-account-editor" className="w-full max-w-[390px] max-h-[92dvh] flex flex-col overflow-hidden rounded-xl border border-[#414347] bg-[#1d1f21] text-white shadow-[0_16px_60px_#000c]">
      <header className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-[#323438] sticky top-0 bg-[#1d1f21] z-10">
        <h2 className="font-semibold text-base">{existing?'Account Settings':'Create Account'}</h2>
        <button type="button" title="Close account dialog" onClick={onClose} className="text-[#9fa2a8] hover:text-white"><X size={20}/></button>
      </header>
      <nav id="compact-account-tabs" className="hidden" aria-label="Account Settings Sections">{(['account','leverage','fees'] as const).map(section=><button type="button" key={section} aria-pressed={compactSection===section} onClick={()=>setCompactSection(section)}>{section==='account'?'Account':section==='leverage'?'Leverage':'Fees'}</button>)}</nav>
      <div className="px-5 py-4 space-y-4 min-h-0 overflow-y-auto overflow-x-hidden flex-1" id="paper-account-editor-body" data-section={compactSection}>
        <label data-account-section="account" className="block"><span className={label}>Account Name</span>
          <input className={cls} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
        <div data-account-section="account" id="account-import-presets" className="rounded border border-[#3c4659] bg-[#1b2635] p-2.5 space-y-2">
          <strong className="block text-[11px] text-[#deebff]">Import Account Starting Capital & Fees</strong>
          <p className="text-[10px] leading-snug text-[#a6b9d2]">
            Import a CSV or JSON settings preset: startingBalance, currency, feePercent,
            perContract, spreadBps, slippageBps, and leverage. Fields can still be edited below.
            This imports settings only—not transactions or a TradingView account connection.
          </p>
          <div className="flex items-center flex-wrap gap-2">
            <label className="cursor-pointer rounded border border-[#52627c] px-2.5 py-1.5 text-[11px] text-[#b9d4ff] hover:bg-[#34445a]">
              Import CSV / JSON
              <input aria-label="Import paper account settings file" type="file" accept=".csv,.json,text/csv,application/json"
                onChange={importSettings} className="sr-only"/>
            </label>
            <button type="button" onClick={downloadPreset}
              className="rounded border border-[#52627c] px-2.5 py-1.5 text-[11px] text-[#b9d4ff] hover:bg-[#34445a]">
              Export Settings JSON
            </button>
          </div>
          {importNotice&&<p role="status" className="text-[10px] text-[#a8e3bd]">{importNotice}</p>}
          {locked&&<p className="text-[10px] text-[#f1d39a]">
            This account has trade history: its starting balance and currency are protected.
            Import those values into a new account instead.
          </p>}
        </div>
        <div data-account-section="account" className="grid grid-cols-2 gap-3">
          <label><span className={label}>Starting Balance</span>
            <input aria-label="Starting Balance" type="number" min="0" step="any" className={cls} disabled={locked}
              value={settings.startingBalance} onChange={e=>change({startingBalance:Number(e.target.value)})}/></label>
          <label><span className={label}>Currency</span>
            <select className={cls} disabled={locked} value={settings.currency}
              onChange={e=>change({currency:e.target.value})}>
              {currencyOptions.map(c=><option value={c} key={c}>{c}</option>)}</select></label>
        </div>
        {locked&&<p data-account-section="account" className="text-[11px] text-[#aab0bb]">Balance and currency are locked after the first trade. Other settings can still be edited.</p>}
        <div data-account-section="leverage" className="border-t border-[#33363a] pt-3">
          <div className="tracking-wide text-[10px] text-[#bab9b7] mb-3">Leverage</div>
          <label className="flex items-center gap-2 text-[12px] cursor-pointer mb-3">
            <input type="checkbox" checked={settings.marginControl} onChange={e=>change({marginControl:e.target.checked})}
              className="accent-[#91aadc] h-4 w-4"/> Margin Control
            <span title="If disabled, every new trade uses 1× leverage"><Info size={13} color="#8c9198"/></span>
          </label>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {groupNames.map(({id,title})=><label key={id}><span className={label}>{title}</span>
              <div className="flex gap-1 items-center"><input type="number" min="1" max="1000" step="any" aria-label={title+' Leverage'} className={cls} disabled={!settings.marginControl} value={settings.leverages[id]||''}
                onChange={e=>change({leverages:{...settings.leverages,[id]:Number(e.target.value)}})}/><span>×</span>
                <select aria-label={title+' Leverage Preset'} className="w-14 h-9 min-w-0 rounded border border-[#4b4d51] bg-[#202124]" disabled={!settings.marginControl} value={[1,2,3,5,10,20,25,50,75,100,125,200,500,1000].includes(settings.leverages[id])?settings.leverages[id]:''} onChange={e=>{if(e.target.value)change({leverages:{...settings.leverages,[id]:Number(e.target.value)}});}}>
                  <option value="">Custom</option>{[1,2,3,5,10,20,25,50,75,100,125,200,500,1000].map(value=><option key={value} value={value}>{value}×</option>)}
                </select></div>
            </label>)}
          </div>
        </div>
        <div data-account-section="fees" className="border-t border-[#33363a] pt-3">
          <div className="tracking-wide text-[10px] text-[#bab9b7] mb-3">Commission (Optional)</div>
          <label className="flex gap-2 items-center text-[12px] cursor-pointer">
            <input type="checkbox" className="accent-[#91aadc] h-4 w-4" checked={settings.futuresOptions.enabled}
              onChange={e=>change({futuresOptions:{...settings.futuresOptions,enabled:e.target.checked}})}/>
            Futures & Options (Per Contract)
          </label>
          <label className="block mt-3">
            <span className={label}>Commission Per Contract (Account Currency)</span>
            <input type="number" min="0" step="any" className={cls} disabled={!settings.futuresOptions.enabled}
              value={settings.futuresOptions.perContract}
              onChange={e=>change({futuresOptions:{...settings.futuresOptions,perContract:Number(e.target.value)}})}/>
          </label>
          <label className="flex gap-2 items-center text-[12px] mt-4 cursor-pointer">
            <input type="checkbox" className="accent-[#91aadc] h-4 w-4" checked={settings.commission.enabled}
              onChange={e=>change({commission:{...settings.commission,enabled:e.target.checked}})}/>
            Other Instruments
          </label>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <label><span className={label}>Commission</span>
              <input type="number" min="0" step="any" className={cls} disabled={!settings.commission.enabled}
                aria-label={settings.commission.mode==='percent'?'Commission percent':'Fixed commission per execution'}
                value={settings.commission.amount}
                onChange={e=>change({commission:{...settings.commission,amount:Number(e.target.value)}})}/></label>
            <label><span className={label}>Commission Type</span>
              <select className={cls} disabled={!settings.commission.enabled}
                value={settings.commission.mode}
                onChange={e=>change({commission:{...settings.commission,mode:e.target.value as 'fixed'|'percent'}})}>
                <option value="fixed">Fixed Per Execution</option><option value="percent">Percent of Notional</option>
              </select></label>
          </div>
          <p className="text-[11px] text-[#a9adb7] mt-2">
            Fees are zero unless enabled. Percentage commission uses the notional value of each execution: 0.04 means 0.04% (not 4%). Opening, closing and partial fills each incur their own charge. For futures/options, enabled per-contract fees take precedence.
          </p>
        </div>
        <div data-account-section="fees" className="border-t border-[#33363a] pt-3 space-y-2">
          <div className="tracking-wide text-[10px] text-[#bab9b7]">Paper Execution Assumptions (Optional)</div>
          <p className="text-[11px] text-[#a9adb7]">These are hypothetical costs, not observed bid/ask or actual venue liquidity. Zero preserves earlier results. Half the spread plus adverse slippage applies to each fill.</p>
          <div className="grid grid-cols-2 gap-3">
            <label><span className={label}>Full Spread (bps)</span>
              <input type="number" min="0" max="1000" step="0.1" className={cls}
                value={settings.execution.spreadBps}
                onChange={e=>change({execution:{...settings.execution,spreadBps:Number(e.target.value)}})}/></label>
            <label><span className={label}>Slippage (bps)</span>
              <input type="number" min="0" max="1000" step="0.1" className={cls}
                value={settings.execution.slippageBps}
                onChange={e=>change({execution:{...settings.execution,slippageBps:Number(e.target.value)}})}/></label>
          </div>
        </div>
        {error&&<p role="alert" className="text-[12px] text-[#ffa7aa]">{error}</p>}
      </div>
      <footer className="border-t border-[#36383b] px-5 py-3 shrink-0 flex items-center justify-end gap-2 sticky bottom-0 bg-[#1d1f21]">
        {existing&&onDelete&&<button type="button" className="mr-auto px-3 py-2 text-xs text-[#ff9ca5] hover:text-white"
          onClick={()=>{if(window.confirm('Permanently delete this simulated account and its trade history?')){onDelete();onClose();}}}>Delete</button>}
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-[#62676f] text-xs hover:bg-[#33363a]">Cancel</button>
        <button type="button" onClick={save} className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#f0f1f4] text-[#191b1f] hover:bg-white">
          {existing?'Save':'Create'}
        </button>
      </footer>
    </section>
  </div>;
}
