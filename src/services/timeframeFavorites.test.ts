import {strict as assert} from 'node:assert';
import {INITIAL_ASSETS} from '../data/assets';
import {CHART_INTERVALS,marketTimeframeKey,sanitizeTimeframeFavorites,
  updateMarketTimeframes,visibleTimeframeIntervals} from './timeframeFavorites';

const market=INITIAL_ASSETS[0];
const alternate={...market,source:'Another Venue',exchange:'Another Venue'};
const a=marketTimeframeKey(market),b=marketTimeframeKey(alternate);
assert.notEqual(a,b,'Favorites must be scoped to exact ticker and venue');
assert.equal(CHART_INTERVALS.length,19);
assert.deepEqual(visibleTimeframeIntervals({},a),CHART_INTERVALS);
const chosen=updateMarketTimeframes({},a,['1h','1m','1m','1D']);
assert.deepEqual(chosen[a],['1m','1h','1D'],'Favorites are unique and chronological');
assert.deepEqual(visibleTimeframeIntervals(chosen,a),['1m','1h','1D']);
assert.deepEqual(visibleTimeframeIntervals(chosen,b),CHART_INTERVALS);
assert.deepEqual(updateMarketTimeframes(chosen,a,[]),{},'Removing all favorites restores all timeframes');
assert.deepEqual(sanitizeTimeframeFavorites({
  [a]:['1m','bogus','1m','1s',null,'1h'],[b]:'not-an-array',
  notAMarket:[12,{},null],
})[a],['1s','1m','1h']);
assert.equal(visibleTimeframeIntervals(chosen,b).length,19);
assert.equal(chosen[a].length,3,'Updating another ticker must never mutate existing favorites');
console.log('Ticker-scoped timeframe favorite loadouts: pass');
