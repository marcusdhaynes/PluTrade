import {strict as assert} from 'node:assert';
import {DEFAULT_PAPER_SETTINGS,paperCommission} from './paperTrading';
import {exportPaperSettingsPreset,parsePaperSettingsPreset} from './paperSettingsImport';

const fresh=DEFAULT_PAPER_SETTINGS;
const imported=parsePaperSettingsPreset(
  'field,value\nstartingBalance,25000\ncurrency,USD\nfeePercent,0.04\nspreadBps,2\nslippageBps,3\nleverageCrypto,10\nmarginControl,true',
  fresh);
assert.equal(imported.startingBalance,25000);
assert.equal(imported.currency,'USD');
assert.equal(imported.commission.enabled,true);
assert.equal(imported.commission.mode,'percent');
assert.equal(imported.commission.amount,0.04);
assert.equal(imported.execution.spreadBps,2);
assert.equal(imported.execution.slippageBps,3);
assert.equal(imported.marginControl,true);
assert.equal(imported.leverages.crypto,10);
assert.equal(fresh.commission.enabled,false,'import must not mutate current account');
const spot={category:'crypto' as const,marketType:'spot' as const};
assert.equal(paperCommission(imported,spot,2,100),0.08);
assert.equal(paperCommission(imported,spot,1,150),0.06);
const header=parsePaperSettingsPreset(
  'startingBalance,currency,feePercent\n1500,EUR,0.25',
  fresh);
assert.equal(header.startingBalance,1500);
assert.equal(header.commission.amount,0.25);
const twoSetting=parsePaperSettingsPreset('startingBalance,2000\nfeePercent,0.1',fresh);
assert.equal(twoSetting.startingBalance,2000);
assert.equal(twoSetting.commission.amount,0.1);
const futures=parsePaperSettingsPreset('{"perContract":1.25,"perContractEnabled":true}',fresh);
assert.equal(paperCommission(futures,{category:'futures',marketType:'futures'},4,200),5);
const disabled={...futures,futuresOptions:{enabled:false,perContract:1.25}};
const roundtrip=parsePaperSettingsPreset(exportPaperSettingsPreset(disabled),fresh);
assert.deepEqual(roundtrip,disabled);
assert.throws(()=>parsePaperSettingsPreset('{"startingBalance":30000}',imported,true),/cannot be imported/);
assert.throws(()=>parsePaperSettingsPreset('{"currency":"GBP"}',imported,true),/cannot be imported/);
assert.equal(parsePaperSettingsPreset('{"feePercent":0.1}',imported,true).startingBalance,25000);
assert.throws(()=>parsePaperSettingsPreset('{"feePercent":-1}',fresh),/negative/);
assert.throws(()=>parsePaperSettingsPreset('{"feePercent":101}',fresh),/exceed/);
assert.throws(()=>parsePaperSettingsPreset('{"feePercent":1,"feeFixed":2}',fresh),/one commission type/);
assert.throws(()=>parsePaperSettingsPreset('{"commissions":4}',fresh),/Unsupported/);
assert.throws(()=>parsePaperSettingsPreset('{"startingBalance":"broken"}',fresh),/Invalid number/);
assert.throws(()=>parsePaperSettingsPreset('{"settings":{}}',fresh),/No supported/);
assert.throws(()=>parsePaperSettingsPreset('{"unknown":"value"}',fresh),/Unsupported/);
assert.throws(()=>parsePaperSettingsPreset('field,value\nstartingBalance,banana',fresh),/Invalid number/);
assert.throws(()=>parsePaperSettingsPreset('not-an-account-preset',fresh),/CSV/);
console.log('Paper account settings import/export, fee arithmetic and locked balance: pass');
