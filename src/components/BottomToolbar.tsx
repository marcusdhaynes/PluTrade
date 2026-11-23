import React, { useState, useEffect } from 'react';
import { IChartApi } from 'lightweight-charts';
import { Calendar, RotateCcw, Settings, Maximize2 } from 'lucide-react';

interface BottomToolbarProps {
  chart: IChartApi | null;
  onSelectRange: (days: number) => void;
  onFitContent: () => void;
  onGoToDate:(utcDate:string)=>boolean;
  onApplyTimeScaleSettings:(settings:{barSpacing:number;rightOffset:number})=>boolean;
  isLogScale: boolean;
  setIsLogScale: (val: boolean | ((prev: boolean) => boolean)) => void;
  isPercentScale: boolean;
  setIsPercentScale: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const BottomToolbar: React.FC<BottomToolbarProps> = ({
  chart,
  onSelectRange,
  onFitContent,
  onGoToDate,
  onApplyTimeScaleSettings,
  isLogScale,
  setIsLogScale,
  isPercentScale,
  setIsPercentScale,
}) => {
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [timeZoneStr,setTimeZoneStr]=useState('UTC');
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
      setTimeZoneStr(zone);
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
    <div
      id="tradingview-bottom-bar"
      data-layout="above-chart"
      aria-label="Chart range and scale controls"
      className="relative z-30 grid h-[44px] w-full min-w-0 shrink-0 grid-rows-2 border-b border-[#2a2e39] bg-[#131722] px-1 text-[11px] select-none md:h-[22px] md:flex md:items-center md:justify-between md:px-2"
    >
      {/* Time Range Quick Selectors */}
      <div id="chart-range-choices" className="grid w-full min-w-0 grid-cols-[repeat(8,minmax(0,1fr))_20px] items-center gap-0 md:flex md:w-auto md:gap-0.5">
        {ranges.map((r) => (
          <button
            key={r.label}
            id={`range-btn-${r.label}`}
            onClick={() => onSelectRange(r.days)}
            className="min-w-0 px-0 py-0.5 text-center text-[9px] font-semibold whitespace-nowrap text-[#9aa3b6] hover:text-white hover:bg-[#1e222d] rounded transition md:px-1 md:text-[10px]"
          >
            {r.label}
          </button>
        ))}

        <button type="button"
          id="go-to-chart-date-btn" aria-expanded={datePanelOpen}
          onClick={()=>{setDatePanelOpen(v=>!v);setScalePanelOpen(false);setDateError('');}}
          className="p-0.5 text-[#787b86] hover:text-[#d1d4dc] rounded hover:bg-[#1e222d] transition ml-0.5"
          title="Go to date..."
        >
          <Calendar className="w-3 h-3" />
        </button>
      </div>

      {/* Right side: Time & Timezone, Fit, % / log / auto */}
      <div className="flex w-full min-w-0 items-center justify-end gap-2 border-t border-[#252c3a] text-[#8d9bad] font-mono text-[10px] md:w-auto md:gap-1.5 md:border-t-0">
        {/* Live Ticking Time (01:08:13 AM UTC-4) */}
        <span className="hidden text-[#787b86] text-[9.5px] select-all cursor-pointer hover:text-[#d1d4dc] md:inline" title="Local clock and timezone">
          {currentTimeStr || '—'}
        </span>
        <span className="mr-auto shrink-0 text-[9px] text-[#9baac3] md:hidden" title={currentTimeStr || 'Local timezone'}>
          {timeZoneStr}
        </span>

        {/* % Percentage scale toggle */}
        <button
          id="percent-scale-toggle"
          onClick={() => setIsPercentScale((prev) => !prev)}
          className={`px-0.5 py-0.2 rounded text-[9px] font-bold transition ${
            isPercentScale ? 'bg-[#2962ff] text-white' : 'hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title="Percentage Scale"
        >
          %
        </button>

        {/* Log scale toggle */}
        <button
          id="log-scale-toggle"
          onClick={() => setIsLogScale((prev) => !prev)}
          className={`px-0.5 py-0.2 rounded text-[9px] font-bold transition ${
            isLogScale ? 'bg-[#2962ff] text-white' : 'hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title="Logarithmic Scale"
        >
          log
        </button>

        {/* Auto scale indicator */}
        <span className="text-[#089981] text-[9px] font-bold px-0.5 rounded bg-[#089981]/10">
          auto
        </span>

        {/* Reset / Fit Content */}
        <button
          id="fit-chart-content-btn"
          onClick={onFitContent}
          className="p-0.5 hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition"
          title="Auto Fit Chart to Screen"
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>

        {/* Bottom scale settings gear */}
        <button type="button" id="time-scale-settings-btn" aria-expanded={scalePanelOpen}
          onClick={()=>{setScalePanelOpen(v=>!v);setDatePanelOpen(false);setScaleError('');}}
          className="p-0.5 hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition"
          title="Time Scale Settings"
        >
          <Settings className="w-2.5 h-2.5" />
        </button>
      </div>
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
      {scalePanelOpen&&<section role="dialog" aria-label="Time scale settings"
        className="absolute right-1 top-full mt-1 z-50 w-[min(240px,calc(100vw-42px))] rounded-lg border border-[#3e4a61] bg-[#182231] p-3 shadow-xl text-[#dce4f0] space-y-2">
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
      </section>}
    </div>
  );
};
