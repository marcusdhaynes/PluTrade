import React, { useState, useEffect, useRef } from 'react';
import { DrawingToolType } from '../types';
import {
  Crosshair,
  GitCommit,
  Brush,
  Type,
  Ruler,
  ZoomIn,
  Magnet,
  Lock,
  Eye,
  EyeOff,
  Trash2,
  Star,
  Pencil,
  RotateCcw,
  Check,
  PenTool,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface LeftDrawingToolbarProps {
  activeTool: DrawingToolType;
  setActiveTool: (tool: DrawingToolType) => void;
  isMagnetMode: boolean;
  setIsMagnetMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  areDrawingsHidden: boolean;
  setAreDrawingsHidden: (val: boolean | ((prev: boolean) => boolean)) => void;
  onClearDrawings: () => void;
  currentColor: string;
  setCurrentColor: (color: string) => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean | ((prev: boolean) => boolean)) => void;
  stayInDrawingMode:boolean;
  setStayInDrawingMode:(enabled:boolean|((prev:boolean)=>boolean))=>void;
  onZoomIn:()=>void;
}

export interface LineToolDef {
  id: DrawingToolType;
  label: string;
  shortcut?: string;
  category: 'LINES' | 'CHANNELS' | 'PITCHFORKS';
  icon: React.ReactNode;
}

