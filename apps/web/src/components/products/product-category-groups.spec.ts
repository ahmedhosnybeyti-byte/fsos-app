import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
const ts=require("typescript");require.extensions[".tsx"]=(m:NodeModule,f:string)=>(m as any)._compile(ts.transpileModule(readFileSync(f,"utf8"),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {groupCategoryPage,ProductCategoryGroups}=require("./product-category-groups");
const {TranslationProvider}=require("../translation-provider");
const items=[{id:"milk",category:" ألبان ",quantity:"100"},{id:"chips",category:"سناكس",quantity:"75"},{id:"yogurt",category:"ألبان",quantity:"50"},{id:"other",category:null,quantity:"2"},{id:"blank",category:"  ",quantity:"4"}];
test("grouping keeps every authorized row once, normalizes missing category and retains original input indices",()=>{
 const before=JSON.stringify(items),groups=groupCategoryPage(items,(p:any)=>p.category);
 assert.deepEqual(groups.map((g:any)=>[g.category,g.entries.map((e:any)=>e.index)]),[["ألبان",[0,2]],["سناكس",[1]],["",[3,4]]]);
 assert.equal(JSON.stringify(items),before);assert.equal(groups.flatMap((g:any)=>g.entries).length,items.length);
 // An edit to chips after grouping must update source line 1, never yogurt.
 const edit=groups[1].entries[0];assert.equal(edit.index,1);assert.equal(edit.item.id,"chips");
});
function render(search="",rows=items){return renderToStaticMarkup(createElement(TranslationProvider,null,createElement(ProductCategoryGroups,{items:rows,search,renderItem:(p:any,index:number)=>createElement('p',{key:p.id,'data-source-index':index},p.id+': '+p.quantity)})));}
test("accordion matches closed-by-default Smart Loading, keeps mounted controlled fields and exposes keyboard semantics",()=>{
 const html=render();assert.equal((html.match(/aria-expanded="false"/g)??[]).length,3);assert.equal((html.match(/ hidden=""/g)??[]).length,3);
 assert.equal((html.match(/type="button"/g)??[]).length,3);assert.match(html,/aria-controls=/);assert.match(html,/focus-visible:ring/);
 assert.match(html,/غير مصنف/);assert.match(html,/data-source-index="1">chips: 75/);assert.match(html,/data-source-index="2">yogurt: 50/);
});
test("active search expands only supplied results; grouping never fetches or invents catalogue rows",()=>{
 const html=render('chips',[items[1]!]);assert.match(html,/aria-expanded="true"/);assert.doesNotMatch(html,/ hidden=""|milk|yogurt|غير مصنف/);assert.match(html,/chips: 75/);
 assert.equal(render('',[]),'<div class="min-w-0 space-y-2"></div>');
});
