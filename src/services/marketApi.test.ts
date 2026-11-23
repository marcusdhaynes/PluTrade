import assert from 'node:assert/strict';
import {krakenFuturesHistoryUrl} from './marketApi';
const exact='PF_ARBUSD';
const live=krakenFuturesHistoryUrl('https://plutrade.com',exact,'1m');
assert.equal(live,'https://plutrade.com/api/kraken-history.php?symbol=PF_ARBUSD&resolution=1m');
assert.match(krakenFuturesHistoryUrl('https://www.plutrade.com',exact,'1m'),/^https:\/\/www\.plutrade\.com\/api\/kraken-history\.php/);
for(const other of ['https://marcusdhaynes.github.io','http://127.0.0.1:4173','https://evil.plutrade.com',undefined])
  assert.match(krakenFuturesHistoryUrl(other,exact,'1m'),/^https:\/\/plutrade-market-api\.vercel\.app\/api\/history/);
assert.ok(krakenFuturesHistoryUrl('https://plutrade.com','PF_ARBUSD&evil=1','1m')
  .includes('symbol=PF_ARBUSD%26evil%3D1'));
console.log('Kraken history uses exact same-origin route on DreamHost and preserves Pages provider.');
