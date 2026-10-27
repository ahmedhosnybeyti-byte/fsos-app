# مرشدك — تقرير Capacity Planning الأول

تاريخ التسليم: 23 أكتوبر 2026، بتوقيت الرياض. بدأ الفحص في 22 أكتوبر. نطاقه قراءة الكود والأدلة المحلية، ثم إنشاء هذا التقرير وملف الأدلة المجاور فقط.

**النتيجة:** لا توجد أدلة كافية لاعتماد عدد أقصى حالي للمستخدمين، أو التوصية بشراء RAM/CPU محددين. الاختناق التاريخي الظاهر هو انتظار RIE تحت حمل تحليلي مختلط، مع وجود أسباب برمجية مثبتة ومخاطر تنافس تشغيلية تحتاج قياسًا مستقلًا. زيادة التزامن 20→30 لم تحل الاختناق تاريخيًا. نجاح اختبارات الوظائف أو الطلبات التسلسلية لا يثبت سعة 25 أو 150 مستخدمًا.

لم يُشغّل أي حمل جديد أو اتصال بقاعدة بيانات، ولم يُستخدم Docker أو Production أو Railway أو Push/Deploy. لم تُعدّل ملفات تطوير الفواتير أو الزيارات أو المسودات أو المخطط أو إعدادات RIE. لا تغيير معماري أو بنية أو اعتماد جديد مقترح للتنفيذ دون مراجعة وموافقة.

**1. نطاق الأدلة وقابليتها للمراجعة**

- المجلد الرسمي: `D:\Field Sales OS`؛ الفرع وقت الفحص `codex/procurement-phase01`؛ HEAD: `f482d9bde14b94e3619e221d61a416b145874ca6`.
- توجد تغييرات متزامنة غير ملتزمة، منها Visit Execution وSales Drafts ومخطط Prisma وبوابة Scalability. HEAD وحده لا يصف الحالة المفحوصة. يسجل [evidence.json](evidence.json) بصمات الملفات المقروءة ووقت التقاطها؛ التقرير مراجعة لحالة عمل متحركة، وليس شهادة commit قابل للنشر.
- قرئت تعليمات [AGENTS.md](../../../AGENTS.md)، و[مهارة التصميم](../../../.agents/skills/murshidak-system-design/SKILL.md)، و[الحواجز الدائمة](../PERFORMANCE_GUARDRAILS.md)، و[الذاكرة الهندسية](../RESOLVED_ISSUES.md)، و[عقد الاعتمادية](../ENGINEERING_RELIABILITY.md)، وبوابتا المسودات [002-A](../SALES_DRAFTS_SCALABILITY_GATE_002A.md) و[002-B1](../SALES_DRAFTS_SCALABILITY_GATE_002B1.md).
- ظهرت أثناء الفحص إضافة تعليمات `quality:scalability` وأداتها، ثم أصبحت [SCALABILITY_GATE.md](../SCALABILITY_GATE.md) متاحة وقرئت كاملة قبل التسليم. سياسة `scalability-budgets.json` المقروءة كانت `approvals: []`. جرى تقييم الأدلة فقط بمدخل الأداة عبر Node، والنتيجة [WARN / UNVERIFIED](scalability-assessment/latest.json) لغياب current synthetic evidence وbaseline موثوق. ما زال تغيير البوابة غير ملتزم أثناء الفحص؛ لا ميزانية سعة معتمدة ولا ادعاء اكتمال اختبار أدواتها من هذه المهمة.
- «مثبت بالكود» يثبت وجود نمط التنفيذ، لا شدته تحت الحمل. «مقاس» يخص البيانات والنسخة والبيئة المذكورة فقط. «فرضية» تحتاج تجربة فاصلة. الأدلة التاريخية ليست baseline مطابقًا للحالة الحالية.
- لم تُنسخ سجلات عملاء أو SQL parameters أو بيانات اعتماد إلى المخرجات. ملف الأدلة يحتفظ بإحصاءات مختصرة وبصمات ومسارات محلية، وليس صفوف الإنتاج.

**2. ما الذي تثبته اختبارات الأداء السابقة؟**

| الدليل المحلي | الحمل والمدة المقررة | النتيجة المسجلة | حدود الاستنتاج |
| --- | --- | --- | --- |
| `production-readonly-load-results-sales-rep-3c35591.json` | 100 VU؛ 60 ثانية | 1717/1717 نجاح؛ صفر timeout؛ p95=5694 ms | مسار قراءة للمندوبين؛ ليس حفظ مبيعات، ولا SLA سريعًا، ولا اختبار استقرار طويل |
| `final-role-aware-results-20260911.json` | 100 VU مختلط؛ 60 ثانية | 32/232 نجاح؛ 200 timeout؛ نجاح 13.79%؛ p95=30135 ms | نسخة وسيناريو تاريخيان؛ لا يمثل الحالة الحالية |
| `rie30-production-load-test-20260911.json` | 100 VU؛ RIE=30؛ 60 ثانية | 40/239 نجاح؛ 199 timeout | لا يثبت نفع رفع التزامن؛ يوافق تحذير الذاكرة الهندسية |
| `progressive-mixed-25-20260915.json` | 25 VU؛ 60 ثانية | 655/659 نجاح؛ 4 أخطاء؛ صفر timeout؛ p95=9161 ms | صفر timeout لا يعني صفر أخطاء؛ نوع الأخطاء الأربعة غير محسوم من التصنيف المختصر |
| `production-readonly-load-results.json` في الجذر | 50 VU؛ 60 ثانية | 519/528 نجاح؛ 9 timeout؛ p95=19578 ms | الإدارة: Smart Loading كان 8 timeout من 21 طلبًا حسب الذاكرة؛ الإصلاح اللاحق لا يثبت سعة عامة |
| `post-snapshot-mixed-25-20260919.json` | 25 VU؛ 60 ثانية | 133/165 نجاح؛ 32 timeout؛ p95=30011 ms | حتى 25 VU ليست سعة مضمونة عبر النسخ/السيناريوهات المختلفة |
| `RESOLVED_ISSUES.md`، Dashboard عند 150 VU | ملخص هندسي تاريخي | مجموع انتظار RIE=349497 ms، و57 client timeout | مجموع انتظار عبر طلبات، وليس p95 أو انتظار كل مستخدم. ملف التشغيل الخام المطابق لـ150 لم يُحدد ضمن الأدلة التي عُثر عليها |

المسارات الكاملة وبصمات ملفات النتائج موجودة في `evidence.json`. سجل 150 يوثق أيضًا حساب daily DISTINCT غير المستخدم، وإزالته. **هذه مشكلة سابقة أُصلحت؛ لا أعيد فتحها بلا قياس انحدار جديد.** أما سعة الحمل المختلط الحالية فما زالت غير مثبتة.