export const LINE_TOOLS_CATALOG: LineToolDef[] = [
  // LINES
  {
    id: 'trendline',
    label: 'Trendline',
    shortcut: 'Alt + T',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="4" cy="20" r="2.5" />
        <circle cx="20" cy="4" r="2.5" />
        <line x1="6" y1="18" x2="18" y2="6" />
      </svg>
    ),
  },
  {
    id: 'ray',
    label: 'Ray',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="4" cy="20" r="2.5" />
        <line x1="6" y1="18" x2="22" y2="2" />
      </svg>
    ),
  },
  {
    id: 'info_line',
    label: 'Info line',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="4" cy="20" r="2" />
        <circle cx="20" cy="4" r="2" />
        <line x1="6" y1="18" x2="18" y2="6" />
        <rect x="7" y="11" width="7" height="6" rx="1" fill="currentColor" fillOpacity="0.25" />
      </svg>
    ),
  },
  {
    id: 'extended_line',
    label: 'Extended line',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="8" cy="16" r="2" />
        <circle cx="16" cy="8" r="2" />
        <line x1="2" y1="22" x2="22" y2="2" />
      </svg>
    ),
  },
  {
    id: 'trend_angle',
    label: 'Trend angle',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="20" x2="21" y2="20" />
        <line x1="3" y1="20" x2="19" y2="4" />
        <path d="M 10 20 A 7 7 0 0 0 8 15" />
      </svg>
    ),
  },
  {
    id: 'horizontal',
    label: 'Horizontal line',
    shortcut: 'Alt + H',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="2.5" />
        <line x1="2" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    id: 'horizontal_ray',
    label: 'Horizontal ray',
    shortcut: 'Alt + J',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="4" cy="12" r="2.5" />
        <line x1="6.5" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    id: 'vertical',
    label: 'Vertical line',
    shortcut: 'Alt + V',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="2.5" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    id: 'crossline',
    label: 'Crossline',
    shortcut: 'Alt + C',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="2" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    id: 'bendline',
    label: 'Bendline',
    category: 'LINES',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="4" cy="18" r="2.5" />
        <circle cx="20" cy="18" r="2.5" />
        <path d="M 6 17 Q 12 4 18 17" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="10.5" r="1.5" fill="currentColor" />
      </svg>
    ),
  },

  // CHANNELS
  {
    id: 'parallel_channel',
    label: 'Parallel channel',
    category: 'CHANNELS',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="4" cy="16" r="1.5" />
        <circle cx="17" cy="3" r="1.5" />
        <line x1="5.5" y1="14.5" x2="15.5" y2="4.5" />
        <line x1="8.5" y1="19.5" x2="20.5" y2="7.5" />
        <line x1="7" y1="17" x2="18" y2="6" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'regression_trend',
    label: 'Regression trend',
    category: 'CHANNELS',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polygon points="3,11 21,3 21,21 3,21" fill="currentColor" fillOpacity="0.15" stroke="none" />
        <line x1="3" y1="16" x2="21" y2="8" strokeWidth="2" />
        <line x1="3" y1="11" x2="21" y2="3" strokeDasharray="2 2" />
        <line x1="3" y1="21" x2="21" y2="13" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'flat_top_bottom',
    label: 'Flat top/bottom',
    category: 'CHANNELS',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="4" y1="19" x2="21" y2="10" />
        <circle cx="4" cy="19" r="1.5" />
        <circle cx="21" cy="6" r="1.5" />
      </svg>
    ),
  },
  {
    id: 'disjoint_channel',
    label: 'Disjoint channel',
    category: 'CHANNELS',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="10" x2="20" y2="4" />
        <line x1="4" y1="14" x2="20" y2="20" />
        <circle cx="4" cy="10" r="1.5" />
        <circle cx="4" cy="14" r="1.5" />
      </svg>
    ),
  },

  // PITCHFORKS
  {
    id: 'pitchfork',
    label: 'Pitchfork',
    category: 'PITCHFORKS',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="4" cy="12" r="1.8" />
        <circle cx="11" cy="5" r="1.8" />
        <circle cx="11" cy="19" r="1.8" />
        <line x1="5.8" y1="12" x2="22" y2="12" />
        <line x1="12.8" y1="5" x2="22" y2="5" />
        <line x1="12.8" y1="19" x2="22" y2="19" />
        <line x1="11" y1="5" x2="11" y2="19" />
      </svg>
    ),
  },
  {
    id: 'schiff_pitchfork',
    label: 'Schiff pitchfork',
    category: 'PITCHFORKS',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="4" cy="15.5" r="1.8" />
        <circle cx="11" cy="5" r="1.8" />
        <circle cx="11" cy="19" r="1.8" />
        <line x1="5.8" y1="15" x2="22" y2="10" />
        <line x1="12.8" y1="5" x2="22" y2="3" />
        <line x1="12.8" y1="19" x2="22" y2="17" />
        <line x1="11" y1="5" x2="11" y2="19" />
      </svg>
    ),
  },
  {
    id: 'modified_schiff_pitchfork',
    label: 'Modified Schiff pitchfork',
    category: 'PITCHFORKS',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="7.5" cy="15.5" r="1.8" />
        <circle cx="11" cy="5" r="1.8" />
        <circle cx="11" cy="19" r="1.8" />
        <line x1="9" y1="14" x2="22" y2="10" />
        <line x1="12.8" y1="5" x2="22" y2="3" />
        <line x1="12.8" y1="19" x2="22" y2="17" />
        <line x1="11" y1="5" x2="11" y2="19" />
      </svg>
    ),
  },
  {
    id: 'inside_pitchfork',
    label: 'Inside pitchfork',
    category: 'PITCHFORKS',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="12" r="1.8" />
        <circle cx="5" cy="6" r="1.8" />
        <circle cx="5" cy="18" r="1.8" />
        <line x1="12.8" y1="12" x2="22" y2="12" />
        <line x1="6.8" y1="6" x2="22" y2="6" />
        <line x1="6.8" y1="18" x2="22" y2="18" />
        <line x1="5" y1="6" x2="5" y2="18" />
      </svg>
    ),
  },
];

