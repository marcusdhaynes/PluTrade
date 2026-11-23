import {normalizePaperSettings,validatePaperSettings,type PaperSettings} from './paperTrading';

type SettingsField=
  'startingBalance'|'currency'|'feePercent'|'feeFixed'|'commissionEnabled'|'commissionMode'|
  'commissionAmount'|'perContract'|'perContractEnabled'|'spreadBps'|'slippageBps'|
  'marginControl'|'leverageStocks'|'leverageFutures'|'leverageForex'|'leverageCrypto'|'leverageOthers';

const aliases:Record<string,SettingsField>={
  startingbalance:'startingBalance',initialbalance:'startingBalance',initialcapital:'startingBalance',openingbalance:'startingBalance',
  currency:'currency',accountcurrency:'currency',
  feepercent:'feePercent',commissionpercent:'feePercent',commissionpercentage:'feePercent',percentfee:'feePercent',
  feefixed:'feeFixed',fixedfee:'feeFixed',
  commissionenabled:'commissionEnabled',commissionmode:'commissionMode',commissiontype:'commissionMode',
  commissionamount:'commissionAmount',commission:'commissionAmount',
  percontract:'perContract',futurespercontract:'perContract',contractfee:'perContract',
  percontractenabled:'perContractEnabled',
  spreadbps:'spreadBps',slippagebps:'slippageBps',
  margincontrol:'marginControl',leveragestocks:'leverageStocks',
  leveragefutures:'leverageFutures',leverageforex:'leverageForex',
  leveragecrypto:'leverageCrypto',leverageothers:'leverageOthers',
};
function fieldFor(key:string):SettingsField{
  const field=aliases[key.replace(/[^a-z0-9]/gi,'').toLowerCase()];
  if(!field)throw new Error('Unsupported account setting: '+key);
  return field;
}
function rowsFromCsv(text:string):Record<string,unknown>{
  const rows=text.trim().split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(rows.length<2||rows.length>50)throw new Error('CSV must contain a header and settings values.');
  const cells=rows.map(line=>line.split(',').map(cell=>cell.trim().replace(/^"|"$/g,'')));
  // Two-column key/value CSV or single-record header/value CSV.
  if(cells[0].length===2&&/^(field|setting|name)$/i.test(cells[0][0])&&/^value$/i.test(cells[0][1])){
    return Object.fromEntries(cells.slice(1).map(row=>{
      if(row.length!==2||!row[0])throw new Error('Each setting CSV row must have a field and value.');
      return [row[0],row[1]];
    }));
  }
  // A headerless two-column list must be checked BEFORE a two-row
  // header/value record; otherwise a two-setting preset is misread.
  if(cells.every(row=>row.length===2&&!!row[0]&&
    !!aliases[row[0].replace(/[^a-z0-9]/gi,'').toLowerCase()])){
    return Object.fromEntries(cells.map(row=>[row[0],row[1]]));
  }
  if(cells.length===2&&cells[0].length===cells[1].length&&cells[0].length>1){
    return Object.fromEntries(cells[0].map((key,i)=>[key,cells[1][i]]));
  }
  throw new Error('Use setting,value rows or one header row followed by one values row.');
}
function entriesFromText(text:string):Record<string,unknown>{
  const trimmed=text.trim();
  if(!trimmed||trimmed.length>65536)throw new Error('Import a nonempty settings preset under 64 KB.');
  let value:unknown;
  if(trimmed.startsWith('{')){
    try{value=JSON.parse(trimmed);}catch{throw new Error('Invalid JSON account settings preset.');}
    if(!value||typeof value!=='object'||Array.isArray(value))
      throw new Error('Account settings JSON must be an object.');
    const raw=value as Record<string,unknown>;
    if(raw.settings!==undefined){
      if(!raw.settings||typeof raw.settings!=='object'||Array.isArray(raw.settings))
        throw new Error('settings must be a JSON object.');
      value=raw.settings;
    }
    return value as Record<string,unknown>;
  }
  return rowsFromCsv(trimmed);
}
function numberValue(value:unknown,field:string){
  if(typeof value!=='number'&&typeof value!=='string')throw new Error('Invalid number for '+field);
  if(typeof value==='string'&&!value.trim())throw new Error('Missing number for '+field);
  const number=Number(value);
  if(!Number.isFinite(number))throw new Error('Invalid number for '+field);
  return number;
}
function boolValue(value:unknown,field:string){
  if(value===true||value===1||value==='true'||value==='1'||value==='yes')return true;
  if(value===false||value===0||value==='false'||value==='0'||value==='no')return false;
  throw new Error('Use true or false for '+field);
}