مولد الحمل القديم المقروء، `production-readonly-load-test.mjs`، ينشئ جلسة لكل دور ثم يعيد استخدامها بين العمال، ويوزع الأدوار تقريبًا بالتساوي، ويدور `while` بلا think time. يسجل latency للفشل والنجاح معًا، ويصنف HTTP 500 تحديدًا بدل فصل جميع 5xx. بعض النتائج تخص نسخًا أقدم لا نملك تطابق مولدها الكامل. تمتد مهلة تصريف الطلبات بعد نافذة 60 ثانية؛ مثلًا تشغيل 100 المختلط استغرق فعليًا 89267 ms. لذلك لا نقسم عدد الطلبات ببساطة على 60 لنعلن throughput مستقرًا، ولا نساوي VU بعدد هويات مستقلة أو مستخدمين بشريين نشطين.

ملفات CPU/RAM التاريخية المتاحة تخص نوافذ سبتمبر أخرى؛ لا يوجد ربط كافٍ لتفسير اختبار 150 بها. لا توجد في هذا الفحص wait events أو plans أو pool acquisition متزامنة مع تشغيل 150. **الاستنتاج المدعوم: تراكم انتظار RIE ظاهر؛ السبب الجذري الكمي بين زمن SQL والـpool والحصص والـI/O غير محسوم.** خمول CPU المتوسط لا يستبعد تشبع نواة واحدة أو قفلًا أو pool، وارتفاع RAM لا يثبت وحده نقص الذاكرة.

**3. نقاط القوة القائمة**

1. PostgreSQL هو مصدر الحقيقة، وCanonical current-state منشور عند ingestion؛ لا يلزم إعادة دمج newest-wins من سجل النسخ في كل قراءة. الإصلاح موثق مع parity للحالات الحدية.
2. `RieExecutionCoordinatorService` يحدد 20 تنفيذ PostgreSQL لكل process، وتنفيذًا واحدًا لكل request، وميزانية افتراضية 24 تنفيذًا، وانتظار طابور 30000 ms. يحافظ على reuse للـhierarchy والنسخ داخل الطلب، ويحرر permit بعد استرجاع Prisma.
3. Daily Brief يبدأ بعملاء اليوم ثم يطلب مجاميع SQL محددة؛ Team Performance يستخدم plan محدودًا ونتائج على مستوى المندوب؛ Heatmap يحسب في PostgreSQL ويرفض نطاق عملاء يتجاوز 5000 بدل تراكم صفحات facts.
4. Smart Loading الإداري لديه نتيجة محفوظة بمفتاح الشركة والتاريخ والنطاق وإصدار المصدر، مع تحقق الصلاحيات قبل القراءة وإبطال في معاملة التغيير. Heatmap يشارك الحساب الجاري فقط بمفتاح يتضمن هوية ونطاق الطالب.
5. SGI يحفظ snapshot للشركة ثم يضيق العرض حسب hierarchy؛ لديه single-flight محلي للفحص التلقائي وحد للمجاميع 25000 صف، ويرفض تجاوز الصفحة بدل قراءة صفحات لا تنتهي.
6. العمليات تستخدم جداول typed، وdecimals، وقيود company/business identity، وidempotency، وversion checks، وسجل audit داخل المعاملة. المحاسبة تستمد الرصيد من GL؛ العهدة لا تنشأ قبل قبول المستلم؛ المسودة لا ترحل مخزونًا أو دينًا.
7. توجد أدلة native PostgreSQL على اتصالات مستقلة للازدواج والسباقات والـrollback في الزيارات والمخازن والمحاسبة والمسودات. هي أدلة صحة لهذه الحالات، وليست throughput.
8. observability الحالي يوفر trace IDs وSQL counts وqueue waits وrows returned وmetadata reuse، مع اختبارات admission/parity وبوابات تمنع اعتبار skip نجاحًا. هذا أساس جيد لمختبر مستقل دون بنية جديدة.

**4. مراجعة المسارين والتنافس بينهما**

| المسار | ما وجد في الكود/الأدلة | ما يجب قياسه لاحقًا |
| --- | --- | --- |
| RIE | semaphore محلي للعملية وserial gate لكل request؛ `getEntityRecords` القديم ما زال متاحًا | service time لكل lease، عمق وعمر الطابور، انتظار محلي/عام، cancellation، العد الفعلي لكل عملية |
| Visit Copilot | Daily Brief وbriefing المعتاد لهما SQL محدد؛ `buildDiscoveryStats` المستخدم في البحث عن prospects وroute-opportunities يقرأ Customers/Invoices/Items ثم يجمع في Node؛ prospect briefing يقرأها أيضًا؛ chat يقرأ Customers لحل الاسم | فصل endpoints؛ rows/bytes/RSS لكل مسار؛ parity لنقل هذه الحسابات إلى SQL؛ لا تعميم تحسن Daily Brief على جميع Copilot |
| Sales Growth / SGI | aggregates لـcustomer×route×product في فترتين؛ نتائج حتى 25000 ثم scoring في Node؛ freshness يمكن أن يحسب عند أول قراءة بعد تغير المصدر | cold/warm، ارتفاع cardinality، حسابات manual متزامنة، مدة الحفظ وحجم JSON وتنافسها مع الحفظ التشغيلي |
| Smart Loading | session وrecalculate تستخدم نتائج محدودة؛ management snapshot موجود؛ `searchCustomers` يقرأ Customers كاملًا ثم يرشح ويرتب في Node | البحث عند الكتابة، نتيجة cache hit/miss، تغير المصدر والنطاق، منع إعادة الحساب المتزامن عبر أكثر من process |
| Team Performance | تجميع PostgreSQL وplan=24؛ sales summary DISTINCT منفصل عن per-rep aggregates؛ حد 5000 صف | scans/buffers لكل aggregate، company-wide مقابل route/date ضيق، المقارنة الحالية/السابقة وحالات تجاوز الحد |
| Heatmap | SQL للمبيعات/المرتجعات/التحصيل وللفترتين؛ customer limit=5000؛ لا استدلال Full Read من تعليقات قديمة | نطاقات City/Region مقابل company، حجم payload والـbrowser render، عمل SQL قبل اكتشاف التجاوز |
| التقارير | Decision Analytics ينفذ مجاميع متعددة لنفس الفترة؛ FSOS 360 يجمع facts في SQL لكنه يقرأ masters مثل Products/Targets/Route Assignments عبر القارئ القديم | fact scan reuse، قياسات masters حسب نموها، export result bytes؛ لا ندعي أن كل masters عالية cardinality فعليًا |
| الزيارات | قفل start على company/rep، قفل الصف ونسخة متوقعة عند save/finish؛ context يعيد استخدام briefing ضمن plan؛ الصور مسار تخزين منفصل | هويات مستقلة، تأخر context مقابل save، تعارض نفس الزيارة، pool/lock wait، upload بطيء/فاشل بشكل منفصل |
| المسودات/الفواتير | 002-A/B1 حد 20 سطرًا، idempotency وقفل الزيارة وaudit؛ check معاملة READ ONLY؛ لا ترحيل فاتورة ضريبية/مبيعات في هذا العقد | لا نسمّي نجاح draft save نجاح invoice posting. اختبار ترحيل الفواتير الحقيقي يبقى BLOCK حتى تثبيت عقده وأدلته بالتنسيق مع التطوير الجاري |
| التحصيل/الحسابات | Collections canonical تحليلي؛ receipt voucher محاسبي authoritative مختلف؛ posting يقفل book الشركة ثم يرحل GL/audit ذريًا | كتاب واحد ساخن مقابل شركات متعددة، أطراف مختلفة، replay/overpayment/reversal؛ لا خلط مع subscription Payment |
| العهدة/المخزون | SQL للحجز والصرف والقبول والمرتجعات؛ أقفال products ثم positions/allocations بترتيب ثابت | مستودعات مختلفة على الصنف نفسه، صنف ساخن مقابل توزيع واسع، انتظار القفل وWAL وcommit، عدم تكرار حركة المخزون |