export const LeftDrawingToolbar: React.FC<LeftDrawingToolbarProps> = React.memo(({
  activeTool,
  setActiveTool,
  isMagnetMode,
  setIsMagnetMode,
  areDrawingsHidden,
  setAreDrawingsHidden,
  onClearDrawings,
  currentColor,
  setCurrentColor,
  isLocked,
  setIsLocked,
  stayInDrawingMode,
  setStayInDrawingMode,
  onZoomIn,
}) => {
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isLineMenuOpen, setIsLineMenuOpen] = useState(false);
  const [isFavoritesOnly,setIsFavoritesOnly]=useState(false);
  const allToolbarKeys=['crosshair','line-group','fibonacci','rectangle','text','measure',
    'zoom','magnet','stay','lock','hide','clear','color'];
  const [visibleTools,setVisibleTools]=useState<Record<string,boolean>>(()=>{
    try{
      const raw=JSON.parse(localStorage.getItem('plutrade_toolbar_visibility_v1')||'{}');
      if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
      return Object.fromEntries(allToolbarKeys.map(key=>[key,raw[key]!==false]));
    }catch{return {};}
  });
  const [draftVisible,setDraftVisible]=useState<Record<string,boolean>>(visibleTools);
  const [editingToolbar,setEditingToolbar]=useState(false);
  const [resetArmed,setResetArmed]=useState(false);
  useEffect(()=>{try{localStorage.setItem('plutrade_toolbar_visibility_v1',
    JSON.stringify(visibleTools));}catch{}},[visibleTools]);
  const toggleToolbarEdit=()=>{
    setResetArmed(false);
    if(editingToolbar){
      setVisibleTools({...draftVisible});
      setEditingToolbar(false);
    }else{
      setDraftVisible({...visibleTools});
      setEditingToolbar(true);
    }
  };
  const toolbarSlot=(key:string,label:string,content:React.ReactNode)=>{
    const enabled=(editingToolbar?draftVisible:visibleTools)[key]!==false;
    if(!editingToolbar&&!enabled)return null;
    return <div key={key} className="relative w-full flex justify-center shrink-0"
      data-toolbar-slot={key} data-toolbar-visible={String(enabled)}>
      <div className={editingToolbar&&!enabled?'opacity-35 grayscale pointer-events-none':'w-full flex justify-center'}>
        {content}
      </div>
      {editingToolbar&&<button type="button" aria-label={(enabled?'Hide ':'Show ')+label}
        aria-pressed={enabled} title={(enabled?'Hide ':'Show ')+label}
        onClick={()=>setDraftVisible(prev=>({...prev,[key]:prev[key]===false}))}
        className="absolute inset-0 z-[55] rounded-md border border-[#6e8aa7] bg-[#172236]/30 flex items-start justify-end">
        <span className={'text-[9px] leading-3 rounded-bl px-0.5 '+(enabled?'bg-[#206650] text-white':'bg-[#723746] text-white')}>
          {enabled?'✓':'×'}
        </span>
      </button>}
    </div>;
  };
  const resetToolbar=()=>{
    if(!resetArmed){setResetArmed(true);return;}
    setVisibleTools({});
    setDraftVisible({});
    setStarredTools(['ray','parallel_channel']);
    setSelectedLineTool('trendline');
    setIsLineMenuOpen(false);
    setResetArmed(false);
    setEditingToolbar(false);
  };
  const favoritesBtnRef=useRef<HTMLButtonElement>(null);
  const lineMenuRef = useRef<HTMLDivElement>(null);
  const lineBtnRef = useRef<HTMLDivElement>(null);

  // Remember active tool selected within the line group
  const [selectedLineTool, setSelectedLineTool] = useState<DrawingToolType>(() => {
    try{
      const saved = localStorage.getItem('tv_selected_line_tool');
      return LINE_TOOLS_CATALOG.some(t=>t.id===saved) ? saved as DrawingToolType : 'trendline';
    }catch{return 'trendline';}
  });

  // Starred tools in the line dropdown (matches TradingView screenshot favorites like Ray and Parallel Channel)
  const [starredTools, setStarredTools] = useState<string[]>(() => {
    try{
      const saved = localStorage.getItem('tv_starred_drawing_tools');
      if(!saved)return ['ray','parallel_channel'];
      const parsed:unknown=JSON.parse(saved);
      if(!Array.isArray(parsed))return ['ray','parallel_channel'];
      return parsed.filter((t):t is string=>typeof t==='string'&&LINE_TOOLS_CATALOG.some(item=>item.id===t));
    }catch{return ['ray','parallel_channel'];}
  });

  const lockedState = isLocked;

  useEffect(() => {
    try{localStorage.setItem('tv_starred_drawing_tools', JSON.stringify(starredTools));}catch{}
  }, [starredTools]);

  useEffect(() => {
    try{localStorage.setItem('tv_selected_line_tool', selectedLineTool);}catch{}
  }, [selectedLineTool]);

  // Click outside to close line tools flyout menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isLineMenuOpen &&
        lineMenuRef.current &&
        !lineMenuRef.current.contains(e.target as Node) &&
        lineBtnRef.current &&
        !lineBtnRef.current.contains(e.target as Node) &&
        !favoritesBtnRef.current?.contains(e.target as Node)
      ) {
        setIsLineMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isLineMenuOpen]);

  const toggleStar = (toolId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  const isCurrentActiveInLineGroup = LINE_TOOLS_CATALOG.some((t) => t.id === activeTool);
  const activeLineToolDef =
    LINE_TOOLS_CATALOG.find((t) => t.id === activeTool) ||
    LINE_TOOLS_CATALOG.find((t) => t.id === selectedLineTool) ||
    LINE_TOOLS_CATALOG[0];

  const colors = [
    '#2962ff', // blue
    '#089981', // green
    '#f23645', // red
    '#ff9800', // orange
    '#e040fb', // purple
    '#d1d4dc', // white
  ];

  const otherTools: { id: DrawingToolType; label: string; icon: React.ReactNode }[] = [
    { id: 'fibonacci', label: 'Gann & Fibonacci Tools', icon: <GitCommit className="w-3.5 h-3.5" /> },
    { id: 'rectangle', label: 'Geometric Shapes & Brush', icon: <Brush className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Text & Annotation Tools', icon: <Type className="w-3.5 h-3.5" /> },
    { id: 'measure', label: 'Measure Tool', icon: <Ruler className="w-3.5 h-3.5" /> },
  ];

  return (
    <aside
      id="tradingview-left-toolbar"
      className="w-[32px] bg-[#131722] border-r border-[#2a2e39] py-1 px-[2px] flex flex-col items-center justify-between select-none shrink-0 z-30 overflow-y-auto overflow-x-visible scrollbar-none"
    >
      {/* Top Main Tools */}
      <div className="flex flex-col items-center gap-1 w-full relative min-h-0">
        {/* 1. Crosshair / Cursor */}
        {toolbarSlot('crosshair','Crosshair',<React.Fragment>

        <button
          id="left-tool-crosshair"
          onClick={() => setActiveTool('crosshair')}
          className={`w-[26px] h-[24px] rounded-md flex items-center justify-center transition-colors relative group cursor-pointer ${
            activeTool === 'crosshair' || activeTool === 'cursor'
              ? 'bg-[#2962ff] text-white shadow-xs'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title="Crosshair"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <div className="absolute left-full ml-2 px-2 py-1 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs font-medium rounded shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition z-50">
            Crosshair
          </div>
        </button>


        </React.Fragment>)}

                {/* 2. LINES / CHANNELS / PITCHFORKS TOOLBAR BUTTON & FLYOUT MENU */}
        {toolbarSlot('line-group','Line Tools',<React.Fragment>

        <div ref={lineBtnRef} className="relative w-full flex justify-center">
          <button
            id="left-tool-line-group"
            onClick={() => {
              setIsFavoritesOnly(false);
              setActiveTool(activeLineToolDef.id);
              setSelectedLineTool(activeLineToolDef.id);
              setIsLineMenuOpen((prev) => !prev);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setIsFavoritesOnly(false);
              setIsLineMenuOpen(true);
            }}
            className={`w-[26px] h-[24px] rounded-md flex items-center justify-center transition-colors relative group cursor-pointer ${
              isCurrentActiveInLineGroup
                ? 'bg-[#2962ff] text-white shadow-xs'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title={activeLineToolDef.label}
          >
            {/* Centered main icon */}
            <div className="flex items-center justify-center pointer-events-none">
              {activeLineToolDef.icon}
            </div>

            {/* TradingView Expand / Collapse Chevron (appears ONLY on hover when closed, stays visible when open) */}
            <span
              onClick={(e) => {
                e.stopPropagation();
                setIsFavoritesOnly(false);
                setIsLineMenuOpen((prev) => !prev);
              }}
              className={`absolute right-0 bottom-0 top-0 flex items-center pr-[1px] transition-opacity cursor-pointer ${
                isLineMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              } hover:text-white`}
              title={isLineMenuOpen ? 'Collapse menu' : 'Expand line tools'}
            >
              <ChevronRight className={`w-2.5 h-2.5 transition-transform duration-150 ${isLineMenuOpen ? 'rotate-180 text-white' : ''}`} />
            </span>

            {/* Hover Tooltip when flyout closed */}
            {!isLineMenuOpen && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs font-medium rounded shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition z-50">
                {activeLineToolDef.label}
              </div>
            )}
          </button>

          {/* TRADINGVIEW FLYOUT DROPDOWN MENU - Visible box matching image.png */}
          {isLineMenuOpen && (
            <div
              ref={lineMenuRef}
              id="tradingview-lines-flyout-menu"
              className="absolute left-[30px] top-[-4px] bg-[#1e222d] border border-[#2a2e39] rounded shadow-2xl py-1.5 w-[260px] max-h-[calc(100vh-60px)] overflow-y-auto text-[#d1d4dc] text-xs z-50 select-none divide-y divide-[#2a2e39]/80 scrollbar-thin"
            >
              {isFavoritesOnly&&<div className="px-3 py-2 font-semibold text-[#f7b75a]">Favorite drawing tools</div>}
              {isFavoritesOnly&&starredTools.length===0&&<div className="px-3 py-3 text-[#a4adbd]">No favorite drawing tools. Star tools in the complete list.</div>}
              {/* SECTION 1: LINES */}
              <div className="pb-1">
                <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-[#787b86] uppercase tracking-wider">
                  LINES
                </div>
                {LINE_TOOLS_CATALOG.filter((t) => t.category === 'LINES' && (!isFavoritesOnly || starredTools.includes(t.id))).map((tool) => {
                  const isStarred = starredTools.includes(tool.id);
                  const isToolActive = activeTool === tool.id;
                  return (
                    <div
                      key={tool.id}
                      id={`line-flyout-${tool.id}`}
                      onClick={() => {
                        setActiveTool(tool.id);
                        setSelectedLineTool(tool.id);
                        setIsLineMenuOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] cursor-pointer transition group ${
                        isToolActive ? 'bg-[#2962ff]/20 text-[#2962ff]' : 'text-[#d1d4dc]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`${isToolActive ? 'text-[#2962ff]' : 'text-[#787b86] group-hover:text-white'}`}>
                          {tool.icon}
                        </span>
                        <span className="truncate font-normal group-hover:text-white">
                          {tool.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {tool.shortcut && (
                          <span className="text-[10px] font-mono text-[#787b86]">{tool.shortcut}</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => toggleStar(tool.id, e)}
                          className="p-0.5 hover:text-[#f7a600] transition cursor-pointer"
                          title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              isStarred
                                ? 'fill-[#f7a600] text-[#f7a600]'
                                : 'text-[#787b86] opacity-0 group-hover:opacity-100 hover:text-[#f7a600]'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* SECTION 2: CHANNELS */}
              <div className="py-1">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-[#787b86] uppercase tracking-wider">
                  CHANNELS
                </div>
                {LINE_TOOLS_CATALOG.filter((t) => t.category === 'CHANNELS' && (!isFavoritesOnly || starredTools.includes(t.id))).map((tool) => {
                  const isStarred = starredTools.includes(tool.id);
                  const isToolActive = activeTool === tool.id;
                  return (
                    <div
                      key={tool.id}
                      id={`channel-flyout-${tool.id}`}
                      onClick={() => {
                        setActiveTool(tool.id);
                        setSelectedLineTool(tool.id);
                        setIsLineMenuOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] cursor-pointer transition group ${
                        isToolActive ? 'bg-[#2962ff]/20 text-[#2962ff]' : 'text-[#d1d4dc]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`${isToolActive ? 'text-[#2962ff]' : 'text-[#787b86] group-hover:text-white'}`}>
                          {tool.icon}
                        </span>
                        <span className="truncate font-normal group-hover:text-white">
                          {tool.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {tool.shortcut && (
                          <span className="text-[10px] font-mono text-[#787b86]">{tool.shortcut}</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => toggleStar(tool.id, e)}
                          className="p-0.5 hover:text-[#f7a600] transition cursor-pointer"
                          title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              isStarred
                                ? 'fill-[#f7a600] text-[#f7a600]'
                                : 'text-[#787b86] opacity-0 group-hover:opacity-100 hover:text-[#f7a600]'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* SECTION 3: PITCHFORKS */}
              <div className="pt-1 pb-0.5">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-[#787b86] uppercase tracking-wider">
                  PITCHFORKS
                </div>
                {LINE_TOOLS_CATALOG.filter((t) => t.category === 'PITCHFORKS' && (!isFavoritesOnly || starredTools.includes(t.id))).map((tool) => {
                  const isStarred = starredTools.includes(tool.id);
                  const isToolActive = activeTool === tool.id;
                  return (
                    <div
                      key={tool.id}
                      id={`pitchfork-flyout-${tool.id}`}
                      onClick={() => {
                        setActiveTool(tool.id);
                        setSelectedLineTool(tool.id);
                        setIsLineMenuOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] cursor-pointer transition group ${
                        isToolActive ? 'bg-[#2962ff]/20 text-[#2962ff]' : 'text-[#d1d4dc]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`${isToolActive ? 'text-[#2962ff]' : 'text-[#787b86] group-hover:text-white'}`}>
                          {tool.icon}
                        </span>
                        <span className="truncate font-normal group-hover:text-white">
                          {tool.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {tool.shortcut && (
                          <span className="text-[10px] font-mono text-[#787b86]">{tool.shortcut}</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => toggleStar(tool.id, e)}
                          className="p-0.5 hover:text-[#f7a600] transition cursor-pointer"
                          title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              isStarred
                                ? 'fill-[#f7a600] text-[#f7a600]'
                                : 'text-[#787b86] opacity-0 group-hover:opacity-100 hover:text-[#f7a600]'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>


        </React.Fragment>)}

                {starredTools.length>0&&<div id="left-toolbar-starred-tools" className="w-full flex flex-col items-center gap-1 border-l-2 border-[#d5a34c] pl-0.5"
          title="Starred drawing tools">
          {starredTools.map(id=>{
            const tool=LINE_TOOLS_CATALOG.find(entry=>entry.id===id);
            if(!tool)return null;
            return <button key={id} type="button" aria-label={'Starred '+tool.label}
              title={'Starred '+tool.label} onClick={()=>{if(editingToolbar)return;setSelectedLineTool(tool.id);setActiveTool(tool.id);}}
              className={'w-[24px] h-6 flex items-center justify-center rounded-md '+(activeTool===tool.id?
                'bg-[#2962ff] text-white':'bg-[#24202b] text-[#e6b85f] hover:bg-[#373244]')}>
              {tool.icon}
            </button>;
          })}
        </div>}

                {/* 3. Fibonacci, Rectangle, Text, Measure Tools */}
        {otherTools.map((tool) => {
          const isActive = activeTool === tool.id;
          return toolbarSlot(tool.id,tool.label,(
            <button
              key={tool.id}
              id={`left-tool-${tool.id}`}
              onClick={() => setActiveTool(tool.id)}
              className={`w-[26px] h-[24px] rounded-md flex items-center justify-center transition-colors relative group cursor-pointer ${
                isActive
                  ? 'bg-[#2962ff] text-white shadow-xs'
                  : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
              }`}
              title={tool.label}
            >
              {tool.icon}

              {/* Hover Tooltip on Right */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs font-medium rounded shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition z-50">
                {tool.label}
              </div>
            </button>
          ));
        })}

        {/* Zoom Tool */}
        {toolbarSlot('zoom','Zoom In',<React.Fragment>

        <button
          className="w-[26px] h-[24px] rounded-md flex items-center justify-center text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d] transition-colors cursor-pointer"
          title="Zoom In"
          aria-label="Zoom chart in"
          onClick={onZoomIn}
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>


        </React.Fragment>)}

                <div className="w-4 h-px bg-[#2a2e39] my-0.5" />

        {/* Magnet Mode Toggle */}
        {toolbarSlot('magnet','Magnet',<React.Fragment>

        <button
          id="magnet-mode-toggle-btn"
          onClick={() => setIsMagnetMode((prev) => !prev)}
          className={`w-[26px] h-[24px] rounded-md flex items-center justify-center transition-colors relative group cursor-pointer ${
            isMagnetMode
              ? 'bg-[#2962ff] text-white shadow-xs'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title={isMagnetMode ? 'Magnet Mode: Enabled' : 'Magnet Mode: Disabled'}
        >
          <Magnet className="w-3.5 h-3.5" />
        </button>


        </React.Fragment>)}

                {/* Stay in Drawing Mode */}
        {toolbarSlot('stay','Stay in Drawing Mode',<React.Fragment>

        <button
          onClick={() => setStayInDrawingMode(prev=>!prev)}
          className={`w-[26px] h-[24px] rounded-md flex items-center justify-center transition-colors cursor-pointer ${
            stayInDrawingMode
              ? 'bg-[#2962ff] text-white shadow-xs'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title="Stay in Drawing Mode"
          aria-pressed={stayInDrawingMode}
        >
          <PenTool className="w-3.5 h-3.5" />
        </button>


        </React.Fragment>)}

                {/* Lock All Drawings */}
        {toolbarSlot('lock','Lock Drawings',<React.Fragment>

        <button
          onClick={() => {
            const next = !lockedState;
            setIsLocked(next);
          }}
          className={`w-[26px] h-[24px] rounded-md flex items-center justify-center transition-colors cursor-pointer ${
            lockedState
              ? 'bg-[#ff9800] text-white shadow-xs'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title={lockedState ? 'Unlock All Drawings' : 'Lock All Drawings'}
          aria-pressed={lockedState}
        >
          <Lock className="w-3.5 h-3.5" />
        </button>


        </React.Fragment>)}

                {/* Hide / Show All Drawings */}
        {toolbarSlot('hide','Hide Drawings',<React.Fragment>

        <button
          id="hide-drawings-toggle-btn"
          onClick={() => setAreDrawingsHidden((prev) => !prev)}
          className={`w-[26px] h-[24px] rounded-md flex items-center justify-center transition-colors relative group cursor-pointer ${
            areDrawingsHidden
              ? 'text-[#f23645] bg-[#f23645]/15'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title={areDrawingsHidden ? 'Show Drawings' : 'Hide All Drawings'}
        >
          {areDrawingsHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>


        </React.Fragment>)}

                {/* Clear All Drawings (Trash Can) */}
        {toolbarSlot('clear','Clear Drawings',<React.Fragment>

        <button
          id="clear-all-drawings-btn"
          onClick={onClearDrawings}
          disabled={lockedState}
          className="w-[26px] h-[24px] rounded-md flex items-center justify-center text-[#787b86] hover:text-[#f23645] hover:bg-[#1e222d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title={lockedState?"Unlock drawings to remove them":"Remove All Drawings"}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>


        </React.Fragment>)}

                {/* Color Picker for active drawing tool */}
        {toolbarSlot('color','Drawing Color',<React.Fragment>

        <div className="relative">
          <button
            id="color-picker-trigger-btn"
            onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
            className="w-[26px] h-[24px] rounded-md flex items-center justify-center hover:bg-[#1e222d] transition-colors cursor-pointer"
            title="Drawing Color"
          >
            <span
              className="w-3.5 h-3.5 rounded-full border border-[#2a2e39] inline-block transition-transform hover:scale-110"
              style={{ backgroundColor: currentColor }}
            />
          </button>
          {isColorPickerOpen && (
            <div className="absolute left-full ml-2 top-0 bg-[#1e222d] border border-[#2a2e39] rounded-lg p-1.5 shadow-2xl flex flex-col gap-1 z-50">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCurrentColor(c);
                    setIsColorPickerOpen(false);
                  }}
                  className="w-4 h-4 rounded-full border border-[#2a2e39] transition hover:scale-125 cursor-pointer"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>
        </React.Fragment>)}

        
      </div>

      {/* Favorites Star Button directly beneath buttons */}
      <div className="w-full flex justify-center pt-1 border-t border-[#2a2e39]/60 mt-1">
        <button
          ref={favoritesBtnRef}
          aria-label="Toggle favorite drawing tools"
          aria-expanded={isLineMenuOpen&&isFavoritesOnly}
          onClick={() => {
            setIsLineMenuOpen(previous=>isFavoritesOnly?!previous:true);
            setIsFavoritesOnly(true);
          }}
          className={`w-[26px] h-[24px] rounded-md border border-[#2a2e39] bg-[#1e222d] flex items-center justify-center transition-colors cursor-pointer ${
            starredTools.length > 0 ? 'text-[#ffb74d] hover:border-[#ffb74d]' : 'text-[#787b86] hover:text-[#d1d4dc]'
          }`}
          title={`Favorite Tools (${starredTools.length})`}
        >
          <Star className={`w-3.5 h-3.5 ${starredTools.length > 0 ? 'fill-[#ffb74d]' : ''}`} />
        </button>
      </div>
      <div className="w-full flex flex-col gap-1 items-center border-t border-[#3b4556] pt-1 mt-auto shrink-0"
        id="left-toolbar-layout-controls">
        <button type="button" id="left-toolbar-reset" onClick={resetToolbar}
          aria-label={resetArmed?'Confirm reset toolbar to default':'Reset toolbar to default'}
          title={resetArmed?'Press again to confirm default layout':'Default toolbar layout'}
          className={'w-[26px] h-[26px] flex items-center justify-center rounded-md border '+(resetArmed?
            'border-[#e0b364] bg-[#4a3726] text-[#ffdc9f]':'border-[#3c4557] text-[#92a6c3] hover:bg-[#283348]')}>
          {resetArmed?<Check size={15}/>:<RotateCcw size={15}/>}
        </button>
        <button type="button" id="left-toolbar-edit" onClick={toggleToolbarEdit}
          aria-pressed={editingToolbar} aria-label={editingToolbar?'Apply toolbar layout':'Edit toolbar layout'}
          title={editingToolbar?'Apply layout and hide disabled tools':'Edit visible toolbar buttons'}
          className={'w-[26px] h-[26px] flex items-center justify-center rounded-md border '+(editingToolbar?
            'border-[#4d9cba] bg-[#225374] text-white':'border-[#3c4557] text-[#92a6c3] hover:bg-[#283348]')}>
          {editingToolbar?<Check size={15}/>:<Pencil size={15}/>}
        </button>
      </div>
    </aside>
  );
});

LeftDrawingToolbar.displayName = 'LeftDrawingToolbar';
