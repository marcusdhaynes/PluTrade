import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown,Star} from 'lucide-react';
import type {Asset,Timeframe} from '../types';
import {
  CHART_INTERVALS,TIMEFRAME_FAVORITES_KEY,marketTimeframeKey,
  sanitizeTimeframeFavorites,updateMarketTimeframes,visibleTimeframeIntervals,
  type IntervalFavorites
} from '../services/timeframeFavorites';
import {
  CUSTOM_INTERVAL_UNITS,customIntervalLabel,isCustomInterval,
  type CustomInterval,type CustomIntervalUnit
} from '../services/customChartIntervals';

const CUSTOM_FAVORITES_KEY='plutrade_custom_interval_favorites_by_ticker_v1';
function readCustomFavorites():Record<string,CustomInterval[]>{
  try{
    const value=JSON.parse(localStorage.getItem(CUSTOM_FAVORITES_KEY)||'{}');
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    return Object.fromEntries(Object.entries(value).filter(([key,list])=>
      key.length<=256&&Array.isArray(list)).map(([key,list])=>[key,
      (list as unknown[]).filter(isCustomInterval).slice(0,16)]));
  }catch{return {};}
}
function uniqueCustom(input:CustomInterval[]):CustomInterval[]{
  const seen=new Set<string>();
  return input.filter(spec=>{
    if(!isCustomInterval(spec))return false;
    const key=customIntervalLabel(spec);
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,16);
}
interface Props{
  activeAsset:Asset;
  activeTimeframe:Timeframe;
  onStandardTimeframe:(tf:Timeframe)=>void;
  customInterval:CustomInterval|null;
  onCustomTimeframe:(interval:CustomInterval)=>string|null;
}

export const TimeframeBar:React.FC<Props>=({
  activeAsset,activeTimeframe,onStandardTimeframe,customInterval,onCustomTimeframe
})=>{
  const [favoritesByTicker,setFavoritesByTicker]=useState<IntervalFavorites>(()=>{
    try{return sanitizeTimeframeFavorites(JSON.parse(localStorage.getItem(TIMEFRAME_FAVORITES_KEY)||'{}'));}
    catch{return {};}
  });
  const [customFavoritesByTicker,setCustomFavoritesByTicker]=useState(readCustomFavorites);
  const tickerKey=marketTimeframeKey(activeAsset);
  const favoriteTimeframes=favoritesByTicker[tickerKey]||[];
  const customFavorites=customFavoritesByTicker[tickerKey]||[];
  const hasFavorites=favoriteTimeframes.length>0||customFavorites.length>0;
  const visible=hasFavorites?
    CHART_INTERVALS.filter(tf=>favoriteTimeframes.includes(tf)):
    visibleTimeframeIntervals(favoritesByTicker,tickerKey);
  const [draftTimeframes,setDraftTimeframes]=useState<Timeframe[]>([]);
  const [draftCustom,setDraftCustom]=useState<CustomInterval[]>([]);
  const [customDigits,setCustomDigits]=useState('2');
  const [customUnit,setCustomUnit]=useState<CustomIntervalUnit>('hours');
  const [intervalOpen,setIntervalOpen]=useState(false);
  const [favoritesOpen,setFavoritesOpen]=useState(false);
  const [customError,setCustomError]=useState('');
  const chooserRef=useRef<HTMLDivElement>(null);
  const favoritesRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    try{localStorage.setItem(TIMEFRAME_FAVORITES_KEY,JSON.stringify(favoritesByTicker));}
    catch(error){console.warn('Could not persist interval favorites',error);}
  },[favoritesByTicker]);
  useEffect(()=>{
    try{localStorage.setItem(CUSTOM_FAVORITES_KEY,JSON.stringify(customFavoritesByTicker));}
    catch(error){console.warn('Could not persist custom favorites',error);}
  },[customFavoritesByTicker]);
  useEffect(()=>{
    setFavoritesOpen(false);
    setIntervalOpen(false);
    setCustomError('');
  },[tickerKey]);
  useEffect(()=>{
    if(!intervalOpen&&!favoritesOpen)return;
    const dismiss=(event:PointerEvent)=>{
      const node=event.target as Node;
      if(intervalOpen&&!chooserRef.current?.contains(node))setIntervalOpen(false);
      if(favoritesOpen&&!favoritesRef.current?.contains(node))setFavoritesOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setIntervalOpen(false);setFavoritesOpen(false);}
    };
    window.addEventListener('pointerdown',dismiss,true);
    window.addEventListener('keydown',escape);
    return ()=>{
      window.removeEventListener('pointerdown',dismiss,true);
      window.removeEventListener('keydown',escape);
    };
  },[intervalOpen,favoritesOpen]);
  const applyCustom=()=>{
    if(!/^[0-9]+$/.test(customDigits)||!Number.isSafeInteger(Number(customDigits))||
       Number(customDigits)<1||Number(customDigits)>999){
      setCustomError('Enter a whole number from 1 to 999.');return;
    }
    const spec={count:Number(customDigits),unit:customUnit};
    const error=onCustomTimeframe(spec);
    if(error){setCustomError(error);return;}
    setCustomError('');
    setIntervalOpen(false);
  };
  const chooseStandard=(tf:Timeframe)=>{
    onStandardTimeframe(tf);
    setCustomError('');
    setIntervalOpen(false);
  };
  const openFavorites=()=>{
    if(!favoritesOpen){
      setDraftTimeframes([...favoriteTimeframes]);
      setDraftCustom(customFavorites.map(spec=>({...spec})));
    }
    setIntervalOpen(false);
    setFavoritesOpen(open=>!open);
  };
  const saveFavorites=()=>{
    setFavoritesByTicker(prev=>updateMarketTimeframes(prev,tickerKey,draftTimeframes));
    setCustomFavoritesByTicker(prev=>{
      const next={...prev};
      const value=uniqueCustom(draftCustom);
      if(value.length)next[tickerKey]=value;
      else delete next[tickerKey];
      return next;
    });
    setFavoritesOpen(false);
  };
  const currentlyCustom=customInterval?customIntervalLabel(customInterval):null;
  return <div id="chart-timeframe-bar" className="flex h-full min-w-0 flex-1 items-center gap-0.5">
    <div ref={chooserRef} className="relative z-[110] shrink-0">
      <button type="button" id="chart-timeframe-dropdown-trigger"
        aria-label="All chart intervals and custom interval"
        title="Choose interval or create a custom interval"
        aria-expanded={intervalOpen}
        onClick={()=>{
          setFavoritesOpen(false);
          setIntervalOpen(open=>!open);
        }}
        className="flex h-[21px] min-w-[31px] items-center justify-center gap-0.5 rounded border border-[#344257] bg-[#202a39] px-1 text-[10px] font-semibold text-[#c6d4e9] hover:bg-[#31415a]">
        <span>{currentlyCustom||activeTimeframe}</span><ChevronDown size={11}/>
      </button>
      {intervalOpen&&<div id="all-chart-intervals-dropdown" role="dialog" aria-label="All chart intervals"
        className="absolute left-0 top-full z-[130] mt-1 w-[min(310px,calc(100vw-54px))] max-h-[min(76dvh,490px)] overflow-y-auto rounded-lg border border-[#455771] bg-[#1c2637] p-2 text-[#dce7f7] shadow-2xl">
        <p className="mb-1 text-[11px] font-semibold">Custom interval</p>
        <div className="flex gap-1">
          <input id="custom-chart-interval-number" aria-label="Custom interval number"
            inputMode="numeric" pattern="[0-9]*" autoComplete="off"
            value={customDigits}
            onChange={event=>{setCustomDigits(event.target.value.replace(/\D/g,'').slice(0,3));setCustomError('');}}
            placeholder="2" className="h-8 w-[64px] min-w-0 rounded border border-[#4c5c75] bg-[#111a29] px-2 text-[12px] tabular-nums text-white"/>
          <select id="custom-chart-interval-unit" aria-label="Custom interval unit"
            value={customUnit} onChange={event=>{setCustomUnit(event.target.value as CustomIntervalUnit);setCustomError('');}}
            className="h-8 min-w-0 flex-1 rounded border border-[#4c5c75] bg-[#111a29] px-1 text-[11px] text-white">
            {CUSTOM_INTERVAL_UNITS.map(unit=><option key={unit} value={unit}>{unit}</option>)}
          </select>
          <button type="button" id="apply-custom-chart-interval" onClick={applyCustom}
            className="h-8 rounded bg-[#2962ff] px-2 text-[11px] font-semibold text-white">Apply</button>
        </div>
        {customError&&<p role="alert" className="mt-1 text-[10px] text-[#ff9ca8]">{customError}</p>}
        <p className="mt-1 text-[9px] leading-snug text-[#9faec2]">
          Custom time bars use verified lower-interval market candles. Tick charts require individual historical trades; unsupported feeds are rejected rather than fabricated.
        </p>
        <p className="mt-2 border-t border-[#3b485b] pt-2 text-[11px] font-semibold">All intervals</p>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {CHART_INTERVALS.map(tf=><button type="button" key={tf}
            aria-label={'Choose timeframe '+tf}
            aria-pressed={!customInterval&&activeTimeframe===tf}
            onClick={()=>chooseStandard(tf)}
            className={'h-7 rounded border text-[11px] '+(!customInterval&&activeTimeframe===tf?
              'border-[#2962ff] bg-[#294372] text-white':'border-[#3b4a60] text-[#c5d1e3] hover:bg-[#33425b]')}>
            {tf}
          </button>)}
        </div>
        {customInterval&&<button type="button" onClick={()=>{
          setDraftTimeframes([...favoriteTimeframes]);
          setDraftCustom(customFavorites.map(spec=>({...spec})));
          setIntervalOpen(false);setFavoritesOpen(true);
        }} className="mt-2 w-full rounded border border-[#544936] px-2 py-1.5 text-left text-[10px] text-[#f5cb7e]">
          Manage favorites for {currentlyCustom}
        </button>}
      </div>}
    </div>
    <div id="chart-timeframe-scroll" role="toolbar" aria-label="Chart timeframes"
      className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain whitespace-nowrap scrollbar-none"
      style={{touchAction:'pan-x'}}>
      {visible.map(tf=><button type="button" id={'tf-btn-'+tf} key={tf}
        aria-label={'Timeframe '+tf} title={'Show '+tf+' chart'}
        aria-pressed={!customInterval&&activeTimeframe===tf} onClick={()=>chooseStandard(tf)}
        className={'h-[21px] shrink-0 rounded px-2 text-[10px] font-semibold '+(!customInterval&&activeTimeframe===tf?
          'bg-[#2962ff] text-white':'text-[#aab7cc] hover:bg-[#283448] hover:text-white')}>{tf}</button>)}
      {customFavorites.map(spec=><button type="button" key={customIntervalLabel(spec)}
        id={'tf-custom-btn-'+customIntervalLabel(spec)}
        aria-label={'Custom timeframe '+customIntervalLabel(spec)}
        aria-pressed={currentlyCustom===customIntervalLabel(spec)}
        onClick={()=>{
          const error=onCustomTimeframe(spec);
          if(error){setCustomError(error);setIntervalOpen(true);}
        }}
        className={'h-[21px] shrink-0 rounded px-2 text-[10px] font-semibold '+(currentlyCustom===customIntervalLabel(spec)?
          'bg-[#2962ff] text-white':'text-[#d6b070] hover:bg-[#433b31]')}>{customIntervalLabel(spec)}</button>)}
    </div>
    <div ref={favoritesRef} className="relative z-[110] shrink-0 border-l border-[#364358] pl-0.5">
      <button type="button" id="timeframe-favorites-button"
        aria-label={'Favorite timeframes for '+activeAsset.symbol}
        aria-expanded={favoritesOpen} title={'Save timeframe loadout for '+activeAsset.symbol}
        onClick={openFavorites}
        className={'flex h-[22px] w-6 items-center justify-center rounded '+(hasFavorites?
          'bg-[#3b3328] text-[#ffbe55]':'text-[#9baac0] hover:bg-[#293649]')}>
        <Star size={15} fill={hasFavorites?'currentColor':'none'}/>
      </button>
      {favoritesOpen&&<div id="ticker-timeframe-favorites-menu" role="dialog"
        aria-label={'Favorite intervals for '+activeAsset.symbol}
        className="absolute right-0 top-full z-[130] mt-1 w-[min(294px,calc(100vw-44px))] max-h-[75dvh] overflow-y-auto rounded-lg border border-[#485770] bg-[#1b2638] p-2 text-[#dae6f8] shadow-2xl">
        <p className="mb-2 text-[11px] font-semibold">Favorites · {activeAsset.symbol}</p>
        <p className="mb-2 text-[10px] leading-snug text-[#9fb0c9]">Only saved intervals appear. Clear all to show every standard interval.</p>
        <div className="grid grid-cols-4 gap-1">
          {CHART_INTERVALS.map(tf=><button type="button" key={tf}
            id={'favorite-timeframe-option-'+tf}
            aria-label={(draftTimeframes.includes(tf)?'Remove ':'Favorite ')+tf}
            aria-pressed={draftTimeframes.includes(tf)}
            onClick={()=>setDraftTimeframes(prev=>prev.includes(tf)?
              prev.filter(item=>item!==tf):[...prev,tf])}
            className={'flex h-7 items-center justify-center gap-1 rounded border text-[10px] '+(draftTimeframes.includes(tf)?
              'border-[#ae8746] bg-[#4b3a27] text-[#ffd288]':'border-[#394860] text-[#c0cde0]')}>
            {draftTimeframes.includes(tf)&&<Star size={10} fill="currentColor"/>}{tf}
          </button>)}
        </div>
        {(customInterval||customFavorites.length>0)&&<div className="mt-2 border-t border-[#39485b] pt-2">
          <p className="mb-1 text-[10px] text-[#aebed5]">Custom favorites</p>
          {uniqueCustom([...(customInterval?[customInterval]:[]),...customFavorites]).map(spec=>{
            const key=customIntervalLabel(spec),active=draftCustom.some(item=>customIntervalLabel(item)===key);
            return <button key={key} type="button" aria-label={(active?'Remove ':'Favorite ')+'custom '+key}
              aria-pressed={active}
              onClick={()=>setDraftCustom(prev=>active?prev.filter(item=>customIntervalLabel(item)!==key):[...prev,spec])}
              className={'mr-1 rounded border px-2 py-1 text-[10px] '+(active?
                'border-[#ae8746] bg-[#4b3a27] text-[#ffd288]':'border-[#394860] text-[#c0cde0]')}>
              {active?'★ ':'☆ '}{key}
            </button>;
          })}
        </div>}
        <div className="mt-2 flex items-center justify-between gap-1">
          <button type="button" onClick={()=>{setDraftTimeframes([]);setDraftCustom([]);}}
            className="rounded px-2 py-1.5 text-[10px] text-[#a8bacf] hover:bg-[#344156]">Clear all</button>
          <div className="flex gap-1">
            <button type="button" onClick={()=>setFavoritesOpen(false)}
              className="rounded border border-[#43516b] px-2.5 py-1.5 text-[10px]">Cancel</button>
            <button type="button" id="save-ticker-timeframe-favorites" onClick={saveFavorites}
              className="rounded bg-[#2962ff] px-3 py-1.5 text-[10px] font-semibold text-white">Save for ticker</button>
          </div>
        </div>
      </div>}
    </div>
  </div>;
};