التحليلات والعمليات تعتمد على PostgreSQL وPrismaService المشتركين في API. RIE admission لا يحجز تلقائيًا مساحة لكتابات WMS/GL المباشرة. حتى حفظ المسودة يحتاج قراءات تفويض/نطاق RIE قبل المعاملة، ثم يحفز تحديثات UI. يمكن أن يتأخر الحفظ في pool أو تفويضه رغم قصر UPDATE نفسه. هذه **فرضية منافسة مدعومة بالبنية، وليست قياسًا للحمل المختلط الحالي**.

المقارنة الفاصلة: نفس المستخدمين التشغيليين والبيانات وتسلسل الطلبات أولًا دون مدير ثقيل، ثم مع تحليلات المدير، ثم بعد إيقاف التحليلات. نفصل response/queue/pool/lock/SQL/commit/RSS؛ ونفحص اكتمال البيع مرة واحدة حتى لو انقطع اتصال العميل. لا نجمع أو نطرح p95 لسلاسل مختلفة لتخمين مدة الانتظار.

**5. أخطر عشرة اختناقات: الأدلة منفصلة عن الفرضيات**

الترتيب للأولوية في التحقيق، وليس ترتيب خسارة throughput مقاسة.

| # | الاختناق وحالة الإثبات | الدليل المحدد | الفرضية/التجربة الفاصلة | الإجراء المقترح للمراجعة |
| --- | --- | --- | --- | --- |
| 1 | Full Reads في Copilot؛ مثبت بالكود، أثر الحمل غير مقاس | `buildDiscoveryStats`، callers عند 2166/2288؛ `buildProspectBriefing`؛ chat عند 1301؛ provider يعيد `r.data` وحده الافتراضي 2147483647 | اتساع فترة/شركة وحجم Items قد يستهلك نقلًا وRAM ووقت Node؛ قارن نفس النتيجة بـSQL scoped | عقد aggregates/candidates للـprospects وحل أسماء العملاء، مع parity؛ لا تعديل في هذه المهمة |
| 2 | بحث Smart Loading غير محدود؛ مثبت بالكود | `searchCustomers` عند 813 يقرأ كل Customers ويعمل map/filter/sort | تكرار البحث من مستخدمين كثيرين قد يضخم الحمل؛ قياس عدد الطلبات وحجم النطاق | بحث PostgreSQL بprojection وlimit وترتيب مطابق، ثم مراجعة الفهرس بعد EXPLAIN |
| 3 | طابور RIE بلا حد cardinality موضح ولا deadline شامل؛ البنية مثبتة، تراكم تاريخي مثبت | `FifoSemaphore.waiters` مصفوفة؛ 20/24/30000؛ telemetry تاريخي 150؛ main يسجل abort ولا يمرر منه signal تلقائيًا لكل SQL | قد يستمر العمل بعد timeout العميل؛ افصل local/global/pool ثم اختبر disconnect وتصريف الطابور | قياس ثم اقتراح admission/timeout/cancellation محدود يحافظ على العقود؛ لا رفع التزامن |
| 4 | pool/DB مشترك للتحليل والتشغيل؛ تنافس محتمل | PrismaService نفسه محقون في RIE وWMS/GL/visits؛ لا partition مثبت في wrapper | قد يستنزف analytical SQL الاتصالات قبل وصول الكتابة؛ نحتاج connection inventory وpool wait وPG wait events | تقليل مدة/عدد SQL أولًا؛ حجز حصص أو pools منفصلة فقط بعد دليل وموافقة |
| 5 | حساسية خطة lots للإحصاءات؛ فشل مقاس محفوظ | B1 stale-statistics artifact=`BLOCK`؛ estimated 1 مقابل 201؛ repeated scans. fixture ANALYZE جعل الخطة تمر | fresh-plan لا يثبت robust plan بعد bulk ingestion أو skew؛ أعد التجربة fresh/stale على clone | مراجعة predicates/indexes/statistics المستهدفة؛ لا تغيير إعدادات planner عامة أو WMS أثناء تطوير الفواتير |
| 6 | تضخم SQL للعملية من refresh/auth؛ مقاس صغير | save=31 SQL، detail=14، list=14؛ save مع تحديثين=59؛ لا N+1 حسب عدد السطور في هذه العينة | round trips والتفويض المتكرر قد يضغطان RIE/pool؛ القياس لكل UI action لا لكل endpoint فقط | اقتراح isolated read-contract/reuse بعد التنسيق؛ لا إسقاط checks أو تعديل شاشة الفواتير الآن |
| 7 | أقفال book/product أوسع من document؛ مثبتة، شدة contention غير مقاسة | `accounting_post_command` و`accounting_post_voucher` يقفلان book الشركة؛ WMS يقفل product داخل الشركة قبل positions | أطراف مختلفة في شركة واحدة أو مستودعات مختلفة على الصنف نفسه قد تتسلسل؛ شغّل hot-key مقابل disjoint keys | قصر المعاملة وترتيب الأقفال أولًا؛ تضييق قفل book/product قرار معماري يحتاج إثبات consistency وموافقة |
| 8 | نمو SGI وأعمال freshness؛ مثبتة الحدود، التشبع فرضية | aggregate limit=25000؛ فترتا Invoice Items؛ `getLatest→ensureFresh`؛ guard محلي، manual recalculate مسار مستقل | cold first read أو manual/cron قد يتداخل؛ company×customer×product قد يصطدم بالحد أو يكبر scoring | قياس freshness/fan-out وحجم النتائج؛ reuse/توقيت snapshot دون تغيير ranking أو scope |
| 9 | تعدد scans وتجميع DISTINCT في التحليلات؛ الكود مثبت، كلفته الحالية تحتاج plans | Dashboard مجاميع يومية ثم period DISTINCT؛ Team summary منفصل؛ Decision Analytics عدة summaries/groups؛ FSOS masters قد تكبر | small response لا يعني small scan؛ EXPLAIN BUFFERS للفترة والشركة والمقارنة | مشاركة scoped facts حيث يثبت التكرار، projections/indexes مستهدفة، parity قبل أي تغيير؛ لا إعادة فتح DISTINCT اليومي المُزال |
| 10 | التوسع بعدة API processes يضاعف الضغط؛ خاصية مثبتة، أثرها فرضية | semaphore وSGI/Heatmap/cache single-flight محلية للعملية | زيادة replicas قد تعطي نظريًا 20×عدد العمليات leases وpools متعددة وحساب cold مكرر؛ هذا ليس throughput | جرد الاتصالات والمهام والعمليات؛ تجربة عدة instances بعد موافقة فقط؛ لا إضافة replicas افتراضيًا |

