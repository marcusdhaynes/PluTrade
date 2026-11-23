import React, { useState } from 'react';
import { Asset, PriceAlert,Timeframe } from '../types';
import {ALERT_CONDITIONS,ALERT_FREQUENCIES,alertIsExpired} from '../services/priceAlertEngine';
import { Bell, X, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface AlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAsset: Asset;
  activeTimeframe:Timeframe;
  alerts: PriceAlert[];
  setAlerts: React.Dispatch<React.SetStateAction<PriceAlert[]>>;
}

export const AlertsModal: React.FC<AlertsModalProps> = ({
  isOpen,
  onClose,
  activeAsset,
  activeTimeframe,
  alerts,
  setAlerts,
}) => {
  const [targetPrice, setTargetPrice] = useState<string>(activeAsset.price.toString());
  const [condition, setCondition] = useState<PriceAlert['condition']>('cross_above');
  const [frequency,setFrequency]=useState<NonNullable<PriceAlert['frequency']>>('once');
  const [expiry,setExpiry]=useState('never');
  const [notificationPermission,setNotificationPermission]=useState(()=>
    typeof Notification==='undefined'?'unsupported':Notification.permission);
  const [formError,setFormError]=useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(targetPrice);
    if (!Number.isFinite(priceNum)||priceNum<=0||!ALERT_CONDITIONS.includes(condition)||
      !ALERT_FREQUENCIES.includes(frequency)){
      setFormError('Enter a valid positive price and supported condition/frequency.');
      return;
    }
    const expiryMs:Record<string,number>={'1h':3600000,'1d':86400000,'7d':604800000,'30d':2592000000};
    const now=Date.now();

    const newAlert: PriceAlert = {
      id: 'alert-' + now+'-'+Math.random().toString(36).slice(2,8),
      symbol: activeAsset.symbol,
      exchange: activeAsset.source || activeAsset.exchange,
      marketType: activeAsset.marketType,
      pairAddress: activeAsset.pairAddress,
      chainId: activeAsset.chainId,
      targetPrice: priceNum,
      condition,frequency,timeframe:activeTimeframe,
      expiresAt:expiryMs[expiry]?now+expiryMs[expiry]:undefined,
      createdAt:now,
      triggered: false,
      notes: notes.trim() || undefined,
    };

    setAlerts((prev) => [newAlert, ...prev]);
    setNotes('');
    setFormError('');
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div
      id="alerts-modal-backdrop"
      className="fixed inset-0 z-[1800] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        id="alerts-modal-window"
        className="bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2e39]">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-[#2962ff]" />
            <h2 className="text-base font-semibold text-[#d1d4dc]">Price Alerts ({activeAsset.symbol})</h2>
          </div>
          <button
            id="close-alerts-modal-btn"
            onClick={onClose}
            className="text-[#787b86] hover:text-[#d1d4dc] p-1 rounded hover:bg-[#2a2e39] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p role="note" className="px-4 py-2 text-[11px] text-[#a4abba] border-b border-[#2a2e39]">
          Price alerts are evaluated while this browser is open. Unlike TradingView's hosted alerts, they do not keep monitoring after you close the page. Browser notifications require your permission. Alerts never place trades.
        </p>
        {/* Create Alert Form */}
        <form onSubmit={handleCreateAlert} className="p-4 border-b border-[#2a2e39] bg-[#131722]/50 space-y-3">
          <div className="text-xs text-[#787b86]">
            Last displayed price:{' '}
            <span className="text-[#d1d4dc] font-mono font-medium">
              ${activeAsset.price.toLocaleString(undefined, { minimumFractionDigits: activeAsset.digits })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#787b86] mb-1">Condition</label>
              <select
                id="alert-condition-select"
                value={condition}
                onChange={(e) => setCondition(e.target.value as PriceAlert['condition'])}
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-lg px-2.5 py-1.5 text-xs text-[#d1d4dc] focus:outline-none focus:border-[#2962ff]"
              >
                <option value="cross_above">Crossing Up (&gt;)</option>
                <option value="cross_below">Crossing Down (&lt;)</option>
                <option value="crossing">Crossing Either Direction</option>
                <option value="greater_than">Greater Than</option>
                <option value="less_than">Less Than</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#787b86] mb-1">Target Price</label>
              <input
                id="alert-target-price-input"
                type="number"
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-lg px-2.5 py-1.5 text-xs text-[#d1d4dc] font-mono focus:outline-none focus:border-[#2962ff]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-[#a5afc1]">Trigger frequency
              <select id="alert-frequency-select" aria-label="Trigger frequency" value={frequency}
                onChange={e=>setFrequency(e.target.value as NonNullable<PriceAlert['frequency']>)}
                className="block mt-1 w-full bg-[#131722] border border-[#2a2e39] rounded-lg px-2 py-1.5 text-xs text-[#e5e9f3]">
                <option value="once">Only Once</option>
                <option value="every">Every Matching Update</option>
                <option value="once_per_minute">Once Per Minute</option>
                <option value="once_per_bar">Once Per Bar</option>
                <option value="once_per_bar_close">Once Per Bar Close</option>
              </select>
            </label>
            <label className="block text-xs text-[#a5afc1]">Expiration
              <select id="alert-expiration-select" aria-label="Alert expiration" value={expiry}
                onChange={e=>setExpiry(e.target.value)}
                className="block mt-1 w-full bg-[#131722] border border-[#2a2e39] rounded-lg px-2 py-1.5 text-xs text-[#e5e9f3]">
                <option value="never">No Expiration</option>
                <option value="1h">1 Hour</option>
                <option value="1d">1 Day</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days</option>
              </select>
            </label>
          </div>
          <p className="text-[10px] text-[#91a0b8]">Alert market: {activeAsset.source||activeAsset.exchange} · {activeAsset.symbol} · {activeTimeframe}. Bar-close triggers require a confirmed native candle on this timeframe while its chart feed is active.</p>
          <button type="button" className="border border-[#48546c] rounded-md px-3 py-1.5 text-[11px] text-[#bbd4f6] disabled:opacity-40"
            disabled={notificationPermission==='unsupported'||notificationPermission==='denied'}
            onClick={async()=>{
              if(typeof Notification==='undefined')return;
              try{setNotificationPermission(await Notification.requestPermission());}
              catch{setNotificationPermission('denied');}
            }}>
            Browser notifications: {notificationPermission==='granted'?'Enabled':notificationPermission==='unsupported'?'Unsupported':notificationPermission==='denied'?'Blocked by browser':'Enable'}
          </button>
          <div>
            <label className="block text-xs font-medium text-[#787b86] mb-1">Optional Note</label>
            <input
              id="alert-notes-input"
              type="text"
              placeholder="e.g. Resistance breakout, take profit, stop loss..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded-lg px-2.5 py-1.5 text-xs text-[#d1d4dc] placeholder-[#787b86] focus:outline-none focus:border-[#2962ff]"
            />
          </div>

          {formError&&<p role="alert" className="text-[11px] text-[#f58c98]">{formError}</p>}
          <button
            id="create-alert-submit-btn"
            type="submit"
            className="w-full bg-[#2962ff] hover:bg-[#2962ff]/90 text-white font-medium text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            Set Alert
          </button>
        </form>

        {/* Existing Alerts List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="text-xs font-semibold text-[#787b86] px-1 uppercase tracking-wider">
            Saved Alerts ({alerts.length})
          </div>

          {alerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#787b86]">
              No price alerts currently set. Create one above to receive triggers.
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                id={`alert-item-${alert.id}`}
                className={`p-3 rounded-lg border flex items-center justify-between transition ${
                  alert.triggered
                    ? 'bg-[#131722] border-[#363c4e]/50 opacity-75'
                    : 'bg-[#131722] border-[#2a2e39] hover:border-[#363c4e]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5">
                    {alert.triggered ? (
                      <CheckCircle2 className="w-4 h-4 text-[#089981]" />
                    ) : (
                      <Bell className="w-4 h-4 text-[#2962ff]" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#d1d4dc]">
                      <span className="font-semibold">{alert.symbol}</span>{' '}
                      {alert.condition.replaceAll('_',' ')}{' '}
                      <span className="font-mono text-[#2962ff]">
                        ${alert.targetPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#787b86] mt-0.5">
                      {alert.exchange || 'Legacy alert · recreate to select an exact venue'}
                    </div>
                    <div className="text-[10px] text-[#91a0b8] mt-0.5">
                      {(alert.frequency||'once').replaceAll('_',' ')} · {alert.timeframe||'1m'}
                      {alert.expiresAt?' · expires '+new Date(alert.expiresAt).toLocaleString():''}
                    </div>
                    {alert.notes && <div className="text-[11px] text-[#787b86] mt-0.5">{alert.notes}</div>}
                    <div className="text-[10px] text-[#787b86] mt-1">
                      {alertIsExpired(alert,Date.now())?'Expired':alert.paused?'Paused':alert.triggered?'Triggered':alert.lastTriggeredAt?'Active · fired '+new Date(alert.lastTriggeredAt).toLocaleTimeString():'Active'}{' '}
                      • {new Date(alert.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                <button type="button" disabled={alertIsExpired(alert,Date.now())} onClick={()=>setAlerts(prev=>prev.map(a=>a.id===alert.id?
                  (a.triggered?{...a,paused:false,triggered:false,
                    lastTriggeredAt:undefined,lastTriggeredBar:undefined}:{...a,paused:!a.paused}):a))}
                  className="text-[10px] text-[#a4bee7] hover:text-white rounded px-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={alertIsExpired(alert,Date.now())?'Expired alerts must be recreated':alert.triggered?'Rearm alert':alert.paused?'Resume alert':'Pause alert'}>
                  {alertIsExpired(alert,Date.now())?'Expired':alert.paused?'Resume':alert.triggered?'Rearm':'Pause'}
                </button>
                <button
                  onClick={() => handleDeleteAlert(alert.id)}
                  className="text-[#787b86] hover:text-[#f23645] p-1.5 rounded hover:bg-[#2a2e39] transition"
                  title="Remove alert"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
