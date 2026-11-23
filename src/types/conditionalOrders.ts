import type {DynamicTrailingSettings} from '../services/dynamicTrailing';
import { Drawing, DetailedAlert, Timeframe, Asset } from '../types';

export type ConditionLogicType = 'IF' | 'IF (AND)' | 'IF (OR)' | 'WHENEVER' | 'WHILE';

export type DependencyType =
  | 'drawing'
  | 'alert'
  | 'indicator'
  | 'price'
  | 'position'
  | 'account'
  | 'utc_session'
  | 'volume'
  | 'orderbook';

export type ComparisonOperator =
  | 'crosses_above'
  | 'crosses_below'
  | 'crosses_either'
  | 'enters_zone'
  | 'exits_zone'
  | 'inside_zone'
  | 'outside_zone'
  | 'touches'
  | 'greater_than'
  | 'less_than'
  | 'triggered'
  | 'pnl_above_percent'
  | 'pnl_below_percent'
  | 'position_exists'
  | 'equity_greater_than'
  | 'equity_less_than'
  | 'available_greater_than'
  | 'available_less_than'
  | 'in_utc_hours'
  | 'outside_utc_hours';

export interface SingleCondition {
  id: string;
  dependencyType: DependencyType;
  dependencyId?: string;
  dependencyLabel: string;
  operator: ComparisonOperator;
  thresholdValue?: number;
  secondaryValue?: number;
}

export type OrderActionType =
  | 'enter_long'
  | 'enter_short'
  | 'exit_long'
  | 'exit_short'
  | 'tp'
  | 'sl_set'
  | 'sl_trailing'
  | 'sl_dynamic'
  | 'reduce_position'
  | 'increase_position'
  | 'cancel_all';

export interface OrderExecutionDetails {
  orderType: 'market' | 'limit';
  positionId?:string;
  limitPrice?: number;
  size: number;
  sizeUnit: 'units' | 'usd' | 'percent' | 'equity_percent';
  tpPrice?: number;
  tpPercent?: number;
  slPrice?: number;
  slPercent?: number;
  trailingPercent?: number;
  dynamicTrailing?:DynamicTrailingSettings;
  reducePercent?: number;
  increasePercent?: number;
  leverage?: number;
}

export interface ConditionalOrder {
  id: string;
  symbol: string;
  /** Paper account this copy belongs to; never routes to an external broker. */
  accountId?:string;
  /** Saving to all paper accounts makes one independent rule per ledger. */
  accountScope?:'single'|'all_paper';
  exchange?: string;
  marketType?: Asset['marketType'];
  chainId?:string;
  pairAddress?:string;
  title: string;
  conditionLogic: ConditionLogicType;
  conditions: SingleCondition[];
  action: OrderActionType;
  execution: OrderExecutionDetails;
  status: 'active' | 'triggered' | 'paused' | 'cancelled';
  createdAt: number;
  triggeredAt?: number;
  lastTriggeredAt?: number;
  lastConditionSatisfied?: boolean;
  triggerCount: number;
  /** Historical executions from earlier revisions are retained for audit. */
  priorTriggerCount?:number;
  rearmCount?:number;
  maxTriggers: number; // 1 for IF/AND/OR, unlimited (9999) for WHENEVER
  notes?: string;
  sourceDependency?: {
    type: DependencyType;
    id: string;
    label: string;
    price?: number;
  };
}

export interface DependencyContext {
  type: DependencyType;
  id?: string;
  label: string;
  price?: number;
  drawing?: Drawing;
  alert?: DetailedAlert;
  indicatorKey?: string;
}
