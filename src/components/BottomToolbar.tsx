import React, { useState, useEffect, useRef } from 'react';
import {createPortal} from 'react-dom';
import type { IChartApi } from 'lightweight-charts';
import { Calendar, RotateCcw, Settings } from 'lucide-react';
import type {Asset,Timeframe} from '../types';
import type {CustomInterval} from '../services/customChartIntervals';
import {TimeframeBar} from './TimeframeBar';
import {FloatingPortal} from './FloatingPortal';

interface BottomToolbarProps {
  chart: IChartApi | null;
  activeAsset:Asset;
  activeTimeframe:Timeframe;
  onStandardTimeframe:(tf:Timeframe)=>void;
  customInterval:CustomInterval|null;
  onCustomTimeframe:(spec:CustomInterval)=>string|null;
  onFitContent: () => void;
  onGoToDate:(utcDate:string)=>boolean;
  onApplyTimeScaleSettings:(settings:{barSpacing:number;rightOffset:number})=>boolean;
}

export const BottomToolbar: React.FC<BottomToolbarProps> = ({
  chart,
  activeAsset,activeTimeframe,onStandardTimeframe,customInterval,onCustomTimeframe,
  onFitContent,
  onGoToDate,
  onApplyTimeScaleSettings,
}) => {
  const [chartCornerHost,setChartCornerHost]=useState<HTMLElement|null>(null);
  useEffect(()=>{setChartCornerHost(document.getElementById('chart-workspace-viewport'));},[]);
  const [datePanelOpen,setDatePanelOpen]=useState(false);
  const [dateValue,setDateValue]=useState('');
  const [dateError,setDateError]=useState('');
  const [scalePanelOpen,setScalePanelOpen]=useState(false);
  const [barSpacing,setBarSpacing]=useState(6);
  const [rightOffset,setRightOffset]=useState(4);
  const [scaleError,setScaleError]=useState('');
  const datePopoverRef=useRef<HTMLDivElement>(null);
  const dateFormRef=useRef<HTMLFormElement>(null);
  const calendarButtonRef=useRef<HTMLButtonElement>(null);
  const chartCornerRef=useRef<HTMLDivElement>(null);
  const scalePanelRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!datePanelOpen&&!scalePanelOpen)return;
    const dismiss=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(datePanelOpen&&!dateFormRef.current?.contains(target)&&
         !calendarButtonRef.current?.contains(target))setDatePanelOpen(false);
      if(scalePanelOpen&&!chartCornerRef.current?.contains(target)&&
         !scalePanelRef.current?.contains(target))setScalePanelOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setDatePanelOpen(false);setScalePanelOpen(false);}
    };
    window.addEventListener('pointerdown',dismiss,true);
    window.addEventListener('keydown',escape);
    return ()=>{
      window.removeEventListener('pointerdown',dismiss,true);
      window.removeEventListener('keydown',escape);
    };
  },[datePanelOpen,scalePanelOpen]);
  const applyScale=(spacing:number,offset:number)=>{
    if(!Number.isFinite(spacing)||!Number.isFinite(offset))return;
    const ok=onApplyTimeScaleSettings({barSpacing:spacing,rightOffset:offset});
    setScaleError(ok?'':'No chart available to adjust.');
  };


  return (
    <div id="tradingview-bottom-bar" ref={datePopoverRef}
      data-layout="above-chart"
      aria-label="Chart timeframe and calendar controls"
      className="relative z-[65] flex h-[24px] w-full min-w-0 shrink-0 items-center justify-between border-b border-[#2a2e39] bg-[#131722] px-0.5 text-[10px] select-none md:h-[22px] md:px-2">
      <TimeframeBar
        activeAsset={activeAsset}
        activeTimeframe={activeTimeframe}
        onStandardTimeframe={onStandardTimeframe}
        customInterval={customInterval}
        onCustomTimeframe={onCustomTimeframe}
        calendarControl={<button ref={calendarButtonRef} type="button" id="go-to-chart-date-btn"
          aria-expanded={datePanelOpen} aria-label="Go to chart date"
          title="Go to date" onClick={()=>{setDatePanelOpen(v=>!v);setScalePanelOpen(false);setDateError('');}}
          className="flex h-[21px] w-6 shrink-0 items-center justify-center text-[#9baac0] hover:text-white">
          <Calendar size={14}/>
        </button>}
      />
      {datePanelOpen&&<FloatingPortal anchor={calendarButtonRef} width={240} placement="bottom-end"
        id="chart-date-popup" ariaLabel="Go to chart date"
        className="rounded-lg border border-[#3e4a61] bg-[#182231] p-3 shadow-xl text-[#dce4f0]">
      <form ref={dateFormRef} className="flex flex-col gap-2"
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
      </form></FloatingPortal>}
      {chartCornerHost&&createPortal(
        <div id="chart-corner-controls" ref={chartCornerRef}
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
      {scalePanelOpen&&<FloatingPortal anchor={chartCornerRef} width={240} placement="top-end"
        id="chart-time-scale-popup" ariaLabel="Time scale settings"
        className="rounded-lg border border-[#3e4a61] bg-[#182231] p-3 shadow-xl text-[#dce4f0]">
      <section ref={scalePanelRef} className="space-y-2">
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
        <p className="border-t border-[#3e4a61] pt-2 text-[10px] text-[#99abc3]">
          Charting library: <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer"
            className="text-[#a5c7ff] underline">Lightweight Charts™ by TradingView</a>.
        </p>
        <button type="button" onClick={()=>setScalePanelOpen(false)}
          className="rounded border border-[#46536c] px-3 py-1">Close</button>
      </section></FloatingPortal>}        </div>,
        chartCornerHost
      )}
    </div>
  );
};
