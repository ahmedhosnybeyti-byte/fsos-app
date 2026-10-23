// Explicit local synthetic verification, after sales-drafts-native.cjs.
// Checks cluster identity, clones its retained fixture, measures one request at a time,
// then drops only that clone. Never loads .env or targets the operating database.
// NOT a 25/50/100/150-user concurrency or capacity test.
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), net = require('net'), { execFileSync } = require('child_process'), { randomUUID, randomBytes, createHash } = require('crypto'), { AsyncLocalStorage } = require('async_hooks');
const root = process.cwd(), out = path.resolve('.quality/sales-drafts'), source = JSON.parse(fs.readFileSync(path.join(out, 'runtime-private.json')));
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--foundation-b1'));
const foundationB1=process.argv[2]==='--foundation-b1', evidenceName=foundationB1?'b1-performance':'performance';
assert.equal(root, 'D:\\Field Sales OS');
assert.match(source.database, /^sales_drafts_verify_[a-f0-9]{32}$/);
assert.equal(new URL(source.url).port, '55561');
assert.equal(new URL(source.url).hostname, '127.0.0.1');
assert.equal(new URL(source.url).pathname, '/' + source.database);
for (const k of Object.keys(process.env))
    if (!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))
        delete process.env[k];
process.env.PGCLIENTENCODING = 'UTF8';
process.env.PGCONNECT_TIMEOUT = '3';
const bin = path.resolve('.tmp/erp-blockers-20261019/pgsql/bin'), args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55561', '-U', 'wms_test'];
const sql = (s, d = 'postgres') => execFileSync(path.join(bin, 'psql.exe'), [...args, '-d', d, '-f', '-'], { input: Buffer.from(s), encoding: 'utf8', stdio: 'pipe' }).trim();
assert.equal(path.resolve(sql('SHOW data_directory')).toLowerCase(), path.resolve('.quality/wms/pgdata').toLowerCase());
const database = 'sales_drafts_perf_' + randomUUID().replaceAll('-', '');
assert.match(database, /^sales_drafts_perf_[a-f0-9]{32}$/);
const backup = path.join(out, evidenceName+'-synthetic-source.backup');
execFileSync(path.join(bin, 'pg_dump.exe'), ['-h', '127.0.0.1', '-p', '55561', '-U', 'wms_test', '-d', source.database, '-Fc', '-f', backup], { stdio: 'pipe' });
sql(`CREATE DATABASE ${database}`);
execFileSync(path.join(bin, 'pg_restore.exe'), ['-h', '127.0.0.1', '-p', '55561', '-U', 'wms_test', '-d', database, '--single-transaction', backup], { stdio: 'pipe' });
const url = source.url.replace(source.database, database);
Object.assign(process.env, { NODE_ENV: 'test', PORT: '4539', DATABASE_URL: url, API_URL: 'http://127.0.0.1:4539', WEB_URL: 'http://localhost:4528', CORS_ORIGINS: 'http://localhost:4528', JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'), STORAGE_ENDPOINT: 'http://127.0.0.1:1', STORAGE_REGION: 'test', STORAGE_BUCKET: 'unused', STORAGE_ACCESS_KEY_ID: 'unused', STORAGE_SECRET_ACCESS_KEY: 'unused' });
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) { const o = typeof a[0] === 'object' ? a[0] : { host: typeof a[1] === 'string' ? a[1] : 'localhost' }; if (o.host && !['127.0.0.1', 'localhost', '::1'].includes(o.host))
    throw Error('Only loopback permitted'); return connect.apply(this, a); };
const local = n => require(require.resolve(n, { paths: [path.resolve('apps/api'), path.resolve('packages/database')] })), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { fileName: f, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true } }).outputText, f);
local('reflect-metadata');
const { PrismaClient } = local('@prisma/client'), db = new PrismaClient({ datasourceUrl: url }), als = new AsyncLocalStorage(), rows = [], summaries = [], plans = new Map();
const prismaModule = require(path.resolve('apps/api/src/common/prisma/prisma.service.ts')), OriginalPrismaService = prismaModule.PrismaService;
let activeMetric = null, unattributedQueries = 0, phase = "setup";
const unattributed = [];
class PrismaService extends OriginalPrismaService {
    constructor() {
        super({ log: [{ emit: 'event', level: 'query' }] });
        this.$on('query', e => {
            const m = activeMetric;
            if (!m) {
                unattributedQueries++;
                unattributed.push({ phase, sql: e.query.replace(/\s+/g, " ").slice(0, 120) });
                return;
            }
            m.sqlCount++;
            m.engineQueryMs += e.duration;
            if (e.duration > 100)
                (m.slowQueries ??= []).push({ durationMs: e.duration, sql: e.query.slice(0, 160) });
            const q = e.query;
            const kind = /WITH (?:policy|selected) AS MATERIALIZED/.test(q) ? 'quantity-check' : /FROM sales_draft_lines/.test(q) ? 'draft-detail' : /FROM sales_draft_commands/.test(q) ? 'draft-command' : /FROM sales_drafts/.test(q) ? 'draft-list' : /FROM wms_products/.test(q) ? 'product-picker' : /FROM warehouses w/.test(q) ? 'warehouse-access' : /FROM visit_executions/.test(q) ? 'visit-ownership' : /rie_canonical_entity_rows/.test(q) ? 'RIE-customer' : /company_operating_settings/.test(q) ? 'mode-admission' : null;
            if (kind && !plans.has(kind) && !/FOR UPDATE|FOR SHARE|set_config|advisory_xact/.test(q))
                plans.set(kind, { sql: q, values: JSON.parse(e.params) });
        });
    }
}
prismaModule.PrismaService = PrismaService;
const obs = require(path.resolve('apps/api/src/common/observability/rie-observability.ts'));
obs.setRieTelemetryTestSink(e => { if (e.event === 'rie_request_summary')
    summaries.push(e); }, 1);
