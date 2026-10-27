'use client';
import {Input} from '@/components/ui/input';
import {Field,type Text} from './shared';
import type {LoadingQuantityDraft} from './loading-pick-quantities';
export function LoadingQuantityFields({id,value,factor,onChange,t}:{id:string;value:LoadingQuantityDraft;factor:number;onChange:(value:LoadingQuantityDraft)=>void;t:Text}){
 return <div className="grid grid-cols-2 gap-3 max-w-sm">
  <Field id={`${id}-cartons`} label={t('wms.carton')}><Input id={`${id}-cartons`} type="number" min={0} max="999999999999" step={1} inputMode="numeric" dir="ltr" required value={value.cartons} onChange={e=>onChange({...value,cartons:e.target.value})}/></Field>
  <Field id={`${id}-pieces`} label={t('wms.loadingPack')}><Input id={`${id}-pieces`} type="number" min={0} max={factor-1} step={1} inputMode="numeric" dir="ltr" required value={value.pieces} onChange={e=>onChange({...value,pieces:e.target.value})}/></Field>
 </div>;
}
