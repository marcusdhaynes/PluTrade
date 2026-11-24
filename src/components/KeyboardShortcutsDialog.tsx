import React from 'react';
const commands:[string,string][]=[
 ['Ctrl / Cmd + K or /','Find a market'],
 ['Shift + J','Open trading journal'],
 ['Shift + P','Toggle paper-trading dock'],
 ['Shift + R','Open historical replay & backtesting'],
 ['Shift + S','Open market screener'],
 ['Shift + D','Show market data health'],
 ['?','Show this keyboard guide'],
 ['Escape','Close active overlay'],
];
export const KeyboardShortcutsDialog:React.FC<{onClose:()=>void;embedded?:boolean}>=({onClose,embedded=false})=>
 <div role={embedded?undefined:'dialog'} aria-modal={embedded?undefined:true} aria-label="PluTrade Keyboard Shortcuts"
   onMouseDown={e=>{if(!embedded&&e.target===e.currentTarget)onClose();}}
   className={embedded?'flex-1 min-h-0 overflow-y-auto':'fixed inset-0 z-[1800] flex items-center justify-center bg-black/70 p-4'}>
   <div className={embedded?'w-full p-2 text-[#d1d4dc]':'w-full max-w-md rounded-xl border border-[#485672] bg-[#141c2a] p-4 text-[#e9eef8] shadow-2xl'}>
     {!embedded&&<div className="flex justify-between items-center mb-3">
       <strong className="text-base">PluTrade Keyboard Shortcuts</strong>
       <button type="button" aria-label="Close shortcuts" onClick={onClose} className="rounded border px-2 py-1">×</button>
     </div>}
     <table className="w-full text-sm"><tbody>{commands.map(([command,action])=>
       <tr key={command} className="border-t border-[#344158]">
         <td className="py-2 pr-3 font-mono text-xs text-[#a9c3fa]">{command}</td>
         <td className="py-2 text-[#b4c0d4]">{action}</td>
       </tr>)}</tbody></table>
     <p className="text-xs text-[#9aaabd] mt-3">Hotkeys are ignored when typing into editable fields.</p>
   </div>
 </div>;