const p95 = a => a.length ? [...a].sort((a, b) => a - b)[Math.ceil(a.length * .95) - 1] : null;
const protectedTables = ['wms_products', 'wms_batches', 'wms_positions', 'wms_movements', 'wms_custody_positions', 'wms_allocations', 'wms_load_requests', 'wms_customer_policies', 'accounting_books', 'accounting_accounts', 'accounting_commands', 'accounting_voucher_commands', 'accounting_lines', 'accounting_journals', 'accounting_parties', 'accounting_vouchers', 'rie_canonical_entity_rows', 'rie_dataset_versions', 'files'];
const snapshot = async () => Object.fromEntries(await Promise.all(protectedTables.map(async (t) => [t, (await db.$queryRawUnsafe(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text) hash FROM ${t} t`))[0].hash])));
(async () => {
    let app;
    const report = { status: 'BLOCK', scope: 'One active request at a time; tiny synthetic fixture, NOT representative or 25/50/100/150-user load evidence', database, checks: [] };
    try {
        for (let n = 1; n <= 20; n++)
            await db.$executeRawUnsafe("INSERT INTO wms_products(id,company_id,code,name,base_unit,pieces_per_carton) VALUES($1,'draft-a',$2,$3,'PIECE',12) ON CONFLICT DO NOTHING", 'perf-p-' + n, 'PERF' + n, 'Synthetic perf product ' + n);
        await db.$executeRawUnsafe(`INSERT INTO wms_batches(id,company_id,product_id,code,expiry_date,is_quarantined)
 SELECT 'perf-lot-'||p.id||'-'||n,'draft-a',p.id,'PERF-'||n,CASE WHEN n=10 THEN '2020-01-01'::date ELSE '2099-01-01'::date END,n=9
 FROM wms_products p CROSS JOIN generate_series(1,10) n WHERE p.company_id='draft-a' AND p.id LIKE 'perf-p-%'`);
        await db.$executeRawUnsafe(`INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical,reserved,quarantined,quality_blocked)
 SELECT 'draft-a','draft-w',b.id,120,12,3,b.code='PERF-8' FROM wms_batches b WHERE b.company_id='draft-a' AND b.id LIKE 'perf-lot-%'`);
        await db.$executeRawUnsafe(`INSERT INTO wms_custody_positions(company_id,warehouse_id,batch_id,recipient_id,quantity)
 SELECT 'draft-a','draft-w',b.id,'draft-rep',24 FROM wms_batches b WHERE b.company_id='draft-a' AND b.id LIKE 'perf-lot-%'`);
        if(foundationB1){
            // Real current-only imported sources, deliberately NOT operational approval.
            await db.rieCanonicalEntityRow.updateMany({where:{companyId:'draft-a',entityName:'Customers',entityKey:'C1'},data:{data:{CustomerCode:'C1',CustomerName:'Synthetic B1',RouteID:'R1',Status:'Active',DefaultPriceListCode:'B1-PL',CreditLimit:100000,PaymentTerms:'30 days'}}});
            const file=await db.file.create({data:{id:'b1-price-file',companyId:'draft-a',uploadedByUserId:'draft-rep',datasetType:'Price List',fileName:'synthetic-prices.xlsx',storageKey:'synthetic/b1-prices',sizeBytes:0,status:'READY',datasetTypeConfirmed:true}});
            await db.rieDatasetVersion.create({data:{id:'b1-price-version',companyId:'draft-a',sourceFileId:file.id,entityName:'Price List',isActive:true,status:'READY',rowCount:5,activatedAt:new Date(),materializedAt:new Date()}});
            const prices=[['Piece','2020-01-01',10],['Piece','2021-01-01',11],['Carton','2020-01-01',95],['Pack','2020-01-01',50],['Piece','2099-01-01',999]];
            for(const [i,[unit,start,amount]] of prices.entries())await db.rieCanonicalEntityRow.create({data:{id:'b1-price-'+i,companyId:'draft-a',sourceFileId:file.id,entityName:'Price List',entityKey:'B1-PL|PERF1|'+unit+'|'+start,data:{PriceListCode:'B1-PL',ProductCode:'PERF1',Unit:unit,StartDate:start,Status:'Active',PriceBeforeVAT:amount,PriceAfterVAT:amount,Currency:'SAR',VATPercent:0}}});
            await db.$executeRawUnsafe("INSERT INTO wms_customer_policies(company_id,customer_code,min_shelf_life_days) VALUES('draft-a','C1',3) ON CONFLICT(company_id,customer_code) DO UPDATE SET min_shelf_life_days=3");
        }
        // pg_restore does not establish representative planner statistics for newly
        // inserted synthetic lots. Explicit fixture preparation avoids a timing race
        // with autovacuum/analyze. This changes only the disposable test database.
        for(const table of ['wms_products','wms_batches','wms_positions','wms_custody_positions','rie_canonical_entity_rows'])await db.$executeRawUnsafe('ANALYZE '+table);
        const before = await snapshot();
        const { NestFactory } = local('@nestjs/core'), { AppModule } = require(path.resolve('apps/api/src/app.module.ts'));
        app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
        const p = app.get(PrismaService), original = p._request.bind(p);
        p._request = function (params) {
            const m = als.getStore(), started = performance.now();
            const record = (outcome) => {
                if (m) {
                    m.prismaOperationCount++;
                    m.sqlClientMs += performance.now() - started;
                    m.sqlErrors += outcome === 'error' ? 1 : 0;
                    const q = params.args?.query;
                    if (typeof q === 'string' && /SELECT|WITH/.test(q) && !/FOR UPDATE|FOR SHARE|set_config|advisory_xact/.test(q)) {
                        const kind = /WITH (?:policy|selected) AS MATERIALIZED/.test(q) ? 'quantity-check' : /FROM sales_draft_lines/.test(q) ? 'draft-detail' : /FROM sales_drafts/.test(q) ? 'draft-list-or-command' : /FROM wms_products/.test(q) ? 'product-picker' : /FROM warehouses w/.test(q) ? 'warehouse-access' : /FROM visit_executions/.test(q) ? 'visit-ownership' : /rie_canonical_entity_rows/.test(q) ? 'RIE-customer' : null;
                        if (kind && !plans.has(kind)) {
                            const v = params.args.parameters?.values;
                            plans.set(kind, { sql: q, values: v ? JSON.parse(v) : [] });
                        }
                    }
                }
            };
            const result = original(params);
            return result.then(x => { record('success'); return x; }, e => { record('error'); throw e; });
        };
        const originalTx = p.$transaction.bind(p);
        p.$transaction = function (work, options) { if (typeof work !== 'function')
            return originalTx(work, options); const m = als.getStore(), start = performance.now(); return originalTx(async (tx) => { const at = performance.now(); if (m)
            m.txAcquireMs += at - start; try {
            return await work(tx);
        }
        finally {
            if (m)
                m.txCallbackMs += performance.now() - at;
        } }, options).finally(() => { if (m)
            m.txTotalMs += performance.now() - start; }); };
        const { RieExecutionCoordinatorService } = require(path.resolve('apps/api/src/modules/rie/rie-execution-coordinator.service.ts')), coord = app.get(RieExecutionCoordinatorService), execute = coord.execute.bind(coord);
        coord.execute = function (operation, callback, options) { const m = als.getStore(), start = performance.now(); return execute(operation, () => { if (m) {
            m.rieAdmissions++;
            m.rieAdmissionElapsedMs += performance.now() - start;
        } return callback(); }, options); };
        app.use(local('cookie-parser')());
        app.setGlobalPrefix('api/v1');
        const { HttpExceptionFilter } = require(path.resolve('apps/api/src/common/filters/http-exception.filter.ts'));
        app.useGlobalFilters(new HttpExceptionFilter());
        app.use((req, res, next) => { const id = randomUUID(), start = performance.now(), m = { id, label: req.headers['x-perf-case'] ?? 'setup', method: req.method, sqlCount: 0, engineQueryMs: 0, prismaOperationCount: 0, sqlClientMs: 0, sqlErrors: 0, txAcquireMs: 0, txCallbackMs: 0, txTotalMs: 0, rieAdmissions: 0, rieAdmissionElapsedMs: 0 }; phase = "request:" + m.label; activeMetric = m; res.setHeader('x-perf-id', id); res.once('finish', () => { obs.completeRieRequest(res.statusCode); m.apiMs = performance.now() - start; m.status = res.statusCode; rows.push(m); activeMetric = null; phase = "between-requests"; }); als.run(m, () => obs.runWithRieRequestContext({ traceId: id, feature: 'sales_draft_measurement', action: m.label, routeTemplate: '/sfa/visits/:visit/sales-drafts' }, () => coord.runRequest(id, next))); });
        await app.listen(4539, '127.0.0.1');
        const registry = app.get(local('@nestjs/schedule').SchedulerRegistry);
        for (const n of registry.getIntervals())
            registry.deleteInterval(n);
        for (const j of registry.getCronJobs().values())
            j.stop();
        const base = 'http://127.0.0.1:4539/api/v1';
        const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: source.email, password: source.password }) });
        assert.equal(login.status, 201);
        const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
        async function req(label, method, path, body, status = 200) { const start = performance.now(), x = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json', 'x-perf-case': label }, body: body ? JSON.stringify(body) : undefined }); const data = await x.json(), id = x.headers.get('x-perf-id'); assert.equal(x.status, status, JSON.stringify(data)); const m = rows.find(r => r.id === id); assert.ok(m); m.clientMs = performance.now() - start; m.responseBytes=Buffer.byteLength(JSON.stringify(data)); m.processRssBytes=process.memoryUsage().rss; return data; }
        // Seed only the draft visit identity; no shared/reference or balance mutations.
        const start = await req('setup', 'POST', '/sfa/visits', { customerCode: 'C1', entrySource: 'VISIT_COPILOT', requestKey: randomUUID() }, 201);
        const route = '/sfa/visits/' + start.id + '/sales-drafts';
        let d = await req('create-once', 'POST', route, { commandKey: randomUUID() }, 201);
        const line = n => ({ productId: 'perf-p-' + n, quantity: '1', unit: 'BASE' });
        if(foundationB1){
            d=await req('setup','PATCH',route+'/'+d.id,{commandKey:randomUUID(),version:d.version,warehouseId:'draft-w',notes:'B1 multi-price',lines:[{productId:'perf-p-1',quantity:'30',unit:'CARTON'}]});
            const checked=await req('b1-commercial','GET',route+'/'+d.id+'/check');
            assert.equal(checked.pricing,'REQUIRES_SETUP');assert.equal(checked.priceSource,null);assert.equal(checked.credit,null);assert.equal(checked.approvalAllowed,false);
            assert.equal(checked.draftVersion,d.version);assert.equal(checked.commercial.pricing.state,'NEEDS_REVIEW');assert.ok(checked.commercial.pricing.blockers.includes('PRICE_PRECEDENCE'));assert.ok(checked.commercial.credit.blockers.includes('CREDIT_CUSTOMER_LINK'));
            assert.equal(checked.lines[0].requestedBase,'360.000000');assert.equal(checked.lines[0].custodyState,'UNAVAILABLE');assert.equal(checked.lines[0].warehouseState,'AVAILABLE');assert.equal(checked.lines[0].minShelfLifeDays,3);
            assert.ok((await db.$queryRawUnsafe("SELECT count(*)::int n FROM accounting_lines WHERE company_id='draft-a'"))[0].n>0);
            assert.equal(await db.rieCanonicalEntityRow.count({where:{companyId:'draft-a',entityName:'Price List'}}),5);
            report.commercialEvidence={importedPriceRows:5,overlappingPiecePrices:2,units:['Piece','Carton','Pack'],futurePrice:true,importedCreditLimit:100000,existingGL:true,result:checked};
            report.checks.push('Actual auth/RIE/HTTP: multiple overlapping/different-unit/future imported prices and high imported credit limit with existing GL never become approved prices/credit; insufficient own custody stays separate');
        }
        for (const count of [1, 20])
            for (let i = 0; i < 28; i++)
                d = await req((i < 3 ? 'warmup' : 'save-' + count), 'PATCH', route + '/' + d.id, { commandKey: randomUUID(), version: d.version, warehouseId: 'draft-w', notes: 'Bounded query shape', lines: Array.from({ length: count }, (_, n) => line(n + 1)) });
        for (const [label, p] of [['read', route + '/' + d.id], ['check-20', route + '/' + d.id + '/check'], ['list', route], ['products', route + '/warehouses/draft-w/products']])
            for (let i = 0; i < 28; i++)
                await req(i < 3 ? 'warmup' : label, 'GET', p);
        for (let i = 0; i < 5; i++)
            await req('expected-stale', 'PATCH', route + '/' + d.id, { commandKey: randomUUID(), version: 0, warehouseId: 'draft-w', notes: 'stale', lines: [line(1)] }, 409);
        const measured = rows.filter(r => !['setup', 'warmup'].includes(r.label));
        for (const m of measured) {
            const s = summaries.find(s => s.traceId === m.id);
            assert.ok(s, "RIE summary must be captured");
            assert.ok(m.sqlCount > 0, "Actual engine query events must be captured");
            m.rieGlobalQueueMs = s.queueWaitTotalMs;
            m.rieSqlCount = s?.sqlOperationCount ?? null;
            m.rieLogicalCount = s?.rieLogicalOperationCount ?? null;
            m.rieGlobalQueueMaxMs = s?.queueWaitMaxMs ?? null;
            m.rieActivePermits = s?.maxActivePermitCount ?? null;
        }
        report.metrics = Object.fromEntries([...new Set(measured.map(m => m.label))].map(label => { const a = measured.filter(m => m.label === label); return [label, { n: a.length, apiP95Ms: p95(a.map(x => x.apiMs)), httpRoundTripP95Ms: p95(a.map(x => x.clientMs)), sqlClientP95Ms: p95(a.map(x => x.sqlClientMs)), engineQueryP95Ms: p95(a.map(x => x.engineQueryMs)), prismaOperationCountMax: Math.max(...a.map(x => x.prismaOperationCount)), sqlCountMin: Math.min(...a.map(x => x.sqlCount)), sqlCountMax: Math.max(...a.map(x => x.sqlCount)), rieGlobalQueueP95Ms: p95(a.map(x => x.rieGlobalQueueMs)), rieAdmissionP95Ms: p95(a.map(x => x.rieAdmissionElapsedMs)), rieAdmissionsMax: Math.max(...a.map(x => x.rieAdmissions)), txP95Ms: p95(a.map(x => x.txTotalMs)), txAcquireP95Ms: p95(a.map(x => x.txAcquireMs)), txCallbackP95Ms: p95(a.map(x => x.txCallbackMs)), errors4xx: a.filter(x => x.status >= 400 && x.status < 500).length, errors5xx: a.filter(x => x.status >= 500).length, sqlErrors: a.reduce((s, x) => s + x.sqlErrors, 0) }]; }));
        for(const [label,metric] of Object.entries(report.metrics)){const a=measured.filter(m=>m.label===label);metric.responseBytesMax=Math.max(...a.map(x=>x.responseBytes));metric.processRssBytesMax=Math.max(...a.map(x=>x.processRssBytes));}
        assert.equal(report.metrics['save-1'].sqlCountMax, report.metrics['save-20'].sqlCountMax);
        report.checks.push('1 versus 20 saved lines have identical bounded SQL count, including auth/admission/BEGIN/COMMIT and transaction calls; internal PL/pgSQL statements excluded');
        assert.ok(plans.has('quantity-check') && plans.has('draft-detail') && plans.has('RIE-customer'), 'Critical SQL plans must be captured');
        report.plans = [];
        for (const [kind, q] of plans) {
            try {
                const result = await db.$queryRawUnsafe('EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ' + q.sql, ...q.values);
                report.plans.push({ kind, plan: result });
            }
            catch (e) {
                report.plans.push({ kind, error: e.message });
                throw e;
            }
        }
        const quantityPlan = report.plans.find(p => p.kind === 'quantity-check').plan[0]['QUERY PLAN'][0];
        const nodes = [];
        const walk = n => { nodes.push(n); for (const child of n.Plans ?? [])
            walk(child); };
        walk(quantityPlan.Plan);
        for (const name of ['CTE stock', 'CTE custody'])
            assert.equal(nodes.find(n => n['Subplan Name'] === name)?.['Actual Loops'], 1, name + ' must aggregate once');
        for (const node of nodes.filter(n => n['Node Type'] === 'Seq Scan' && ['wms_batches', 'wms_positions', 'wms_custody_positions'].includes(n['Relation Name'])))
            assert.ok(node['Actual Loops'] <= 1, 'No repeated full fact scans in this fixture');
        report.checks.push('Native EXPLAIN: both bounded aggregates execute once; no repeated WMS fact sequential scans');
        const after=await snapshot();report.protectedDigests={before,after};assert.deepEqual(after, before);
        report.checks.push('Protected WMS/custody/GL/AR/RIE/reference digests unchanged after measurement');
        report.unattributedQueries = unattributedQueries;
        report.unattributed = unattributed;
        report.fixture = { customers: 2, productsInMeasuredCompany: Number((await db.$queryRawUnsafe("SELECT count(*)::int n FROM wms_products WHERE company_id='draft-a'"))[0].n), measuredProductLots: 200, maxDraftLines: 20, activeConcurrentRequests: 1, samplesPerWarmEndpoint: 25, warmupExcluded: 3, representative: false };
        report.samples = measured;
        report.status = 'PASS';
    }
    catch (e) {
        report.error = e.message;
        throw e;
    }
    finally {
        phase = "shutdown";
        if (app)
            await app.close();
        await db.$disconnect();
        assert.match(database, /^sales_drafts_perf_[a-f0-9]{32}$/);
        sql(`DROP DATABASE ${database}`);
        report.disposableDatabaseRemoved = true;
        fs.writeFileSync(path.join(out, evidenceName+'.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ status: report.status, metrics: report.metrics, checks: report.checks, error: report.error }));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