كل روابط المصدر وبصماته في ملف الأدلة. أرقام الأسطر تسهّل المراجعة وقد تتحرك مع التطوير المتزامن؛ اسم الدالة والبصمة مرجع التطابق.

مراجع مباشرة للتحقق من النتائج: [Copilot](../../../apps/api/src/modules/visit-copilot/visit-copilot.service.ts)، [قائمة عملاء Smart Loading](../../../apps/api/src/modules/smart-loading/smart-loading.service.ts)، [القارئ القديم وحده الافتراضي](../../../apps/api/src/modules/rie/excel-entity-provider.service.ts)، [منسق RIE](../../../apps/api/src/modules/rie/rie-execution-coordinator.service.ts)، [نطاق Prisma المشترك](../../../apps/api/src/common/prisma/prisma.service.ts)، [SGI](../../../apps/api/src/modules/sgi/sgi.service.ts)، [Team Performance](../../../apps/api/src/modules/team-performance/team-performance.service.ts)، [Heatmap](../../../apps/api/src/modules/heatmap/heatmap.service.ts)، [المسودات للقراءة فقط](../../../apps/api/src/modules/sales-drafts/sales-drafts.service.ts)، [أقفال دفتر المحاسبة](../../../packages/database/prisma/migrations/20261021160000_accounting_core/migration.sql)، [أقفال قسائم التحصيل](../../../packages/database/prisma/migrations/20261021180000_accounting_subledgers/migration.sql)، [أقفال WMS](../../../packages/database/prisma/migrations/20261020150000_wms_phase02/migration.sql).

**6. التحسينات مرتبة بالأثر المتوقع والتعقيد**

الأثر هنا اتجاه هندسي متوقع، ولا نسبة تحسن أو عدد مستخدمين مضمون.

| الأولوية | نطاق مقترح مستقل | الأثر الذي نبحث عنه | التعقيد | دليل القبول المطلوب |
| --- | --- | --- | --- | --- |
| P0 | إكمال provenance/قياسات waits وحدود الاختبار، دون تغيير runtime | فصل SQL عن RIE/pool/lock وتحديد القرار الصحيح | منخفض–متوسط | traces مترابطة وbaseline synthetic موثوق وميزانيات معتمدة |
| P1 | Copilot legacy prospect/mention SQL contract | تقليل raw fact transfer وNode memory/joins | متوسط | fixtures duplicate/blank/newest-wins/company/hierarchy؛ scanned→returned وbytes وRSS/native plans |
| P1 | Smart Loading customer search SQL | تقليل full Customers reads وتكلفة البحث المتكرر | منخفض–متوسط | parity للاسم/الكود والاستثناءات والترتيب والحد؛ قياس نطاق واسع |
| P1 | SQL plans/index/statistics على الاختناق المقاس فقط | إنهاء repeated scans أو spill مكلف | متوسط | fresh/stale/skew، prepared/custom plans، تكلفة ingestion والكتابة والفهرس، نفس النتائج |
| P2 | إعادة استخدام scoped facts في endpoint تحليلي واحد | تقليل scans/durations ومدة حجز permit | متوسط | نفس KPI/null/distinct semantics، query count/plan/buffers وتحسن مقاس بلا تراجع كتابة |
| P2 | ضبط تكرار freshness/read models الموجودة | تقليل cold recompute في D-1 | متوسط | invalidation/scope/revision parity؛ warm/cold/ingestion وfailure case |
| P2 | مراجعة read refresh للحفظ، بعد فصلها عن تطوير الفواتير | تقليل 59 SQL/action إن ثبتت كلفتها | متوسط | التفويض الفوري ونسخة المسودة وreconnect/conflict محفوظة؛ لا cache تفويض متقادم |
| P3 | deadline/admission أو تقسيم موارد داخل الموجود | احتواء التراكم وحماية الحفظ التشغيلي | متوسط–مرتفع | saturation/recovery/cancel، عدم starvation أو تعارض عقود الأخطاء؛ موافقة تصميم قبل التنفيذ |
| P3 | تضييق أقفال authoritative أو فصل pools/replicas | معالجة انتظار مثبت لم يزله SQL | مرتفع | native concurrent posting/rollback/reversal ومراجعة تصميم صريحة |

يمكن إجراء كل التحقيقات وتحسينات SQL/projection/scoped search/reuse/query-count والتعامل مع D-1 دون شراء عتاد. وجود indexes أو limit وحده ليس دليل كفاءة: نحتاج مسحًا فعليًا وخطة وحجم نتيجة. لا Redis أو microservices أو replica أو queue جديدة ضمن التقرير.

نطاق أول تعديل مقترح بعد الموافقة: **Smart Loading search فقط** في service وعقد RIE مناسب واختبارات parity وخططه؛ يخرج صراحةً invoice/visit/draft/schema/UI/WMS posting. البديل التالي Copilot prospects/mention، لكنه ملف متداخل مع العمل الحالي ويحتاج تثبيت revision وملكية التعديل أولًا. أي migration/index جديد أو تغيير admission/أقفال يعرض مستقلًا للمراجعة قبل التنفيذ.

