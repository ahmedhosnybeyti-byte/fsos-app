"""Read-only offline Canonical audit. Uses the existing bundled openpyxl runtime.
No source row/contact/name is exported. Large key sets are ingestion QA only,
never an application request or a replacement for scoped PostgreSQL queries.
"""
import hashlib, json
from collections import Counter
from pathlib import Path
import openpyxl

root = Path.cwd()
if str(root).lower() != 'd:\\field sales os':
    raise RuntimeError('Official workspace required')
source = root / 'demo-data/FSOS_Canonical_Database_v1.0_Seed_Data.xlsx'
wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
keys = {
 'Companies':['CompanyID'], 'Sales Calendar':['CalendarDate'], 'Regions':['RegionID'],
 'Branches':['BranchID'], 'Employees':['EmployeeID'], 'Routes':['RouteID'],
 'Route Assignments':['AssignmentID'], 'Customers':['CustomerCode'], 'Products':['ProductCode'],
 'Price List':['PriceListCode','ProductCode','Unit','StartDate'], 'Invoices':['InvoiceNo'],
 'Invoice Items':['InvoiceNo','LineNo'], 'Visits':['VisitID'], 'Collections':['CollectionNo'],
 'Returns':['ReturnNo'], 'Return Items':['ReturnNo','LineNo'],
 'Van Loads':['LoadNo','ProductCode','Unit'], 'Van Inventory':['ReportDate','RouteID','ProductCode','Unit'],
 'Targets':['Month','Year','RouteID']}
refs = {
 'Regions': [('CompanyID','Companies','CompanyID')],
 'Branches':[('RegionID','Regions','RegionID')],
 'Employees':[('BranchID','Branches','BranchID'),('DirectManagerID','Employees','EmployeeID')],
 'Routes':[('BranchID','Branches','BranchID'),('SalesRepID','Employees','EmployeeID'),('SupervisorID','Employees','EmployeeID'),('ManagerID','Employees','EmployeeID')],
 'Route Assignments':[('RouteID','Routes','RouteID'),('EmployeeID','Employees','EmployeeID')],
 'Customers':[('BranchID','Branches','BranchID'),('RouteID','Routes','RouteID')],
 'Price List':[('ProductCode','Products','ProductCode')],
 'Invoices':[('CustomerCode','Customers','CustomerCode'),('RouteID','Routes','RouteID')],
 'Invoice Items':[('InvoiceNo','Invoices','InvoiceNo'),('ProductCode','Products','ProductCode'),('RouteID','Routes','RouteID')],
 'Visits':[('CustomerCode','Customers','CustomerCode'),('RouteID','Routes','RouteID'),('InvoiceNo','Invoices','InvoiceNo')],
 'Collections':[('CustomerCode','Customers','CustomerCode'),('RouteID','Routes','RouteID'),('InvoiceNo','Invoices','InvoiceNo')],
 'Returns':[('CustomerCode','Customers','CustomerCode'),('RouteID','Routes','RouteID'),('InvoiceNo','Invoices','InvoiceNo')],
 'Return Items':[('ReturnNo','Returns','ReturnNo'),('ProductCode','Products','ProductCode')],
 'Van Loads':[('RouteID','Routes','RouteID'),('ProductCode','Products','ProductCode')],
 'Van Inventory':[('RouteID','Routes','RouteID'),('ProductCode','Products','ProductCode')],
 'Targets':[('RouteID','Routes','RouteID')]}
def norm(v): return '' if v is None else str(v).strip()
all_ids, summaries = {}, []
# Retain only parent key indexes required by the next streaming pass.
needed = {(target, key) for rs in refs.values() for _, target, key in rs}
for name, keycols in keys.items():
    rows = iter(wb[name].values); headers = list(next(rows)); indexes = [headers.index(c) for c in keycols]
    parent_cols = [c for target,c in needed if target==name]
    parent_sets = {c:set() for c in parent_cols}; seen=set(); duplicates=blank=total=0
    for row in rows:
        if not any(v is not None for v in row): continue
        total+=1; key=tuple(norm(row[i]) for i in indexes)
        if any(not v for v in key): blank+=1
        if key in seen: duplicates+=1
        seen.add(key)
        for c in parent_cols: parent_sets[c].add(norm(row[headers.index(c)]))
    for c, values in parent_sets.items(): all_ids[(name,c)]=values
    summaries.append({'entity':name,'rows':total,'headers':headers,'blankKeys':blank,'duplicateKeys':duplicates})
    print(name, total, flush=True)
for summary in summaries:
    name=summary['entity']; broken=Counter()
    if refs.get(name):
        rows=iter(wb[name].values);headers=list(next(rows))
        for row in rows:
            for col,target,key in refs[name]:
                value=norm(row[headers.index(col)])
                if value and value not in all_ids[(target,key)]: broken[col]+=1
    summary['brokenReferences']=dict(broken)
result={'source':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sheets':summaries,
 'sourceCompanies':len(all_ids[('Companies','CompanyID')]),
 'operationalOpeningSource':'ABSENT: Van Inventory is a route snapshot; not warehouse opening stock or a general ledger',
 'demoPolicy':'Use structure only, generate synthetic identities/amounts, no historical operational posting'}
out=root/'.quality/company-modes/canonical-audit.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'entities':len(summaries),'rows':sum(s['rows'] for s in summaries),'duplicates':sum(s['duplicateKeys'] for s in summaries),'brokenReferences':sum(sum(s['brokenReferences'].values()) for s in summaries)}))
