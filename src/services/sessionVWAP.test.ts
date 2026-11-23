import assert from 'node:assert/strict';
import {calculateUtcSessionVwap,calculateAnchoredVwap} from './sessionVWAP';
const day=1795392000;
const b=[
  {time:day,open:10,high:12,low:8,close:10,volume:2},
  {time:day+60,open:14,high:16,low:12,close:14,volume:2},
  {time:day+86400,open:20,high:22,low:18,close:20,volume:3},
  {time:day+86460,open:21,high:23,low:19,close:21,volume:0},
];
const session=calculateUtcSessionVwap(b);
assert.equal(session.length,4);
assert.equal(session[0].value,10);
assert.equal(session[1].value,12);
assert.equal(session[2].value,20);
assert.equal(session[3].value,20);
const anchor=calculateAnchoredVwap(b,day+60);
assert.equal(anchor.length,3);
assert.equal(anchor[0].value,14);
assert.equal(anchor[1].value,(14*2+20*3)/5);
assert.equal(calculateAnchoredVwap(b,day+86401).length,1);
assert.equal(calculateAnchoredVwap(b,Infinity).length,0);
assert.deepEqual(calculateUtcSessionVwap([b[0],b[0],b[1]]).map(x=>x.time),[day,day+60]);
console.log('Session/anchored VWAP respects daily resets, strict chronology and no invented volume.');
