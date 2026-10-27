import type {WmsLoad,WmsLoadLine} from '@field-sales-os/schemas';
import {cartonAndPieceParts} from './carton-quantity';
export type LoadingQuantityDraft={cartons:string;pieces:string};
export type LoadingQuantityDrafts=Record<string,LoadingQuantityDraft>;
export function wholePacks(draft:LoadingQuantityDraft,factor:number):bigint{
 if(!Number.isSafeInteger(factor)||factor<1||!/^\d{1,12}$/.test(draft.cartons)||!/^\d{1,12}$/.test(draft.pieces))throw Error('WMS_INVALID_QUANTITY');
 const pieces=BigInt(draft.pieces);if(pieces>=BigInt(factor))throw Error('WMS_INVALID_QUANTITY');
 const total=BigInt(draft.cartons)*BigInt(factor)+pieces;
 if(total>=1000000000000n)throw Error('WMS_INVALID_QUANTITY');return total;
}
function base(value:string):bigint{if(!/^\d+(?:\.0+)?$/.test(value))throw Error('WMS_INVALID_QUANTITY');return BigInt(value.split('.')[0]!);}
export function reservedByProduct(load:WmsLoad){
 const totals=new Map<string,bigint>();
 for(const a of load.allocations){if(a.baseUnit&&a.baseUnit!=='PIECE')continue;if(!a.productId)throw Error('WMS_INVALID_QUANTITY');totals.set(a.productId,(totals.get(a.productId)??0n)+base(a.reservedQuantity));}
 return totals;
}
export function defaultLoadingDraft(line:WmsLoadLine,reserved?:Map<string,bigint>):LoadingQuantityDraft{
 return cartonAndPieceParts(reserved?(reserved.get(line.productId)??0n).toString():line.requestedBase,line.piecesPerCarton)??{cartons:'0',pieces:'0'};
}
export function loadingPickAllocations(load:WmsLoad,drafts:LoadingQuantityDrafts,basePicks:Record<string,string>={}){
 const available=reservedByProduct(load),remaining=new Map<string,bigint>();
 for(const line of load.lines){
  if(line.baseUnit&&line.baseUnit!=='PIECE')continue;
  const total=wholePacks(drafts[line.productId]??defaultLoadingDraft(line,available),line.piecesPerCarton??0);
  if(total>(available.get(line.productId)??0n))throw Error('WMS_OVER_PICK');remaining.set(line.productId,total);
 }
 return load.allocations.map(a=>{
  if(a.baseUnit&&a.baseUnit!=='PIECE'){
   const quantity=basePicks[a.id]??a.reservedQuantity;
   if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(quantity))throw Error('WMS_INVALID_QUANTITY');
   const scaled=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole!)*1000000n+BigInt(fraction.padEnd(6,'0'));};
   if(scaled(quantity)>scaled(a.reservedQuantity))throw Error('WMS_OVER_PICK');return {id:a.id,quantity};
  }
  const wanted=remaining.get(a.productId!)??0n,held=base(a.reservedQuantity),picked=wanted<held?wanted:held;remaining.set(a.productId!,wanted-picked);return {id:a.id,quantity:picked.toString()};
 });
}