**7. خطة المختبر المعزول — مقترحة ولم تُنفذ**

قبل أي اتصال/تهيئة: موافقة على البيئة والبيانات والمراحل والميزانيات؛ جرد read-only لهوية native PostgreSQL المحلي/الإصدار/data_directory/port واسم قاعدة synthetic مستقلة. وجود `.quality/wms/pgdata` وport 55561 في الأدلة القديمة ليس تصريحًا باستعماله؛ قد يستخدمه تطوير الفواتير. لا نبدأ أو نوقف خدمة قائمة، ولا نقرأ `.env` تشغيليًا، ولا نستعيد backup إنتاجي. أي cluster/runtime جديد أو تشغيل خدمة يحتاج نطاقًا معتمدًا؛ PGlite لا يصلح لاختبار السعة والأقفال native.

ثبّت commit بالإضافة إلى source digest يتضمن WIP المختار، Node/Prisma/PostgreSQL/OS، مواصفات وحدود API/DB/load generator، عدد processes/pools/connection limits، إعدادات planner/timeouts/work_mem/max_connections، dataset fingerprint/index/statistics، وأوقف اختلاف أعمال التطوير عن نافذة القياس بالتنسيق دون إيقافها بنفسك. لا install أو migration أو seed تلقائي. مولد الحمل خارج حصة API/DB إذا أمكن على الموارد المعتمدة؛ وإلا يسجل أثر مشاركته ويمنع تعميم النتيجة على مواصفات السيرفر.

بيانات synthetic مترابطة مقترحة، وليست تقديرًا لحجم الإنتاج:

| الحزمة | reps/routes للشركة الأكبر | Customers | Invoices / Items | Visits / Collections | Products / Lots |
| --- | ---: | ---: | ---: | ---: | ---: |
| S تشخيص | 25 / 25 | 1000 | 10000 / 100000 | 25000 / 5000 | 100 / 200 |
| M مرشح للمراحل | 150 / 150 | 10000 | 100000 / 1000000 | 250000 / 50000 | 1000 / 10000 |
| L لاحق بعد مراجعة مساحة/وقت التهيئة | 500 / 1000 | 50000 | 500000 / 5000000 | 1000000 / 250000 | 5000 / 50000 |

هذه الأعداد للشركة الأكبر؛ أضف شركتين صغيرتين بضوابط isolation، وسجل الإجمالي لكل جدول قبل القياس. S لا يغطي 150 مندوبًا مختلفًا؛ M حد مقترح لجولة 150، ويزاد إذا أثبتت متطلبات العمل حجمًا أكبر. لا يُولّد أي من ذلك الآن.

يغطي التوزيع 12 شهرًا، آخر 7/30/90 يومًا، timezone/date boundaries، 3 مناطق و6 مدن على الأقل، hierarchy manager/supervisor/rep، شركتي ANALYSIS_ONLY وSFA دون تفعيل أو grants ضمنية، Ready/current/previous versions وduplicate/blank business keys، returns/zero sales، credit غير معتمد، المخزون/الحجز/transit/custody والـexpiry/quarantine/UOM، و20 سطر مسودة كحد فعلي. جولة skew مقترحة: 80% من الطلب على 20% من المسارات/الأصناف، ومقارنة hot product واحد بالتوزيع المستقل؛ هذه فرضية اختبار لا وصفًا للعملاء. أعد fresh/stale statistics وwarm/cold prepared plans بشكل منفصل؛ ANALYZE fixture لا يغلق مشكلة runtime الإحصاءات.

ثلاثة ملفات حمل منفصلة لكل مرحلة:

- **A تحليلي:** Daily Brief/briefing، Smart Loading session وmanagement hit/miss، SGI latest/freshness، Team Performance بفترتين، Heatmap metric/date/geography، Decision Analytics وFSOS report. دورة مندوب قراءة مقترحة 5 طلبات/90 ثانية؛ supervisor ستة/90؛ admin خمسة/120. تشمل الكمية الفعلية لكل فتح شاشة بعد التقاط HTTP trace، ولا نسمّي كل click طلبًا واحدًا. manual SGI recompute/export/bulk ingestion إضافات منفصلة، وليست ضجيجًا مجهولًا في الجولة.
- **O تشغيلي:** هويات visits/drafts مختلفة، start/context مرة لكل زيارة، بحث products، إنشاء وحفظ 1/5/20 سطرًا، list/detail refresh، check اختياري، reopen/finish؛ WMS receipt/reserve/pick/dispatch/accept على وثائق منفصلة مع أصناف مشتركة بجولة مخصوصة؛ accounting receipt/opening/reversal على أطراف مختلفة. لكل عملية صلاحية فعلية. invoice posting والبيع النهائي غير الموجودين لا يستبدلان stub أو نجاح draft؛ يظلان غير مختبرين.
- **M مختلط:** نفس سلوك وبيانات O للمندوبين مع زيادة التحليلات عند supervisor/admin. ابدأ بعزل أثر مدير واحد ثم النسب أدناه. افصل الاختلاف الناشئ من زيادة العدد عن أثر تغيير workload. جولة invalidation/ingestion تُضاف لاحقًا بموافقة صريحة على clone فقط.

دورة المندوب في M مقترحة 180 ثانية: start=1، context=1، product search=2، draft create=1، saves=3، refresh بعد الحفظ=6، detail صريح=1، check=1، finish=1؛ **17 HTTP طلبًا** قبل أي طلب إضافي يظهره browser trace. لا إعادة briefing/context عند كل save. يفصل بينها think time عشوائي bounded مثل 5–15 ثانية للقراءة و15–35 ثانية للتحرير، مع بقية الدورة للزيارة؛ تتداخل UI refreshes كما في التطبيق وتبقى سقوف concurrency الحالية. القراءة/الكتابة ليست نسب طلبات HTTP مفترضة؛ تسجل من التسلسل الفعلي. retries وانقطاع الشبكة والصور والتحصيل الإضافي ملفات منفصلة ثم يضاف أثرها الموثق.

| المرحلة | المستخدمون النشطون في M (rep/supervisor/admin) | ramp | warmup مستبعد | قياس ثابت | تعافٍ أدنى | معدل طلبات اسمي لـM عند الدورة المقترحة |
| --- | --- | --- | --- | --- | --- | --- |
| 25 | 20 / 4 / 1 | 1 دقيقة | 2 دقيقة | 10 دقائق | 2 دقيقة | نحو 2.20 طلب/ثانية |
| 50 | 40 / 8 / 2 | 1 دقيقة | 2 دقيقة | 10 دقائق | 2 دقيقة | نحو 4.39 طلب/ثانية |
| 100 | 80 / 16 / 4 | 2 دقيقة | 2 دقيقة | 10 دقائق | 2 دقيقة | نحو 8.79 طلب/ثانية |
| 150 | 120 / 24 / 6 | 2 دقيقة | 2 دقيقة | 10 دقائق | 2 دقيقة | نحو 13.18 طلب/ثانية |

