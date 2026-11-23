import React, { useState, useEffect } from 'react';
import {createPortal} from 'react-dom';
import type { IChartApi } from 'lightweight-charts';
import { Calendar, RotateCcw, Settings } from 'lucide-react';

interface BottomToolbarProps {
  chart: IChartApi | null;
  onSelectRange: (days: number) => void;
  onFitContent: () => void;
  onGoToDate:(utcDate:string)=>boolean;
  onApplyTimeScaleSettings:(settings:{barSpacing:number;rightOffset:number})=>boolean;
}

export const BottomToolbar: React.FC<BottomToolbarProps> = ({
  chart,
  onSelectRange,
  onFitContent,
  onGoToDate,
  onApplyTimeScaleSettings,
}) => {
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [chartCornerHost,setChartCornerHost]=useState<HTMLElement|null>(null);
  useEffect(()=>{setChartCornerHost(document.getElementById('chart-workspace-viewport'));},[]);
  const [datePanelOpen,setDatePanelOpen]=useState(false);
  const [dateValue,setDateValue]=useState('');
  const [dateError,setDateError]=useState('');
  const [scalePanelOpen,setScalePanelOpen]=useState(false);
  const [barSpacing,setBarSpacing]=useState(6);
  const [rightOffset,setRightOffset]=useState(4);
  const [scaleError,setScaleError]=useState('');
  const applyScale=(spacing:number,offset:number)=>{
    if(!Number.isFinite(spacing)||!Number.isFinite(offset))return;
    const ok=onApplyTimeScaleSettings({barSpacing:spacing,rightOffset:offset});
    setScaleError(ok?'':'No chart available to adjust.');
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format as 01:08:13 AM UTC-4
      const hours = now.getHours();
      const h = hours % 12 || 12;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const offset = -now.getTimezoneOffset();
      const zone = `UTC${offset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')}:${String(Math.abs(offset)%60).padStart(2,'0')}`;
      setCurrentTimeStr(`${String(h).padStart(2, '0')}:${m}:${s} ${ampm} ${zone}`);

    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const ranges: { label: string; days: number }[] = [
    { label: '1D', days: 1 },
    { label: '5D', days: 5 },
    { label: '1M', days: 30 },
    { label: '3M', days: 90 },
    { label: '6M', days: 180 },
    { label: 'YTD', days: -1 },
    { label: '1Y', days: 365 },
    { label: 'ALL', days: 0 },
  ];

  return (
    <div id="tradingview-bottom-bar"
      data-layout="above-chart"
      aria-label="Chart range and scale controls"
      className="relative z-30 flex h-[24px] w-full min-w-0 shrink-0 items-center justify-between border-b border-[#2a2e39] bg-[#131722] px-0.5 text-[10px] select-none md:h-[22px] md:px-2">
      <div id="chart-range-choices"
        className="grid h-full w-full min-w-0 grid-cols-[repeat(8,minmax(0,1fr))_20px] items-center gap-0 md:flex md:w-auto md:gap-0.5">
        {ranges.map(r=>(
          <button key={r.label} type="button" id={`range-btn-${r.label}`}
            title={r.label+' visible chart range'} onClick={()=>onSelectRange(r.days)}
            className="min-w-0 truncate rounded px-0 py-0.5 text-center text-[9px] font-medium text-[#9ba9bc] hover:bg-[#1e222d] hover:text-white md:px-1 md:text-[10px]">
            {r.label}
          </button>
        ))}
        <button type="button" id="go-to-chart-date-btn" aria-expanded={datePanelOpen}
          aria-label="Go to chart date"
          title="Go to date"
          onClick={()=>{setDatePanelOpen(v=>!v);setScalePanelOpen(false);setDateError('');}}
          className="flex h-[20px] items-center justify-center text-[#9ba9bc] hover:text-white">
          <Calendar size={12}/>
        </button>
      </div>
      <span className="hidden shrink-0 text-[9px] font-mono text-[#8e9db5] lg:inline"
        title="Current local clock and timezone">{currentTimeStr||'—'}</span>
      {datePanelOpen&&<form role="dialog" aria-label="Go to chart date"
        className="absolute left-1 top-full mt-1 z-50 min-w-[min(240px,calc(100vw-42px))] rounded-lg border border-[#3e4a61] bg-[#182231] p-3 shadow-xl flex flex-col gap-2 text-[#dce4f0]"
        onSubmit={event=>{
          event.preventDefault();
          if(!dateValue||!onGoToDate(dateValue)){setDateError('No loaded market candles for that UTC date.');return;}
          setDateError('');setDatePanelOpen(false);
        }}>
        <strong>Jump to loaded UTC date</strong>
        <input aria-label="Chart date" type="date" value={dateValue}
          onChange={event=>{setDateValue(event.target.value);setDateError('');}}
          className="w-full rounded border border-[#45536b] bg-[#111a27] p-2 text-white"/>
        {dateError&&<p role="alert" className="text-[#ffacb3]">{dateError}</p>}
        <div className="flex gap-2">
          <button type="submit" className="rounded bg-[#2962ff] px-3 py-1 text-white">Go</button>
          <button type="button" onClick={()=>setDatePanelOpen(false)} className="rounded border border-[#46536c] px-3 py-1">Cancel</button>
        </div>
      </form>}
      {chartCornerHost&&createPortal(
        <div id="chart-corner-controls"
          className="absolute bottom-0 right-0 z-[48] flex items-center gap-0.5 rounded-tl border border-r-0 border-b-0 border-[#384559] bg-[#151d2b]/95 p-0.5 text-[#9eaec4] shadow-lg">
          <button type="button" id="fit-chart-content-btn" onClick={onFitContent}
            title="Fit candles and restore automatic price scale"
            aria-label="Fit chart" className="flex h-[19px] w-[19px] items-center justify-center rounded hover:bg-[#30405c] hover:text-white">
            <RotateCcw size={13}/>
          </button>
          <button type="button" id="time-scale-settings-btn" aria-expanded={scalePanelOpen}
            aria-label="Chart time scale settings"
            title="Chart time scale settings"
            onClick={()=>{setScalePanelOpen(v=>!v);setDatePanelOpen(false);setScaleError('');}}
            className="flex h-[19px] w-[19px] items-center justify-center rounded hover:bg-[#30405c] hover:text-white">
            <Settings size={13}/>
          </button>
      {scalePanelOpen&&<section role="dialog" aria-label="Time scale settings"
        className="absolute bottom-full right-0 mb-1 z-[70] w-[min(240px,calc(100vw-58px))] max-h-[min(66dvh,310px)] overflow-y-auto rounded-lg border border-[#3e4a61] bg-[#182231] p-3 shadow-xl text-[#dce4f0] space-y-2">
        <strong>Chart time scale</strong>
        <label className="block">Bar spacing
          <input type="number" aria-label="Bar spacing" min={2} max={30} step={1} value={barSpacing}
            className="w-full rounded border border-[#45536b] bg-[#111a27] p-1 text-white"
            onChange={event=>{
              const n=Number(event.target.value);
              if(Number.isInteger(n)&&n>=2&&n<=30){setBarSpacing(n);applyScale(n,rightOffset);}
            }}/>
        </label>
        <label className="block">Right offset (bars)
          <input type="number" aria-label="Right offset" min={0} max={40} step={1} value={rightOffset}
            className="w-full rounded border border-[#45536b] bg-[#111a27] p-1 text-white"
            onChange={event=>{
              const n=Number(event.target.value);
              if(Number.isInteger(n)&&n>=0&&n<=40){setRightOffset(n);applyScale(barSpacing,n);}
            }}/>
        </label>
        {scaleError&&<p role="alert" className="text-[#ffacb3]">{scaleError}</p>}
        <button type="button" onClick={()=>setScalePanelOpen(false)}
          className="rounded border border-[#46536c] px-3 py-1">Close</button>
      </section>}        </div>,
        chartCornerHost
      )}
    </div>
  );
};
