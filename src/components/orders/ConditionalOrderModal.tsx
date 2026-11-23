import {DEFAULT_DYNAMIC_TRAIL,validDynamicTrail,type DynamicTrailingSettings} from '../../services/dynamicTrailing';
import {ruleCanActivate} from '../../services/conditionalSafety';
import React, { useState, useEffect } from 'react';
import {
  ConditionalOrder,
  ConditionLogicType,
  SingleCondition,
  OrderActionType,
  DependencyType,
  ComparisonOperator,
  DependencyContext,
} from '../../types/conditionalOrders';
import { Drawing, DetailedAlert, Asset, PaperPosition } from '../../types';
import {
  X,
  Plus,
  Trash2,
  Zap,
  Layers,
  TrendingUp,
  TrendingDown,
  Bell,
  Activity,
  DollarSign,
  ShieldAlert,
  ArrowRight,
  Play,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface ConditionalOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAsset: Asset;
  drawings: Drawing[];
  alerts: DetailedAlert[];
  positions: PaperPosition[];
  accountOptions:{id:string;name:string;currency:string}[];
  accountPositions:Record<string,PaperPosition[]>;
  activeAccountId:string;
  initialDependency?: DependencyContext | null;
  orderToEdit?: ConditionalOrder | null;
  onSaveOrder: (order: ConditionalOrder) => void;
  onTestTrigger?: (order: ConditionalOrder) => void;
}