المعدلات أعلاه **تصميم إدخال workload وليست سعة مقاسة أو حدًا مستقبليًا**: `17×rep/180 + 6×supervisor/90 + 5×admin/120`. user يشمل وقت التفكير؛ HTTP in-flight وSQL active أرقام مختلفة. حجم fan-out الفعلي والتباطؤ قد يغيران achieved RPS. تسجل schedule/actual starts وتأخر المولد؛ لا نسمح للنموذج المغلق بإخفاء overload بانخفاض معدل الإرسال. بعد المعايرة يمكن جولة arrival-rate bounded مستقلة مع سقف outstanding requests وموافقة، دون تعويض backlog بدفعة طلبات.

في A وO استخدم العدد الإجمالي نفسه لكن ملفات الأدوار المناسبة معلنة مسبقًا؛ لا تقارن النتيجة مع M باعتبار اختلاف مزيج الأدوار أثر SQL. إضافة إلى ذلك قارن reps-only baseline مع **نفس عدد المندوبين** في M لعزل أثر الإدارة. تبدأ الخطة بbaseline فردي صغير بعد الموافقة، ثم 25؛ لا تنتقل إلى مرحلة أعلى إلا إذا مرت السابقة وتعافت. يكرر السيناريو بثلاث جولات مستقلة عند اتخاذ قرار عتاد، وبنفس seed والبيانات؛ لا يُعتمد أفضل تشغيل وحده.

لكل endpoint انشر عدد العينات. أقل من 100 عينة يجعل p95 وصفيًا ضعيفًا؛ p99 بعينات قليلة يبقى UNVERIFIED. اجمع عينات أكثر في تشغيل مخصص ضمن مدة معتمدة عند الحاجة، ولا تستنتج tail موثوقًا من طلبات admin النادرة أو تخلطها بمجموع requests. 10 دقائق ليست soak test؛ اختبار استقرار أطول وتراكم WAL/bloat/refresh جدول مستقل بعد نجاح المراحل وموافقة.

**8. القياسات وحدود التوقف المقترحة للموافقة**

الحدود التالية سياسة اختبار مقترحة، **ليست SLO معتمدة أو نتائج محققة**؛ ميزانيات البوابة الحالية لا تحتوي موافقات. يثبت كل حد لكل نوع endpoint قبل التنفيذ، مع عدم تخفيفه بعد الفشل.

| القياس | ما يُجمع | معيار مرحلة مقترح / توقف آمن |
| --- | --- | --- |
| سلامة الأعمال | business key، version، حركة stock/custody/GL وaudit، hash قبل/بعد للقراءات | توقف فوري عند tenant leak أو duplicate posting أو stock/GL drift أو تغير ledger من check/draft؛ الفشل BLOCK مهما كانت السرعة |
| Latency والنتائج | p50/p95/p99 لكل endpoint/action؛ جميع 4xx/5xx/timeouts/disconnects؛ offered/started/completed/successful RPS | عمليات عادية p95≤1s وp99≤2s؛ تحليلات عادية p95≤5s وp99≤10s. فشل نافذتين 60s بعد warmup يمنع التصعيد؛ إذا العينات قليلة لا ندعي PASS |
| الأخطاء | unexpected errors منفصلة عن 409 المتعمد ورفض صلاحية الاختبار | unexpected <1% في المرحلة؛ >2% لمدة 30s مع عينة مناسبة أو أي query-budget failure/deadlock/SQL timeout يوقف الإدخال ويشخّص؛ العينات الصغيرة تُراجع عددًا أيضًا |
| RIE | عدد leases/طلب، local/global queue wait، عمق الطابور وعمر الأقدم، lease hold، metadata reuse | نمو متواصل 60s أو أقدم انتظار>5s: وقف التصعيد وتصريف؛ queue timeout=30s ليس حدًا مقبولًا للأداء. إذا لا نملك عمق/عمر الطابور نسجل نقص القياس ولا نخترع صفرًا |
| Pool وPG locks | connections active/idle/waiting، acquisition time، pg_stat_activity/wait_event وblockers وdeadlocks، transaction/commit/WAL | انتظار قفل>3s متكرر أو pool occupancy≥90% مع زيادة acquisition لمدة 30s يوقف الإدخال؛ نفس-key conflict المتعمد يسجل منفصلًا مع invariant واحد |
| SQL/rows | SQL network count/request/action؛ native plans BUFFERS، actual rows×loops وrows removed، result rows/bytes، temp spills | لا Full Read/N+1 جديد؛ أي repeated fact scans تتجاوز budget معتمد BLOCK؛ limit للنتيجة لا يعفي scan. لا نجمع rows لكل عقد الخطة باعتبارها صفوفًا فريدة |
| API/DB resources | CPU لكل نواة والحد/throttling، RSS/heap/GC/event-loop، memory/swap/OOM؛ disk latency/free/WAL/temp | ذاكرة≥85% أو disk free<20% لمدة 30s، أو CPU/throttling شديد مستمر 60s: وقف الحمل احترازيًا. لا تُفسر هذه الحدود وحدها كتشخيص السبب |
| التعافي | اوقف الطلبات الجديدة، ثم trace للطلبات المتبقية والqueues والlocks وRSS/RPS | يجب عودة waits/latency إلى baseline المستقر خلال دقيقتين مقترحتين؛ عدم التعافي يمنع المرحلة التالية. احتفظ بالفشل ولا ترفع سقف الانتظار لإخفائه |

client deadlines مقترحة 5s للكتابات و15s للتحليلات ضمن السيناريو المعتمد؛ انقضاء client deadline لا يعني إلغاء SQL. لا retry storm؛ replay واحد مضبوط بهوية الأمر الأصلية، وفحص أثر الأمر قبل إعادة المحاولة عند جواب مجهول. أي إلغاء backend مطلوب في المختبر يستهدف sessions قاعدة المختبر فقط، بهوية متحققة وخطة teardown معتمدة؛ لا إيقاف cluster أو تطبيق يستخدمه تطوير آخر.

الـEXPLAIN ANALYZE وجمع الخطط للكتابات يُنفذان في clone مخصص؛ ROLLBACK وحده ليس تصريحًا لتجربة دالة ذات آثار خارج المعاملة. profiling الكامل ليس على كل طلب، ولا تُفعّل logs تحتوي payloads. قياس pool acquisition ليس استنتاجًا من طرح query p95 من API p95. PostgreSQL metrics/extensions أو أدوات قياس غير متوفرة تعرض للموافقة، ولا تثبت الأدوات تلقائيًا.

