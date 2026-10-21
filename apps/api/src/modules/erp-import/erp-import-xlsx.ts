import { BadRequestException } from "@nestjs/common";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";
import * as XLSX from "xlsx";
import type { ImportTemplate } from "../import-validation/import-validation.types";

type Entry={offset:number;compressed:number;size:number;method:number};
function xmlText(s:string):string{return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v:string)=>v[0]==='#'?String.fromCodePoint(v[1]?.toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[v.toLowerCase()]!);}
function attribute(s:string,name:string){return xmlText(s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]??'');}
/** Bounded ZIP/OpenXML ingestion, not an analytical query path. XML row chunks
 * are streamed through Node's inflater; XLSX's existing date decoder is reused.
 * No filesystem paths, formula evaluation, DTD or network resolution. */
export class ErpWorkbook {
  private entries=new Map<string,Entry>();
  sheets:Array<{name:string;path:string}>=[];
  private strings:string[]=[];
  constructor(private bytes:Buffer){
    if(bytes.length<22||bytes.length>64*1024*1024)throw new BadRequestException('ERP_XLSX_MAX_64MB');
    let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
    if(end<0)throw new BadRequestException('ERP_XLSX_INVALID_ZIP');
    const count=bytes.readUInt16LE(end+10);let cursor=bytes.readUInt32LE(end+16),total=0;
    if(count===65535||cursor===0xffffffff||count>2500)throw new BadRequestException('ERP_ZIP64_OR_ENTRY_LIMIT');
    for(let i=0;i<count;i++){
      if(cursor+46>bytes.length||bytes.readUInt32LE(cursor)!==0x02014b50)throw new BadRequestException('ERP_ZIP_DIRECTORY');
      const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24);
      const n=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),local=bytes.readUInt32LE(cursor+42);
      const name=bytes.subarray(cursor+46,cursor+46+n).toString('utf8');total+=size;
      if(flags&1||![0,8].includes(method)||total>2*1024**3||size>768*1024**2||name.includes('..')||name.startsWith('/')||local+30>bytes.length)throw new BadRequestException('ERP_UNSAFE_ZIP');
      const offset=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
      if(offset+compressed>bytes.length||this.entries.has(name))throw new BadRequestException('ERP_ZIP_ENTRY');
      this.entries.set(name,{offset,compressed,size,method});cursor+=46+n+extra+comment;
    }
    if([...this.entries.keys()].some(n=>/externalLinks|vbaProject/i.test(n)))throw new BadRequestException('ERP_EXTERNAL_LINKS_NOT_ALLOWED');
  }
  private async *chunks(name:string){
    const e=this.entries.get(name);if(!e)throw new BadRequestException('ERP_MISSING_XLSX_PART');
    const input=Readable.from((function*(b:Buffer){for(let i=0;i<b.length;i+=65536)yield b.subarray(i,i+65536);})(this.bytes.subarray(e.offset,e.offset+e.compressed)));
    const stream=e.method===8?input.pipe(createInflateRaw()):input;let size=0;
    // setEncoding preserves UTF-8 characters split between inflater chunks.
    stream.setEncoding('utf8');for await(const chunk of stream){size+=Buffer.byteLength(chunk);if(size>e.size||size>768*1024**2)throw new BadRequestException('ERP_ZIP_EXPANSION');yield String(chunk);}
    if(size!==e.size)throw new BadRequestException('ERP_ZIP_SIZE_MISMATCH');
  }
  private async text(name:string){let result='';for await(const c of this.chunks(name)){result+=c;if(result.length>4*1024*1024)throw new BadRequestException('ERP_METADATA_LIMIT');}if(/<!DOCTYPE|<!ENTITY/.test(result))throw new BadRequestException('ERP_XML_DTD');return result;}
  private async *fragments(name:string,tag:string){let pending='';const end=`</${tag}>`;for await(const c of this.chunks(name)){pending+=c;if(/<!DOCTYPE|<!ENTITY/.test(pending))throw new BadRequestException('ERP_XML_DTD');let i;while((i=pending.indexOf(end))>=0){const block=pending.slice(0,i+end.length);pending=pending.slice(i+end.length);yield block;}if(pending.length>1024*1024)throw new BadRequestException('ERP_XML_ROW_LIMIT');}}
  async initialize(){
    const workbook=await this.text('xl/workbook.xml'),rels=await this.text('xl/_rels/workbook.xml.rels');
    const targets=new Map<string,string>();for(const match of rels.matchAll(/<Relationship\b[^>]*>/g)){const id=attribute(match[0],'Id'),target=attribute(match[0],'Target');if(attribute(match[0],'TargetMode')==='External')throw new BadRequestException('ERP_EXTERNAL_LINK');targets.set(id,target.startsWith('/')?target.slice(1):'xl/'+target);}
    for(const m of workbook.matchAll(/<sheet\b[^>]*>/g)){const name=attribute(m[0],'name'),part=targets.get(attribute(m[0],'r:id'));if(!part||!this.entries.has(part))throw new BadRequestException('ERP_SHEET_TARGET');this.sheets.push({name,path:part});}
    if(this.entries.has('xl/sharedStrings.xml')){
      let bytes=0;for await(const block of this.fragments('xl/sharedStrings.xml','si')){const value=[...block.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>xmlText(m[1]!)).join('');bytes+=Buffer.byteLength(value);if(bytes>64*1024**2||this.strings.length>2000000)throw new BadRequestException('ERP_SHARED_STRINGS_LIMIT');this.strings.push(value);}
    }return this;
  }
  async *rows(sheet:{name:string;path:string},contract:ImportTemplate){
    let headers:string[]|undefined;
    for await(const block of this.fragments(sheet.path,'row')){
      const rowTag=block.match(/<row\b[^>]*>/)?.[0];if(!rowTag)continue;const rowNumber=Number(attribute(rowTag,'r'));if(!Number.isInteger(rowNumber)||rowNumber>2000000)throw new BadRequestException('ERP_ROW_LIMIT');
      const values:unknown[]=[];
      for(const cell of block.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const attrs=cell[1]!,body=cell[2]??'',ref=attribute(attrs,'r'),column=XLSX.utils.decode_col(ref.replace(/\d+$/,''));
        if(column>100)throw new BadRequestException('ERP_COLUMN_LIMIT');
        const type=attribute(attrs,'t'),raw=body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];let v:unknown=null;
        if(type==='inlineStr')v=[...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>xmlText(m[1]!)).join('');
        else if(type==='s'){v=this.strings[Number(raw)];if(v===undefined)throw new BadRequestException('ERP_SHARED_STRING_REFERENCE');}
        else if(raw!==undefined){v=type==='str'||type==='d'?xmlText(raw):Number(raw);if(type==='e')throw new BadRequestException('ERP_EXCEL_CELL_ERROR');}
        values[column]=v;
      }
      if(!headers){headers=values.map(v=>String(v??'').trim());const missing=contract.fields.filter(f=>f.required&&!headers!.includes(f.name)).map(f=>f.name);if(missing.length)throw new BadRequestException(`${contract.entity}: missing headers ${missing.join(', ')}`);if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw new BadRequestException('ERP_DUPLICATE_HEADERS');continue;}
      if(!values.some(v=>v!==null&&v!==undefined&&v!==''))continue;
      const row:Record<string,unknown>={};for(let c=0;c<headers.length;c++){const h=headers[c];if(!h)continue;let v=values[c]??null;const field=contract.fields.find(f=>f.name===h);
        if(field?.type==='Date'&&typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);v=d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:null;}
        else if(field?.type==='Date'&&typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v))v=v.slice(0,10);
        row[h]=v;
      }yield{row,rowNumber};
    }
  }
}
