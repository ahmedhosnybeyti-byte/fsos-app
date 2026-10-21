/** Form-only exact arithmetic; PostgreSQL owns authoritative ledger totals. */
export function halalas(value:string):bigint|null {
 if(!/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction=""]=value.split(".");return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,"0"));
}
export function money(value:bigint) {return `${value/100n}.${(value%100n).toString().padStart(2,"0")}`;}
export function journalTotals(lines:{debit:string;credit:string}[]) {
 let debit=0n,credit=0n,valid=lines.length>=2;
 for(const line of lines) {const d=halalas(line.debit),c=halalas(line.credit);if(d===null||c===null||(d===0n)===(c===0n)){valid=false;continue;}debit+=d;credit+=c;}
 return {debit:money(debit),credit:money(credit),balanced:valid&&debit>0n&&debit===credit};
}