/** Imports only configuration. Never imports fills, positions, orders or cash
 * transactions and never changes an existing ledger until Save is confirmed. */
export function parsePaperSettingsPreset(
  text:string,current:PaperSettings,balanceLocked=false
):PaperSettings{
  const entries=entriesFromText(text);
  const settings=normalizePaperSettings(current);
  const parsed=new Map<SettingsField,unknown>();
  for(const [key,value] of Object.entries(entries)){
    if(key==='format')continue;
    const field=fieldFor(key);
    if(parsed.has(field))throw new Error('Duplicate account setting: '+field);
    parsed.set(field,value);
  }
  if(!parsed.size)throw new Error('No supported account settings found.');
  if(parsed.has('feePercent')&&parsed.has('feeFixed'))
    throw new Error('Choose one commission type, percent or fixed.');
  if((parsed.has('feePercent')||parsed.has('feeFixed'))&&
    (parsed.has('commissionAmount')||parsed.has('commissionMode')))
    throw new Error('Do not combine the shorthand fee fields with commission amount/mode.');

  for(const [field,value] of parsed){
    switch(field){
      case 'startingBalance':settings.startingBalance=numberValue(value,field);break;
      case 'currency':settings.currency=String(value).trim().toUpperCase();break;
      case 'feePercent':
        settings.commission={enabled:true,mode:'percent',amount:numberValue(value,field)};break;
      case 'feeFixed':
        settings.commission={enabled:true,mode:'fixed',amount:numberValue(value,field)};break;
      case 'commissionEnabled':
        settings.commission.enabled=boolValue(value,field);break;
      case 'commissionMode':
        if(value!=='percent'&&value!=='fixed')throw new Error('Commission mode must be percent or fixed.');
        settings.commission.mode=value;break;
      case 'commissionAmount':settings.commission.amount=numberValue(value,field);break;
      case 'perContract':settings.futuresOptions.perContract=numberValue(value,field);
        if(!parsed.has('perContractEnabled'))settings.futuresOptions.enabled=true;
        break;
      case 'perContractEnabled':settings.futuresOptions.enabled=boolValue(value,field);break;
      case 'spreadBps':settings.execution.spreadBps=numberValue(value,field);break;
      case 'slippageBps':settings.execution.slippageBps=numberValue(value,field);break;
      case 'marginControl':settings.marginControl=boolValue(value,field);break;
      case 'leverageStocks':settings.leverages.stocks=numberValue(value,field);break;
      case 'leverageFutures':settings.leverages.futures=numberValue(value,field);break;
      case 'leverageForex':settings.leverages.forex=numberValue(value,field);break;
      case 'leverageCrypto':settings.leverages.crypto=numberValue(value,field);break;
      case 'leverageOthers':settings.leverages.others=numberValue(value,field);break;
    }
  }
  if(balanceLocked&&(settings.startingBalance!==current.startingBalance||settings.currency!==current.currency))
    throw new Error('Opening balance and currency cannot be imported after trading. Create a new paper account for different starting capital.');
  validatePaperSettings(settings);
  return settings;
}
export function exportPaperSettingsPreset(settings:PaperSettings):string{
  validatePaperSettings(settings);
  return JSON.stringify({
    format:'plutrade-paper-settings-v1',
    startingBalance:settings.startingBalance,currency:settings.currency,
    commissionEnabled:settings.commission.enabled,commissionMode:settings.commission.mode,
    commissionAmount:settings.commission.amount,
    perContractEnabled:settings.futuresOptions.enabled,
    perContract:settings.futuresOptions.perContract,
    spreadBps:settings.execution.spreadBps,
    slippageBps:settings.execution.slippageBps,
    marginControl:settings.marginControl,
    leverageStocks:settings.leverages.stocks,
    leverageFutures:settings.leverages.futures,
    leverageForex:settings.leverages.forex,
    leverageCrypto:settings.leverages.crypto,
    leverageOthers:settings.leverages.others,
  },null,2);
}
