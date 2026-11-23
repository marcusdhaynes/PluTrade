import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{ALLOWED_CHART_ORIGINS} from './history.js';
function response(){
 const headers={};
 return {headers,code:200,body:null,ended:false,
  setHeader(k,v){headers[k]=v;return this},
  status(code){this.code=code;return this},
  json(v){this.body=v;this.ended=true;return this},
  end(){this.ended=true;return this}};
}
const candle={time:1790000000000,open:100,high:103,low:99,close:101,volume:15};
test('approved web frontends receive the exact origin (never wildcard)',async()=>{
 const original=globalThis.fetch;
 let requested='';
 globalThis.fetch=async url=>{requested=String(url);return {ok:true,json:async()=>({candles:[candle]})}};
 try{
  for(const origin of ['https://plutrade.com','https://www.plutrade.com','https://marcusdhaynes.github.io']){
   assert.equal(ALLOWED_CHART_ORIGINS.has(origin),true);
   const res=response();
   await handler({headers:{origin},method:'GET',query:{symbol:'PF_ARBUSD',resolution:'1m'}},res);
   assert.equal(res.code,200);
   assert.equal(res.headers['Access-Control-Allow-Origin'],origin);
   assert.equal(res.headers['Vary'],'Origin');
   assert.equal(res.body.candles.length,1);
   assert.match(requested,/PF_ARBUSD\/1m/);
  }
 }finally{globalThis.fetch=original;}
});
test('untrusted origin does not receive CORS grant',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({candles:[candle]})});
 try{
  const res=response();
  await handler({headers:{origin:'https://example.invalid'},method:'GET',query:{symbol:'PF_ARBUSD',resolution:'1m'}},res);
  assert.equal(res.headers['Access-Control-Allow-Origin'],undefined);
 }finally{globalThis.fetch=original;}
});
test('preflight is explicit and does not authorize other sites',async()=>{
 for(const [origin,expected] of [['https://plutrade.com',204],['https://example.invalid',403]]){
  const res=response();
  await handler({headers:{origin},method:'OPTIONS',query:{}},res);
  assert.equal(res.code,expected);
  assert.equal(res.ended,true);
  if(expected===204)assert.equal(res.headers['Access-Control-Allow-Methods'],'GET, OPTIONS');
 }
});
test('invalid market identifiers are refused before fetching',async()=>{
 const res=response();
 await handler({headers:{origin:'https://plutrade.com'},method:'GET',
  query:{symbol:'../../secrets',resolution:'1m'}},res);
 assert.equal(res.code,400);
});