export const ConditionalOrderModal: React.FC<ConditionalOrderModalProps> = ({
  isOpen,
  onClose,
  activeAsset,
  drawings,
  alerts,
  positions,
  accountOptions,
  accountPositions,
  activeAccountId,
  initialDependency,
  orderToEdit,
  onSaveOrder,
  onTestTrigger,
}) => {
  // State
  const [logicType, setLogicType] = useState<ConditionLogicType>('IF');
  const [title, setTitle] = useState('');
  const [conditions, setConditions] = useState<SingleCondition[]>([]);
  const [action, setAction] = useState<OrderActionType>('enter_long');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState<number>(activeAsset.price);
  const [size, setSize] = useState<number>(1000);
  const [sizeUnit, setSizeUnit] = useState<'units' | 'usd' | 'percent' | 'equity_percent'>('units');
  const [tpPercent, setTpPercent] = useState<number>(5.0);
  const [slPercent, setSlPercent] = useState<number>(2.5);
  const [trailingPercent, setTrailingPercent] = useState<number>(1.8);
  const [dynamicSettings,setDynamicSettings]=useState<DynamicTrailingSettings>({...DEFAULT_DYNAMIC_TRAIL});
  const [accountTarget,setAccountTarget]=useState<string>(activeAccountId);
  const [positionTarget,setPositionTarget]=useState<string>('');
  const [validationError,setValidationError]=useState('');
  const scopedPositions=accountTarget==='all'?positions:(accountPositions[accountTarget]||[]);
  const [reducePercent, setReducePercent] = useState<number>(50);
  const [increasePercent, setIncreasePercent] = useState<number>(50);
  const [notes, setNotes] = useState('');

  // Pre-fill or initialize whenever modal opens or dependency changes
  useEffect(() => {
    if (!isOpen) return;

    if (orderToEdit) {
      setLogicType(orderToEdit.conditionLogic);
      setTitle(orderToEdit.title);
      setConditions(orderToEdit.conditions);
      setAction(orderToEdit.action);
      setOrderType(orderToEdit.execution.orderType);
      setLimitPrice(orderToEdit.execution.limitPrice || activeAsset.price);
      setSize(orderToEdit.execution.size);
      setSizeUnit(orderToEdit.execution.sizeUnit);
      setTpPercent(orderToEdit.execution.tpPercent || 5.0);
      setSlPercent(orderToEdit.execution.slPercent || 2.5);
      setTrailingPercent(orderToEdit.execution.trailingPercent || 1.8);
      setDynamicSettings(orderToEdit.execution.dynamicTrailing||{...DEFAULT_DYNAMIC_TRAIL});
      setAccountTarget(orderToEdit.accountScope==='all_paper'?'all':(orderToEdit.accountId||activeAccountId));
      setPositionTarget(orderToEdit.execution.positionId||'');
      setValidationError('');
      setReducePercent(orderToEdit.execution.reducePercent || 50);
      setIncreasePercent(orderToEdit.execution.increasePercent || 50);
      setNotes(orderToEdit.notes || '');
      return;
    }

    // Default initialization
    let initialCond: SingleCondition;

    if (initialDependency) {
      // User right-clicked or double-clicked a specific dependency!
      if (initialDependency.type === 'drawing' && initialDependency.drawing) {
        const d = initialDependency.drawing;
        const p = d.points[0]?.price || activeAsset.price;
        initialCond = {
          id: `cond-${Date.now()}`,
          dependencyType: 'drawing',
          dependencyId: d.id,
          dependencyLabel: `${d.type.toUpperCase()} (${d.label || `#${d.id.slice(0, 4)}`}) at $${p.toFixed(activeAsset.digits)}`,
          operator: activeAsset.price < p ? 'crosses_above' : 'crosses_below',
          thresholdValue: p,
        };
        setTitle(`Order on ${d.type.toUpperCase()} (${d.label || `#${d.id.slice(0, 4)}`})`);
      } else if (initialDependency.type === 'alert' && initialDependency.alert) {
        const a = initialDependency.alert;
        initialCond = {
          id: `cond-${Date.now()}`,
          dependencyType: 'alert',
          dependencyId: a.id,
          dependencyLabel: `Alert: "${a.title}"`,
          operator: 'triggered',
        };
        setTitle(`Order when "${a.title}" triggers`);
      } else if (initialDependency.type === 'position') {
        initialCond = {
          id: `cond-${Date.now()}`,
          dependencyType: 'position',
          dependencyLabel: `${activeAsset.symbol} Position PnL`,
          operator: 'pnl_above_percent',
          thresholdValue: 5.0,
        };
        setTitle(`Dynamic ATR Protection for ${activeAsset.symbol} Position`);
      } else {
        initialCond = {
          id: `cond-${Date.now()}`,
          dependencyType: 'price',
          dependencyLabel: `${activeAsset.symbol} Price Level`,
          operator: 'crosses_above',
          thresholdValue: initialDependency.price || activeAsset.price * 1.02,
        };
        setTitle(`Conditional Order at $${(initialDependency.price || activeAsset.price).toFixed(activeAsset.digits)}`);
      }
    } else {
      // Standard new conditional order
      initialCond = {
        id: `cond-${Date.now()}`,
        dependencyType: 'price',
        dependencyLabel: `${activeAsset.symbol} Breakout Level`,
        operator: 'crosses_above',
        thresholdValue: Number((activeAsset.price * 1.02).toFixed(activeAsset.digits)),
      };
      setTitle(`Conditional Breakout Order - ${activeAsset.symbol}`);
    }

    setLogicType('IF');
    setConditions([initialCond]);
    setAction(initialDependency?.type==='position'?'sl_dynamic':'enter_long');
    setOrderType('market');
    setLimitPrice(activeAsset.price);
    setSize(activeAsset.symbol.includes('BTC') ? 0.1 : activeAsset.symbol.includes('ETH') ? 1 : 2500);
    setSizeUnit('units');
    setTpPercent(5.0);
    setSlPercent(2.5);
    setTrailingPercent(1.8);
    setDynamicSettings({...DEFAULT_DYNAMIC_TRAIL});
    setAccountTarget(activeAccountId);
    setPositionTarget('');
    setValidationError('');
    setReducePercent(50);
    setIncreasePercent(50);
    setNotes('');
  // Do not reset a half-completed rule when the selected Asset receives a
  // live price tick; the market identity, not the transient quote, owns this form.
  }, [isOpen, initialDependency, orderToEdit, activeAsset.symbol,
    activeAsset.source, activeAsset.exchange, activeAsset.marketType,
    activeAsset.chainId, activeAsset.pairAddress, activeAccountId]);

  if (!isOpen) return null;

  // Add condition for IF (AND) or IF (OR)
  const handleAddCondition = () => {
    const newCond: SingleCondition = {
      id: `cond-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      dependencyType: 'price',
      dependencyLabel: `${activeAsset.symbol} Price Level`,
      operator: 'greater_than',
      thresholdValue: activeAsset.price,
    };
    setConditions([...conditions, newCond]);
  };

  const handleUpdateCondition = (id: string, updates: Partial<SingleCondition>) => {
    setConditions(
      conditions.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...updates };

        // Automatically update label if type changed
        if (updates.dependencyType && updates.dependencyType !== c.dependencyType) {
          updated.dependencyId=undefined;
          updated.secondaryValue=undefined;
          if (updates.dependencyType === 'drawing') {
            const firstDrawing = drawings[0];
            if (firstDrawing) {
              const p = firstDrawing.points[0]?.price || activeAsset.price;
              updated.dependencyId = firstDrawing.id;
              updated.dependencyLabel = `${firstDrawing.type.toUpperCase()} at $${p.toFixed(activeAsset.digits)}`;
              updated.thresholdValue = p;
              updated.operator = 'crosses_either';
            } else {
              updated.dependencyLabel = 'Chart Trendline / Level';
              updated.thresholdValue = activeAsset.price;
              updated.operator='crosses_either';
            }
          } else if (updates.dependencyType === 'alert') {
            const firstAlert = alerts[0];
            updated.dependencyId = firstAlert?.id;
            updated.dependencyLabel = firstAlert ? `Alert: ${firstAlert.title}` : 'Price Alert';
            updated.operator = 'triggered';
          } else if (updates.dependencyType === 'indicator') {
            updated.dependencyId = 'rsi14';
            updated.dependencyLabel = 'RSI (14) · completed 1m';
            updated.thresholdValue = 70;
            updated.operator = 'crosses_above';
          } else if (updates.dependencyType === 'position') {
            const selected=scopedPositions.find(p=>p.symbol===activeAsset.symbol&&
              p.exchange===(activeAsset.source||activeAsset.exchange));
            updated.dependencyId=selected?.id;
            updated.dependencyLabel = selected?`${selected.side} ${selected.symbol}`:`${activeAsset.symbol} Open Position`;
            updated.operator = 'pnl_above_percent';
            updated.thresholdValue = 5.0;
          } else if (updates.dependencyType === 'price') {
            updated.dependencyLabel = `${activeAsset.symbol} Price`;
            updated.thresholdValue = activeAsset.price;
            updated.operator = 'crosses_above';
          } else if (updates.dependencyType === 'account') {
            updated.dependencyLabel='Paper account equity / available funds';
            updated.operator='equity_greater_than';
            updated.thresholdValue=10000;
          } else if (updates.dependencyType === 'utc_session') {
            updated.dependencyLabel='UTC session (start/end hour)';
            updated.operator='in_utc_hours';
            updated.thresholdValue=9;
            updated.secondaryValue=17;
          } else if (updates.dependencyType === 'volume') {
            updated.dependencyLabel = '24h Volume Spike';
            updated.thresholdValue = 50000000;
            updated.operator = 'greater_than';
          }
        }
        return updated;
      })
    );
  };

  const handleRemoveCondition = (id: string) => {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((c) => c.id !== id));
  };

  // Build the ConditionalOrder object
  const buildOrderObject = (): ConditionalOrder => {
    return {
      id: orderToEdit ? orderToEdit.id : `cond-ord-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      accountScope:accountTarget==='all'?'all_paper':'single',
      accountId:accountTarget==='all'?undefined:accountTarget,
      symbol: orderToEdit?.symbol || activeAsset.symbol,
      exchange: orderToEdit ? orderToEdit.exchange : (activeAsset.source || activeAsset.exchange),
      marketType: orderToEdit ? orderToEdit.marketType : activeAsset.marketType,
      chainId:orderToEdit?orderToEdit.chainId:activeAsset.chainId,
      pairAddress:orderToEdit?orderToEdit.pairAddress:activeAsset.pairAddress,
      title: title || `Conditional ${action.replace('_', ' ').toUpperCase()} on ${activeAsset.symbol}`,
      conditionLogic: logicType,
      conditions,
      action,
      execution: {
        orderType,
        limitPrice: orderType === 'limit' ? limitPrice : undefined,
        size,
        sizeUnit,
        positionId:positionTarget||undefined,
        dynamicTrailing:action==='sl_dynamic'?dynamicSettings:undefined,
        tpPercent: action.includes('enter') || action === 'tp' ? tpPercent : undefined,
        slPercent: action.includes('enter') || action === 'sl_set' ? slPercent : undefined,
        trailingPercent: action === 'sl_trailing' ? trailingPercent : undefined,
        reducePercent: action === 'reduce_position' ? reducePercent : undefined,
        increasePercent: action === 'increase_position' ? increasePercent : undefined,
      },
      status: orderToEdit?.status || 'active',
      createdAt: orderToEdit ? orderToEdit.createdAt : Date.now(),
      triggerCount: orderToEdit ? orderToEdit.triggerCount : 0,
      maxTriggers: logicType === 'WHENEVER'||logicType==='WHILE' ? 9999 : 1,
      notes,
      sourceDependency: initialDependency
        ? {
            type: initialDependency.type,
            id: initialDependency.id || '',
            label: initialDependency.label,
            price: initialDependency.price,
          }
        : orderToEdit?.sourceDependency,
    };
  };

  const handleSave = () => {
    const order = buildOrderObject();
    if(!ruleCanActivate(order)){
      setValidationError('This rule has invalid/unavailable conditions, size, or protection settings. Select a supported drawing, threshold and action.');
      return;
    }
    const invalidDrawing=order.conditions.some(c=>c.dependencyType==='drawing'&&
      (!drawings.some(d=>d.id===c.dependencyId)||
        (['enters_zone','exits_zone','inside_zone','outside_zone'].includes(c.operator)&&
          drawings.find(d=>d.id===c.dependencyId)?.type!=='rectangle')));
    if(invalidDrawing){
      setValidationError('Select an existing chart drawing. Zone entry/exit operators require a rectangle.');
      return;
    }
    if(accountTarget!=='all'&&!accountOptions.some(a=>a.id===accountTarget)){
      setValidationError('Select an existing paper account.');return;
    }
    if(action==='sl_dynamic'&&!validDynamicTrail(dynamicSettings)){
      setValidationError('Check ATR period, lookback, multiplier and timeframe.');return;
    }
    setValidationError('');
    onSaveOrder(order);
    onClose();
  };

  const handleTest = () => {
    const order = buildOrderObject();
    onTestTrigger?.(order);
  };

  // Preview statement text
  const previewStatement = () => {
    const condSummary = conditions
      .map((c) => {
        const opStr = c.operator.replace('_', ' ');
        const valStr = c.thresholdValue != null ? ` ($${c.thresholdValue})` : '';
        return `${c.dependencyLabel} ${opStr}${valStr}`;
      })
      .join(` ${logicType === 'IF (AND)' ? 'AND' : logicType === 'IF (OR)' ? 'OR' : '&'} `);

    let actionSummary = '';
    switch (action) {
      case 'enter_long':
        actionSummary = `Enter Long ${size} ${sizeUnit} (TP: +${tpPercent}%, SL: -${slPercent}%)`;
        break;
      case 'enter_short':
        actionSummary = `Enter Short ${size} ${sizeUnit} (TP: +${tpPercent}%, SL: -${slPercent}%)`;
        break;
      case 'exit_long':
        actionSummary = `Exit Long Position (Market Close)`;
        break;
      case 'exit_short':
        actionSummary = `Exit Short Position (Market Close)`;
        break;
      case 'tp':
        actionSummary = `Take Profit (Lock In +${tpPercent}%)`;
        break;
      case 'sl_set':
        actionSummary = `Set Fixed Stop Loss (-${slPercent}%)`;
        break;
      case 'sl_trailing':
        actionSummary = `Activate Trailing Stop (${trailingPercent}% offset)`;
        break;
      case 'sl_dynamic':
        actionSummary = `Enable Dynamic Chandelier Stop (ATR ${dynamicSettings.period} × ${dynamicSettings.multiplier} on ${dynamicSettings.timeframe})`;
        break;
      case 'reduce_position':
        actionSummary = `Reduce Position by ${reducePercent}%`;
        break;
      case 'increase_position':
        actionSummary = `Scale In / Increase Position by ${increasePercent}%`;
        break;
      case 'cancel_all':
        actionSummary = `Cancel All Pending Orders`;
        break;
    }

    return `${logicType} ${condSummary || 'Condition'} ➜ THEN ${actionSummary}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        id="conditional-order-builder-modal"
        className="w-full max-w-2xl bg-[#131722] border border-[#2a2e39] rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-[#d1d4dc] font-sans"
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#1e222d] border-b border-[#2a2e39] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#2962ff]/20 border border-[#2962ff]/40 flex items-center justify-center text-[#2962ff]">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">
                  {orderToEdit ? 'Edit Conditional Order' : 'Create Conditional Order'}
                </h3>
                <span className="px-1.5 py-0.5 rounded bg-[#2962ff] text-white text-[10px] font-bold">
                  {activeAsset.symbol}
                </span>
                <span className="text-[10px] text-[#787b86]">
                  {activeAsset.source||activeAsset.exchange} • ${activeAsset.price.toFixed(activeAsset.digits)}
                </span>
              </div>
              <p className="text-[11px] text-[#787b86]">
                Automate entries, exits, TP, and trailing stops dependent on drawings, alerts & indicators
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Order Title */}
          <div>
            <label className="block text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-1">
              Order Rule Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Breakout Long on Resistance Trendline"
              className="w-full px-3 py-2 bg-[#1e222d] border border-[#2a2e39] rounded-lg text-white focus:outline-hidden focus:border-[#2962ff] transition text-xs"
            />
          </div>

          {/* Condition Logic Selector (IF, IF (AND), IF (OR), WHENEVER) */}
          <div>
            <label className="block text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-1.5">
              Condition Logic Operator
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { type: 'IF', desc: 'Single trigger event' },
                { type: 'IF (AND)', desc: 'All conditions required' },
                { type: 'IF (OR)', desc: 'Any condition triggers' },
                { type: 'WHENEVER', desc: 'Retrigger on a new false → true edge' },
                { type: 'WHILE', desc: 'Maintain condition; one action per activation' },
              ].map(({ type, desc }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLogicType(type as ConditionLogicType)}
                  className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                    logicType === type
                      ? 'bg-[#2962ff]/15 border-[#2962ff] text-white shadow-xs'
                      : 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:border-[#787b86]/60 hover:text-[#d1d4dc]'
                  }`}
                >
                  <span className={`font-bold text-xs ${logicType === type ? 'text-[#2962ff]' : 'text-white'}`}>
                    {type}
                  </span>
                  <span className="text-[10px] text-[#787b86] mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 bg-[#181b24] border border-[#2a2e39] rounded-xl space-y-2">
            <label className="block text-xs font-semibold text-[#c5d7f6]">Execution account</label>
            <select aria-label="Rule execution account" id="conditional-rule-account" value={accountTarget}
              onChange={e=>{
                setAccountTarget(e.target.value);
                setPositionTarget('');
                setConditions(prev=>prev.map(c=>c.dependencyType==='position'?
                  {...c,dependencyId:undefined,dependencyLabel:'Any matching position'}:c));
              }}
              className="w-full rounded-md border border-[#455066] bg-[#121823] px-3 py-2 text-[#ecf0f7] text-xs">
              {accountOptions.map(item=><option key={item.id} value={item.id}>{item.name} · {item.currency}{item.id===activeAccountId?' (active)':''}</option>)}
              <option value="all">Every Paper Account (independent execution)</option>
            </select>
            <p className="text-[10px] text-[#96a7c5]">Rule executions use the selected PAPER ledger(s) only; no real broker order is placed. Each account's market currency, available margin, quote freshness, and risk rules are checked independently. Unavailable accounts cannot fill.</p>
          </div>

          {/* Conditions & Dependencies Section */}
          <div className="p-3.5 bg-[#181b24] border border-[#2a2e39] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#2962ff]" />
                Trigger Dependencies & Events
              </span>

              {(logicType === 'IF (AND)' || logicType === 'IF (OR)' || logicType==='WHILE') && (
                <button
                  type="button"
                  onClick={handleAddCondition}
                  className="px-2 py-1 rounded bg-[#1e222d] border border-[#2a2e39] text-[#2962ff] hover:bg-[#2962ff] hover:text-white transition flex items-center gap-1 text-[11px] font-medium"
                >
                  <Plus className="w-3 h-3" />
                  Add Condition
                </button>
              )}
            </div>

            {/* List of Conditions */}
            <div className="space-y-2.5">
              {conditions.map((cond, idx) => (
                <div
                  key={cond.id}
                  className="p-3 bg-[#1e222d] border border-[#2a2e39] rounded-lg space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#787b86] uppercase tracking-wider">
                      Condition #{idx + 1}
                    </span>
                    {conditions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCondition(cond.id)}
                        className="text-[#787b86] hover:text-[#f23645] transition p-0.5"
                        title="Remove condition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {/* Dependency Type */}
                    <div>
                      <label className="block text-[10px] text-[#787b86] mb-1">Dependency Source</label>
                      <select
                        aria-label={`Condition ${idx+1} source`}
                        value={cond.dependencyType}
                        onChange={(e) =>
                          handleUpdateCondition(cond.id, {
                            dependencyType: e.target.value as DependencyType,
                          })
                        }
                        className="w-full px-2 py-1.5 bg-[#131722] border border-[#2a2e39] rounded text-white text-[11px] focus:outline-hidden focus:border-[#2962ff]"
                      >
                        <option value="drawing">📐 Drawing (Trendline / Zone)</option>
                        <option value="alert">🔔 Alert Event</option>
                        <option value="indicator">📊 RSI / Price − SMA20 (1m candle close)</option>
                        <option value="price">💲 Exact Price Level</option>
                        <option value="position">💼 Position PnL / Exists</option>
                        <option value="account">🏦 Paper Equity / Available Funds</option>
                        <option value="utc_session">🕒 UTC Trading Session</option>
                        <option value="volume" disabled title="Not implemented">🌊 Volume Surge</option>
                        <option value="orderbook" disabled title="Not implemented">📖 Order Book Imbalance</option>
                      </select>
                    </div>

                    {/* Comparison Operator */}
                    <div>
                      <label className="block text-[10px] text-[#787b86] mb-1">Operator</label>
                      <select
                        aria-label={`Condition ${idx+1} operator`}
                        value={cond.operator}
                        onChange={(e) =>
                          handleUpdateCondition(cond.id, {
                            operator: e.target.value as ComparisonOperator,
                          })
                        }
                        className="w-full px-2 py-1.5 bg-[#131722] border border-[#2a2e39] rounded text-white text-[11px] focus:outline-hidden focus:border-[#2962ff]"
                      >
                        {(cond.dependencyType==='drawing'?[
                          ['crosses_above','Crosses Above'],['crosses_below','Crosses Below'],
                          ['crosses_either','Crosses Either Direction'],['touches','Touches Level'],
                          ['greater_than','Above Drawing'],['less_than','Below Drawing'],
                          ['enters_zone','Enters Rectangle'],['exits_zone','Exits Rectangle'],
                          ['inside_zone','Inside Rectangle'],['outside_zone','Outside Rectangle'],
                        ]:cond.dependencyType==='alert'?[
                          ['triggered','Alert Fired (New Event)'],
                        ]:cond.dependencyType==='position'?[
                          ['position_exists','Position Exists'],['pnl_above_percent','PnL ≥ +%'],
                          ['pnl_below_percent','PnL ≤ −%'],
                        ]:cond.dependencyType==='account'?[
                          ['equity_greater_than','Equity Above'],['equity_less_than','Equity Below'],
                          ['available_greater_than','Available Funds Above'],['available_less_than','Available Funds Below'],
                        ]:cond.dependencyType==='utc_session'?[
                          ['in_utc_hours','Within UTC Hours'],['outside_utc_hours','Outside UTC Hours'],
                        ]:cond.dependencyType==='indicator'?[
                          ['crosses_above','Crosses Above'],['crosses_below','Crosses Below'],
                          ['greater_than','Greater Than'],['less_than','Less Than'],
                        ]:[
                          ['crosses_above','Crosses Above'],['crosses_below','Crosses Below'],
                          ['crosses_either','Crosses Either Direction'],['touches','Touches Level'],
                          ['greater_than','Greater Than'],['less_than','Less Than']
                        ]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>

                    {/* Target Value / Threshold */}
                    <div>
                      <label className="block text-[10px] text-[#787b86] mb-1">Threshold / Level</label>
                      <div className="flex items-center gap-1">
                        <input
                          aria-label={`Condition ${idx+1} threshold`}
                          type="number"
                          step="any"
                          value={cond.thresholdValue != null ? cond.thresholdValue : ''}
                          onChange={(e) =>
                            handleUpdateCondition(cond.id, {
                              thresholdValue: parseFloat(e.target.value) || 0,
                            })
                          }
                          placeholder="Price / Level"
                          className="w-full px-2 py-1.5 bg-[#131722] border border-[#2a2e39] rounded text-white font-mono text-[11px] focus:outline-hidden focus:border-[#2962ff]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateCondition(cond.id, { thresholdValue: activeAsset.price })
                          }
                          className="px-1.5 py-1.5 bg-[#131722] border border-[#2a2e39] rounded text-[10px] text-[#787b86] hover:text-white"
                          title="Set to Current Price"
                        >
                          Curr
                        </button>
                      </div>
                    </div>
                  </div>

                  {cond.dependencyType==='indicator'&&(
                    <div className="mt-1 pt-1.5 border-t border-[#2a2e39]/60 space-y-1">
                      <label className="flex items-center gap-2 text-[11px] text-[#aeb9c9]">
                        Completed 1-minute indicator
                        <select value={cond.dependencyId||'rsi14'}
                          onChange={e=>handleUpdateCondition(cond.id,{
                            dependencyId:e.target.value,
                            dependencyLabel:e.target.value==='rsi14'?'RSI (14) · completed 1m':'Close − SMA (20) · completed 1m',
                            thresholdValue:e.target.value==='rsi14'?70:0,
                            operator:'crosses_above',
                          })}
                          className="px-2 py-1 bg-[#131722] border border-[#2a2e39] rounded text-white">
                          <option value="rsi14">RSI (14)</option>
                          <option value="price_minus_sma20">Close − SMA (20)</option>
                        </select>
                      </label>
                      <p className="text-[10px] text-[#99a6b7]">Only finalized, consecutive real 1m candles qualify. No trigger without verified history and a live trade print. Browser must remain open.</p>
                    </div>
                  )}
                  {/* If drawing, allow selecting which drawing on chart */}
                  {cond.dependencyType === 'drawing' && drawings.length > 0 && (
                    <div className="mt-1 pt-1.5 border-t border-[#2a2e39]/60 flex items-center gap-2 text-[11px]">
                      <span className="text-[#787b86]">Select Chart Drawing:</span>
                      <select
                        value={cond.dependencyId || ''}
                        onChange={(e) => {
                          const found = drawings.find((d) => d.id === e.target.value);
                          if (found) {
                            const p = found.points[0]?.price || activeAsset.price;
                            handleUpdateCondition(cond.id, {
                              dependencyId: found.id,
                              dependencyLabel: `${found.type.toUpperCase()} (${found.label || `#${found.id.slice(0, 4)}`}) at $${p.toFixed(activeAsset.digits)}`,
                              thresholdValue: p,
                            });
                          }
                        }}
                        className="flex-1 px-2 py-1 bg-[#131722] border border-[#2a2e39] rounded text-[#d1d4dc]"
                      >
                        {drawings.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.type.toUpperCase()} ({d.label || `#${d.id.slice(0, 4)}`}) • $
                            {(d.points[0]?.price || activeAsset.price).toFixed(activeAsset.digits)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {cond.dependencyType==='utc_session'&&<label className="flex items-center gap-2 text-[11px] text-[#b9c9e1]">
                    UTC End Hour (0–23.75)
                    <input aria-label="UTC session end hour" type="number" step="0.25" min="0" max="23.75"
                      value={cond.secondaryValue??17} onChange={e=>handleUpdateCondition(cond.id,{secondaryValue:Number(e.target.value)})}
                      className="w-20 bg-[#131722] border border-[#49516a] rounded px-2 py-1 text-white"/>
                  </label>}
                  {cond.dependencyType==='position'&&<label className="flex gap-2 items-center text-[11px] text-[#b7c9e0]">
                    Specific Position
                    <select aria-label="Condition position" value={cond.dependencyId||''}
                      onChange={e=>handleUpdateCondition(cond.id,{dependencyId:e.target.value||undefined,
                        dependencyLabel:e.target.value?'Position '+e.target.value:'Any matching position'})}
                      className="flex-1 min-w-0 bg-[#131722] border border-[#49516a] rounded px-2 py-1 text-[#edf1f7]">
                      <option value="">Any matching position</option>
                      {(accountTarget==='all'?[]:scopedPositions).map(p=><option key={p.id} value={p.id}>{p.side} {p.symbol} · {p.qty} units · {p.id.slice(0,10)}</option>)}
                    </select>
                  </label>}
                  {/* If alert, allow selecting which alert */}
                  {cond.dependencyType === 'alert' && alerts.length > 0 && (
                    <div className="mt-1 pt-1.5 border-t border-[#2a2e39]/60 flex items-center gap-2 text-[11px]">
                      <span className="text-[#787b86]">Select Alert:</span>
                      <select
                        value={cond.dependencyId || ''}
                        onChange={(e) => {
                          const found = alerts.find((a) => a.id === e.target.value);
                          if (found) {
                            handleUpdateCondition(cond.id, {
                              dependencyId: found.id,
                              dependencyLabel: `Alert: "${found.title}"`,
                            });
                          }
                        }}
                        className="flex-1 px-2 py-1 bg-[#131722] border border-[#2a2e39] rounded text-[#d1d4dc]"
                      >
                        {alerts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title} ({a.symbol} • {a.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* THEN Action Section (Order Execution) */}
          <div className="p-3.5 bg-[#181b24] border border-[#2a2e39] rounded-xl space-y-3">
            <span className="font-bold text-xs text-white flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-[#00ffa3]" />
              THEN Action & Order Execution
            </span>

            {/* Action Buttons Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { type: 'enter_long', label: 'Enter Long', color: 'hover:border-[#089981] hover:text-[#089981]', active: 'bg-[#089981]/20 border-[#089981] text-[#089981]' },
                { type: 'enter_short', label: 'Enter Short', color: 'hover:border-[#f23645] hover:text-[#f23645]', active: 'bg-[#f23645]/20 border-[#f23645] text-[#f23645]' },
                { type: 'exit_long', label: 'Exit Long', color: 'hover:border-[#2962ff] hover:text-[#2962ff]', active: 'bg-[#2962ff]/20 border-[#2962ff] text-[#2962ff]' },
                { type: 'exit_short', label: 'Exit Short', color: 'hover:border-[#2962ff] hover:text-[#2962ff]', active: 'bg-[#2962ff]/20 border-[#2962ff] text-[#2962ff]' },
                { type: 'tp', label: 'TP (Take Profit)', color: 'hover:border-[#089981] hover:text-[#089981]', active: 'bg-[#089981]/20 border-[#089981] text-[#089981]' },
                { type: 'sl_set', label: 'SL (Set Fixed)', color: 'hover:border-[#f23645] hover:text-[#f23645]', active: 'bg-[#f23645]/20 border-[#f23645] text-[#f23645]' },
                { type: 'sl_dynamic', label: 'Dynamic ATR Stop', color: 'hover:border-[#fbba59] hover:text-[#fbba59]', active: 'bg-[#fbba59]/20 border-[#fbba59] text-[#fbba59]' },
                { type: 'sl_trailing', label: 'SL (Trailing Stop)', color: 'hover:border-[#ff9800] hover:text-[#ff9800]', active: 'bg-[#ff9800]/20 border-[#ff9800] text-[#ff9800]' },
                { type: 'reduce_position', label: 'Reduce Position', color: 'hover:border-[#9c27b0] hover:text-[#9c27b0]', active: 'bg-[#9c27b0]/20 border-[#9c27b0] text-[#9c27b0]' },
                { type: 'increase_position', label: 'Increase / Scale In', color: 'hover:border-[#00bcd4] hover:text-[#00bcd4]', active: 'bg-[#00bcd4]/20 border-[#00bcd4] text-[#00bcd4]' },
                { type: 'cancel_all', label: 'Cancel All Orders', color: 'hover:border-[#787b86] hover:text-white', active: 'bg-[#787b86]/20 border-[#787b86] text-white' },
              ].map(({ type, label, active, color }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAction(type as OrderActionType)}
                  className={`p-2 rounded-lg border text-center font-bold text-xs transition ${
                    action === type
                      ? active
                      : `bg-[#1e222d] border-[#2a2e39] text-[#787b86] ${color}`
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(action==='exit_long'||action==='exit_short'||action==='tp'||action==='sl_set'||
              action==='sl_trailing'||action==='sl_dynamic'||action==='reduce_position')&&
              <label className="block text-[11px] text-[#b4c6e0]">Target Position
                <select aria-label="Target position" value={positionTarget} onChange={e=>setPositionTarget(e.target.value)}
                  className="mt-1 w-full bg-[#131722] border border-[#46536b] rounded px-2 py-1.5 text-white">
                  <option value="">First matching position on each selected account</option>
                  {(accountTarget==='all'?[]:scopedPositions).map(p=><option key={p.id} value={p.id}>{p.side} {p.symbol} · {p.qty} units · {p.id.slice(0,8)}</option>)}
                </select>
              </label>}
            {/* Execution Detail Parameters */}
            {action !== 'cancel_all' && (
              <div className="pt-2 border-t border-[#2a2e39]/60 grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Order Type */}
                <div>
                  <label className="block text-[10px] text-[#787b86] mb-1">Order Type</label>
                  <div className="flex rounded border border-[#2a2e39] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOrderType('market')}
                      className={`flex-1 py-1 text-center font-medium transition ${
                        orderType === 'market' ? 'bg-[#2962ff] text-white' : 'bg-[#1e222d] text-[#787b86]'
                      }`}
                    >
                      Market
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderType('limit')}
                      className={`flex-1 py-1 text-center font-medium transition ${
                        orderType === 'limit' ? 'bg-[#2962ff] text-white' : 'bg-[#1e222d] text-[#787b86]'
                      }`}
                    >
                      Limit
                    </button>
                  </div>
                </div>

                {/* Limit Price if Limit */}
                {orderType === 'limit' && (
                  <div>
                    <label className="block text-[10px] text-[#787b86] mb-1">Limit Price ($)</label>
                    <input
                      type="number"
                      step="any"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded text-white font-mono"
                    />
                  </div>
                )}

                {/* Order Size */}
                {(action.includes('enter') || action === 'increase_position') && (
                  <div>
                    <label className="block text-[10px] text-[#787b86] mb-1">Position Size</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        value={size}
                        onChange={(e) => setSize(parseFloat(e.target.value) || 0)}
                        className="flex-1 px-2 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded text-white font-mono"
                      />
                      <select
                        value={sizeUnit}
                        onChange={(e) => setSizeUnit(e.target.value as any)}
                        className="px-2 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[#d1d4dc]"
                      >
                        <option value="units">{activeAsset.symbol.replace('USD', '')}</option>
                        <option value="usd">USD</option>
                        <option value="percent">% Available Funds</option>
                        <option value="equity_percent">% of Equity</option>
                      </select>
                    </div>
                  </div>
                )}

                {(action.includes('enter')||action==='increase_position')&&<div className="flex items-end">
                  <button type="button" className="rounded border border-[#4c66a1] px-3 py-2 text-[11px] text-[#a8caff] hover:bg-[#293959]"
                    onClick={()=>{setSizeUnit('equity_percent');setSize(99);}}>
                    Use 99% of Equity
                  </button>
                </div>}
                {/* TP & SL for Entry orders */}
                {action.includes('enter') && (
                  <>
                    <div>
                      <label className="block text-[10px] text-[#089981] mb-1">Take Profit Target (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={tpPercent}
                        onChange={(e) => setTpPercent(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[#089981] font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#f23645] mb-1">Stop Loss Limit (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={slPercent}
                        onChange={(e) => setSlPercent(parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[#f23645] font-mono font-bold"
                      />
                    </div>
                  </>
                )}

                {/* Trailing Stop Loss Offset */}
                {action === 'sl_trailing' && (
                  <div>
                    <label className="block text-[10px] text-[#ff9800] mb-1">Trailing Offset (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={trailingPercent}
                      onChange={(e) => setTrailingPercent(parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[#ff9800] font-mono font-bold"
                      placeholder="e.g. 1.8%"
                    />
                  </div>
                )}

                {action==='sl_dynamic'&&<div className="md:col-span-3 space-y-2 rounded-md border border-[#4a5266] bg-[#202938] p-3">
                  <strong className="block text-xs text-[#ffd08a]">Chandelier Exit · Wilder ATR (Closed Candles)</strong>
                  <p className="text-[10px] text-[#a6b7d2]">Long: highest high − ATR × factor. Short: lowest low + ATR × factor. Stop only tightens. Requires real historical candles; missing bars leave the existing fixed stop in place.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="text-[10px] text-[#abbdd7]">ATR Period
                      <input aria-label="Dynamic ATR period" type="number" min="2" max="100" step="1"
                        value={dynamicSettings.period} onChange={e=>setDynamicSettings(v=>({...v,period:Number(e.target.value)}))}
                        className="mt-1 w-full bg-[#141d2b] border border-[#4a576e] rounded p-1.5 text-white"/></label>
                    <label className="text-[10px] text-[#abbdd7]">High/Low Lookback
                      <input aria-label="Dynamic lookback" type="number" min="2" max="100" step="1"
                        value={dynamicSettings.lookback} onChange={e=>setDynamicSettings(v=>({...v,lookback:Number(e.target.value)}))}
                        className="mt-1 w-full bg-[#141d2b] border border-[#4a576e] rounded p-1.5 text-white"/></label>
                    <label className="text-[10px] text-[#abbdd7]">ATR Multiplier
                      <input aria-label="Dynamic ATR multiplier" type="number" min="0.25" max="10" step="0.25"
                        value={dynamicSettings.multiplier} onChange={e=>setDynamicSettings(v=>({...v,multiplier:Number(e.target.value)}))}
                        className="mt-1 w-full bg-[#141d2b] border border-[#4a576e] rounded p-1.5 text-white"/></label>
                    <label className="text-[10px] text-[#abbdd7]">Candle Timeframe
                      <select aria-label="Dynamic timeframe" value={dynamicSettings.timeframe}
                        onChange={e=>setDynamicSettings(v=>({...v,timeframe:e.target.value as DynamicTrailingSettings['timeframe']}))}
                        className="mt-1 w-full bg-[#141d2b] border border-[#4a576e] rounded p-1.5 text-white">
                        {['1m','5m','15m','1h','4h','1D'].map(tf=><option key={tf} value={tf}>{tf}</option>)}
                      </select></label>
                  </div>
                </div>}
                {/* Reduce Position % */}
                {action === 'reduce_position' && (
                  <div>
                    <label className="block text-[10px] text-[#9c27b0] mb-1">Reduce Size (%)</label>
                    <div className="flex gap-1">
                      {[25, 50, 75, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setReducePercent(pct)}
                          className={`flex-1 py-1 rounded border text-[10px] font-bold ${
                            reducePercent === pct
                              ? 'bg-[#9c27b0] border-[#9c27b0] text-white'
                              : 'bg-[#1e222d] border-[#2a2e39] text-[#787b86]'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-[10px] text-[#a7b9d5]">IF triggers once. WHENEVER and WHILE respond to a new false → true transition, not every tick. Dynamic ATR protection continues once activated even when a WHILE rule becomes false; stops never loosen automatically.</p>
          {/* Interactive Sentence Preview */}
          <div className="p-3 bg-[#1e222d] border border-[#2a2e39] rounded-xl flex items-center gap-2.5">
            <Info className="w-4 h-4 text-[#2962ff] shrink-0" />
            <div className="text-[11px] text-[#d1d4dc] font-mono leading-relaxed">
              <span className="text-[#787b86]">Rule Logic: </span>
              <span className="font-bold text-white">{previewStatement()}</span>
            </div>
          </div>
        </div>

        {validationError&&<p role="alert" className="px-5 py-2 text-xs text-[#ffc5c5] bg-[#3c2634]">{validationError}</p>}
        {/* Modal Footer */}
        <div className="px-5 py-3 bg-[#1e222d] border-t border-[#2a2e39] flex items-center justify-between">
          <button
            type="button"
            onClick={handleTest}
            className="px-3 py-1.5 rounded-lg bg-[#131722] border border-[#2a2e39] text-[#00ffa3] hover:bg-[#00ffa3]/10 hover:border-[#00ffa3] transition flex items-center gap-1.5 font-bold text-xs"
            title="Simulate triggering this conditional order now"
          >
            <Play className="w-3.5 h-3.5" />
            Test Trigger (Simulate)
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-[#2a2e39] text-[#787b86] hover:text-white hover:bg-[#131722] transition text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-[#2962ff] text-white hover:bg-[#1e53e5] font-bold text-xs transition shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {orderToEdit ? 'Save & Re-arm Revision' : 'Create Conditional Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
