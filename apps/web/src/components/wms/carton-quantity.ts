// Presentation/conversion for bounded operational rows. Never round a command.
export function cartonQuantity(value: string, piecesPerCarton?: number): string {
  if (!Number.isSafeInteger(piecesPerCarton) || !piecesPerCarton || piecesPerCarton < 1 || !/^-?\d+(?:\.\d+)?$/.test(value)) return "—";
  const negative=value.startsWith("-"), [whole,part=""]=value.replace(/^-/u,"").split(".");
  const numerator=BigInt(whole!+part), denominator=10n**BigInt(part.length)*BigInt(piecesPerCarton);
  const integer=numerator/denominator; let remainder=numerator%denominator, fraction="";
  for(let i=0;i<6&&remainder!==0n;i++){remainder*=10n;fraction+=(remainder/denominator).toString();remainder%=denominator;}
  return `${remainder!==0n?"≈ ":""}${negative&&numerator!==0n?"-":""}${integer}${fraction?"."+fraction:""}`;
}
export function cartonToBase(value:string,piecesPerCarton:number):string {
  if(!Number.isSafeInteger(piecesPerCarton)||piecesPerCarton<1||!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value)) throw Error("Invalid carton quantity");
  const [whole,part=""]=value.split("."),scale=10n**BigInt(part.length),base=BigInt(whole!+part)*BigInt(piecesPerCarton);
  if(base%scale!==0n)throw Error("Cartons must resolve to whole pieces");
  return (base/scale).toString();
}
export function quantityInRecordedUnit(value:string,unit:string,piecesPerCarton?:number):string {
  if(unit==="CARTON")return value;
  try{return cartonToBase(value,piecesPerCarton??0);}catch{return "";}
}