**9. كيف نقرر SQL أو RIE أو PostgreSQL أو زيادة الموارد؟**

| النمط المقاس في التجربة | القرار الأول | متى يدرس العتاد؟ |
| --- | --- | --- |
| scanned/returned وloops/buffers عالية، SQL طويل، queues لاحقة له | scope/projection/join/aggregate/index/statistics وتحقيق parity | بعد تقليل العمل غير الضروري وقياس استمرار ضغط CPU/I/O |
| PG سريع، RIE wait كبير، active leases منخفضة أو lease-held غير SQL | مراجعة coordinator accounting/حدود التنفيذ/fan-out | زيادة CPU/RAM لا تصلح permit محجوزًا خطأ؛ أي admission تعديل مستقل |
| pool wait كبير بينما SQL execution قصير | جرد pools/transactions/عدد العمليات وعدم تسريب/إطالة connections | لا نرفع max_connections قبل حساب ميزانية كل connection وعمليات الإدارة/النسخ |
| book/product row lock مهيمن وCPU منخفض | قصر المعاملة ومراجعة contention domain مع correctness | مزيد من الأنوية لا يوازي قسمًا متسلسلًا؛ تضييق القفل يحتاج تصميمًا وموافقة |
| API event-loop/GC كبير مع raw bytes/RSS | إزالة Full Reads وNode fact joins وتقليل serialization | CPU/RAM API إذا بقي الحمل الضروري هو المحدد بعد الإصلاح |
| CPU DB مشبع/محدود بعد SQL مناسب، بلا lock/pool bottleneck | مقارنة CPU لنفس workload | زيادة CPU مرشح تقاس فائدته، مع رصد single-core والـI/O |
| spills/page reads/GC/swap/OOM مرتبطة بworking set | تقليل عرض النتائج وsort/hash؛ مراجعة work_mem وعدد العمليات | RAM مرشح فقط بعد حساب الذاكرة الكلية؛ work_mem لكل عملية وقد يتضاعف بالتوازي |
| storage latency/WAL/commit waits مهيمنة | تخفيف العمل والكتابة غير الضرورية ومراجعة الخطط والمعاملات | storage/IOPS أو PG host مناسب؛ CPU/RAM وحدهما قد لا يعالجانها |

SQL أقل قد يقلل زمن حجز permit فيتحسن RIE تلقائيًا، لكن ذلك يُقاس ولا يُعلن بنسبة مسبقة. current-state/read models مناسبة لطبيعة D-1؛ stock/collections/GL تبقى authoritative transactional ولا تُخدم من snapshot قديم عند posting.

**10. مقارنة مواصفات وتكلفة التشغيل دون اختراع سعة**

تبدأ المقارنة بعد بيئة baseline معتمدة وبحمل ثابت. أمثلة مرشحة للمختبر فقط: DB 2 vCPU/4 GiB ثم 4/8 ثم 8/16، مع API ثابت أولًا؛ ثم API CPU وRAM كل منهما عامل مستقل. ليست هذه مواصفات Railway المقروءة أو توصية شراء أو وعدًا بدعمها. ثبّت نوع CPU/سرعته وحد throttling، storage/IOPS، الشبكة، PG major/minor/config/indexes/statistics، pools وreplica count. لا تقارن Windows development build بـLinux production build وتنسب الفارق للهاردوير.

| المرشح | API CPU/RAM | PG CPU/RAM/version/storage | A آخر مرحلة ناجحة | O آخر مرحلة ناجحة | M آخر مرحلة ناجحة | SLO/errors/queue/recovery | تكلفة شهرية |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C0 baseline | تُثبت | تُثبت | لم تُقَس | لم تُقَس | لم تُقَس | لم تُقَس | تُجمع من تسعير فعلي معتمد بتاريخ القياس |
| C1 تغيير CPU فقط | عامل مضبوط | عامل مضبوط | لم تُقَس | لم تُقَس | لم تُقَس | لم تُقَس | لا تقدير مختلق |
| C2 تغيير RAM فقط | عامل مضبوط | عامل مضبوط | لم تُقَس | لم تُقَس | لم تُقَس | لم تُقَس | لا تقدير مختلق |
| C3 PG/storage/config مستهدف | ثابت | تغيير واحد موثق | لم تُقَس | لم تُقَس | لم تُقَس | لم تُقَس | يشمل كلفة التخزين والصيانة |

`C_month = API + PostgreSQL + storage/IO + backup + network + external AI/API + تكلفة تشغيل وصيانة ذات صلة`.
`cost_per_measured_active_user = C_month / N_pass_M` عند تحقق workload/SLO والتعافي والمدة المتفق عليها؛ إن لم تنجح مرحلة فالقيمة غير متاحة.
قارن أيضًا `تكلفة 1000 عملية ناجحة` باستخدام throughput مستقر وduty cycle موثق، مع تكلفة الطلبات الفاشلة/retries ضمن المصروف. لا تقسم الفاتورة على registered users ولا تستنتج doubling capacity من doubling CPU.

«أكبر عدد عملي مقاس» هو أعلى مرحلة تمر بكل الشروط المتكررة في M للبيانات والمواصفات المحددة. إذا مرت 150 فهي **حد أدنى مثبت تحت تلك الشروط** وليست السقف الحقيقي؛ الوصول لأعلى من ذلك يحتاج خطة وموافقة جديدة، ولا يتوسع هذا المختبر تلقائيًا. هامش التشغيل المريح يحدد من spikes/التعافي/النمو المقاس، ولا نخترع نسبة أمان عالمية.

نحتاج زيادة الموارد حين يبقى المورد نفسه محددًا بعد إصلاح الهدر، وتثبت المقارنة المضبوطة أن تغييره يحسن throughput/SLO دون نقل الفشل إلى الكتابات أو pool أو RAM/IO. إنذار مبكر: صعود queue/pool/lock waits، استمرار cold recompute، تدهور scanned→returned والـestimate ratio، spills/WAL/commit، قرب budget 24، تضخم action SQL/RSS وGC، تأخر snapshot، وفشل العودة إلى baseline. المراقبة تكون مقاييس موجودة أو proposal مستقل؛ لا polling إضافي على الشاشات.

**11. خريطة التنفيذ ونتائج البوابات**

| الخطوة | المخرج | الحالة الآن / شرط الانتقال |
| --- | --- | --- |
| القراءة وحفظ حدود العمل | تقرير مستقل وبصمات أدلة؛ تمييز المقاس والفرضيات | PASS لنطاق التدقيق فقط |
| بوابة Scalability الدائمة | قرئت الوثيقة وأُجري offline evidence assessment | WARN / UNVERIFIED فعلي: approvals فارغة ولا current evidence أو baseline موثوق؛ لا حكم من هذا الفحص على اختبارات تغيير البوابة الجاري |
| تهيئة المختبر | هوية native PG مستقلة وsynthetic dataset وsource digest وقياسات مكتملة | BLOCK لبدء الحمل حتى الموافقة وإثبات العزل وعدم مشاركة موارد تطوير الفواتير دون تنسيق |
| baseline وتشخيص صغير | traces وplans وparity وفصل SQL/pool/RIE/locks | لم يُنفذ؛ لا قياس جديد من هذا التقرير |
| تحسين نطاق معزول | diff مقترح متفق عليه ثم اختبارات وأدلة قبل/بعد | يتوقف هنا قبل تغيير كود أو architecture؛ لا ملف invoice/draft ضمن أول اقتراح |
| المراحل A/O/M 25→50→100→150 | أعلى مرحلة ناجحة لكل workload وrecovery | UNVERIFIED/WARN للسعة الحالية؛ لا انتقال عبر مرحلة فاشلة |
| اعتماد ترحيل البيع النهائي | عقد invoice posting واقعي + atomicity/idempotency/native races/load | BLOCK: أدلة draft/read-only لا تغطيه، مع الحفاظ على التطوير الجاري |
| بوابة الجودة المشتركة الجارية | آخر artifact مقروء أثناء التسليم | BLOCK: 637 فحصًا ناجحًا، لكن API typecheck فاشل؛ لم يشغله هذا التدقيق ولم يفحص سبب فشله أو يعدّل ملفات مالكه |
| قرار العتاد/الإطلاق | تكلفة/سعة مقاسة، gates وظيفية وSQL وrelease/recovery/build مناسبة | BLOCK للاعتماد الحالي؛ فشل typecheck لا يعفى بـWARN السعة؛ لا تصريح نشر أو Production أو Docker في المهمة |

**System Design Gate: WARN** للتقييم الشامل: البنية توفر scope/atomicity/admission جيدة، لكن Full Reads محددة في الكود وmixed capacity وpool/lock waits الحالية غير مقاسة. لا يوجد تنفيذ جديد أُعلن جاهزًا.

**Scalability Gate: WARN / UNVERIFIED** للسعة: السيناريو الجديد غير منفذ، حجم بياناته وتزامنه وSQL count وAPI p95 غير متاحة كقياسات جديدة. الأدلة السابقة الوحيدة القابلة للتفصيل هنا تسلسلية للمسودات: 20 products/200 lots، concurrency=1، save=31 SQL، check B1=22 SQL وp95=51.4 ms؛ bottleneck SQL statistics بقي مخاطرة مفتوحة، والتنافس مع التحليلات/الأقفال/pool لم يُختبر.

في B1 سابقًا: 3 warmups و25 عينة warm؛ native execution=11.560 ms و20 rows/10682 bytes؛ maximum RSS نحو443 MiB لعملية الاختبار كاملة. لا تعد هذه RAM لكل مستخدم. stale-statistics assertion فشل ومحفوظ؛ تمرير fixture بعد ANALYZE لا يمحو فشله ولا يثبت robust runtime. أي اعتماد robustness لذلك السيناريو أو تجاوز budget معتمد يبقى BLOCK حتى دليل مناسب، وليس WARN يعفي الفشل.

المراجعة قرأت artifacts وظيفية سابقة PASS=621 وSQL=167 عند HEAD المذكور، ولم تُعد تشغيلها أو تنسبها لهذه المهمة. **لم يُشغّل `pnpm quality --base …` أو `quality:postgres` هنا**: الطلب الحالي تحليل قراءة فقط، والـrunner يعيد بناء schemas ويكتب `.quality/changed.json` وأدلة مشتركة مع التطوير الجاري. لا نعتمد implementation/release في غياب gates؛ قبل قبول أي تعديل لاحق تُشغّل الأوامر المطلوبة على actual review base المثبت ونطاق معزول متفق عليه، مع zero failures/skips/TODOs. لا نختار HEAD لإخفاء تغييرات committed ضمن مراجعة أوسع، ولا نحول docs audit إلى release certification.

**تحديث التسليم:** تغير `.quality/changed.json` أثناء هذا التدقيق دون تشغيله من هذه المهمة؛ عند التقاط manifest كان قد بدأ تشغيل آخر، ثم أصبحت نتيجته المقروءة `status=BLOCK / functionalStatus=BLOCK / typesPassed=false`، و637 passed، وصفر failed/skipped/TODO/cancelled، وفحص أنواع `api` غير ناجح. لا نعيد استخدام PASS=621 القديم لاعتماد حالة العمل الحالية. يحتفظ ملف الأدلة بالملاحظة السابقة واللاحقة وببصمة كل قراءة؛ السبب التفصيلي لفشل الأنواع خارج نطاق هذا التقرير ولا ننسبه إلى مشكلة أداء. الجاهزية الوظيفية الحالية **BLOCK** إلى أن يعالج مالك التطوير الفشل ويعيد التحقق. لا يغيّر ذلك نتيجة evidence assessment المنفصلة `WARN / UNVERIFIED` للسعة.

جُرّب `pnpm quality:scalability --output-directory docs/engineering/capacity-lab/scalability-assessment`، لكن pnpm تعثر بـ`EPERM realpath` قبل الوصول إلى الأمر، وأظهر محاولة فحص/تشغيل install تلقائي. لم يُطلب تثبيت اعتماد أو تصعيد، ولم يظهر تغيير في lockfile. استُخدم بدلًا منه **نفس مدخل الأداة**: `node tools/quality/scalability.mjs --output-directory docs/engineering/capacity-lab/scalability-assessment`؛ exit=0 مع **WARN / UNVERIFIED**، وليس PASS أو اختبار حمل. فشل مسار pnpm محفوظ كقيد runtime للتحقق اللاحق؛ لا يُعد نجاح المدخل المباشر إثباتًا لسلامة أمر pnpm أو البوابة الوظيفية الكاملة. جميع مخرجات هذه الخطوة داخل مجلد التقرير، دون الكتابة على `.quality` المشتركة.

النقطة التالية التي تحتاج موافقة هي اعتماد **بيئة المختبر ونطاق القياس والميزانيات**، أو اعتماد **diff تحسين منفصل** بعد عرضه. لم يبدأ أي منهما بهذا التقرير.
