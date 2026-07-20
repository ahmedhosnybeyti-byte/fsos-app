# ADR-002: حسم ازدواجية تمثيل Employees (Prisma Employee مقابل Canonical Employees)

| | |
|---|---|
| **الحالة (Status)** | معتمد (Approved) |
| **التاريخ** | 2026-07-18 |
| **صاحب القرار** | Ahmed Hosny (Product Owner) |
| **النطاق** | كيان Employees فقط — لا يمس أي كيان كانوني آخر |
| **يُعدِّل** | ADR-001، القسم ٤ ("حالة خاصة يجب حلها أولًا... كيان Employees له تمثيلان متوازيان") — هذا البند كان معلّقًا (Open) في ADR-001 ويُحسم رسميًا بموجب هذه الوثيقة |
| **الوثائق ذات الصلة** | ADR-001-eliminate-manual-column-mapping.md، PROJECT_LOG.md (بند "Migration #9 — بحث Hierarchy Columns Editor") |

هذه الوثيقة سجل قرار معماري (Architecture Decision Record) مستقل — لا تُعدَّل بنودها إلا عبر ADR جديد يُلغيها أو يُعدِّلها صراحةً.

---

## ١. السياق (Context)

عند محاولة تحديد نطاق Migration #9 (Hierarchy Columns Editor / Route Hierarchy Config Editor) ضمن خطة RIE Migration Plan (ADR-001)، تبيّن أن كيان "Employee" له تمثيلان مستقلان وحيّان فعليًا على المنصة، بلا أي ربط برمجي بينهما:

1. **جدول Prisma `Employee` الحقيقي** ("Employee Management — Phase 5"، `schema.prisma`) — سجل إداري (HR) كامل: `employeeCode`، `fullName`، `jobTitle`، `orgUnitId` (ربط بهيكل Phase 3)، `managerId` (self-FK)، `status` (6 حالات: DRAFT/ACTIVE/ON_LEAVE/SUSPENDED/INACTIVE/ARCHIVED)، `userId` (ربط اختياري 1:1 بحساب دخول حقيقي على `User`)، مع تكامل بيانات مُنفَّذ فعليًا (منع دورات إدارية، حظر أرشفة موظف له مرؤوسين نشطين، Audit Log كامل). له شاشة إدارية حية ومربوطة بالـ Sidebar الرئيسي (`/dashboard/employees`) — إنشاء/تعديل/أرشفة موظف، تعيين مدير ووحدة تنظيمية، ربط/فك ربط حساب دخول.

2. **Canonical Entity `Employees` كـ Excel Dataset مرفوع** (`canonical-entities.data.ts`، primaryKey `EmployeeID`) — حقول: `EmployeeID`، `Username`، `EmployeeName`، `Role` (Enum صلاحيات المنصة)، `DirectManagerID` (self-FK)، `Mobile`، `Email` (إلزامي)، `HireDate`، `Status` (حالتان فقط: Active/Inactive)، `BranchID`. يُستخدم فعليًا (عبر `RieFacade.getEntityRecords("Employees", ...)`) من ثلاث شاشات مهاجرة بالفعل ومعتمدة: Visit Efficiency (Migration #6)، Team Performance (Migration #7)، Sales Growth/SGI (Migration #8) — لاستنتاج هوية المندوب (`RouteID -> Routes.SalesRepID -> Employees`) وعلاقة المشرف (`DirectManagerID`).

المقارنة الحقلية تؤكد أن التمثيلين لا يتطابقان بنيويًا: مفتاح أساسي مختلف تمامًا (`id` مولَّد من قاعدة البيانات مقابل `EmployeeID` نص حر مرفوع)، مفردات حالة مختلفة، `Role`/`Username` موجودان في التمثيل الكانوني فقط، `orgUnitId`/تكامل البيانات/Audit Log/ربط حساب الدخول موجودون في تمثيل Prisma فقط. المفتاح الطبيعي الوحيد المرشّح للربط (البريد الإلكتروني) غير متماثل: `Employee.contactEmail` اختياري وغير مُستخدم فعليًا في أي منطق مطابقة، بينما `Employees.Email` (الكانوني) إلزامي ومُفترَض ضمنيًا أنه يطابق `User.email` (بريد تسجيل الدخول الفعلي) دون أي FK أو تحقق حقيقي يفرض ذلك.

اكتُشف أيضًا أن آلية الوصول الهرمي (Hierarchy Row-Level Filter) الحالية لكل قراءة عبر RIE (`ExcelDatasetEntityProvider`) لا تزال تعتمد داخليًا على `File.repColumn/supervisorColumn/managerColumn` (اليدوية، من Hierarchy Columns Editor) — وليست جزءًا من هذا القرار مباشرة، لكنها السبب الأصلي وراء تجميد Migration #9 وتُسجَّل كبند منفصل في قسم ٤ أدناه.

---

## ٢. القرار (Decision)

يُعتمد رسميًا:

1. **Prisma `Employee` وCanonical `Employees` نظامان منفصلان بالتصميم، يخدمان غرضين مختلفين، ولا يُدمَجان في مصدر حقيقة واحد ضمن موجة RIE Migration الحالية:**
   - **Prisma `Employee`** = سجل إداري (HR/Org Management) حي، يُعدَّل مباشرة من داخل المنصة، له تكامل بيانات وAudit Log وربط بحساب دخول — مصدر الحقيقة لأي شاشة إدارية (مثل `/dashboard/employees`).
   - **Canonical `Employees`** = بيانات تشغيلية دورية الرفع (مثل Customers/Invoices/Routes تمامًا) — مصدر الحقيقة لأي تحليل/Join عبر RIE يحتاج بيانات المندوب/المشرف (زي Visit Efficiency، Team Performance، SGI).
2. **لا يُطلب أي تعديل أو دمج بين النظامين** في هذه المرحلة. الشاشات الثلاث المهاجرة بالفعل (#6، #7، #8) تستمر في القراءة من Canonical `Employees` دون تغيير. شاشة `/dashboard/employees` تستمر في القراءة/الكتابة على Prisma `Employee` دون تغيير.
3. **بند ADR-001 المعلّق ("يجب حسم مصدر الحقيقة الواحد") يُعتبر محسومًا** بقرار "لا يوجد مصدر حقيقة واحد مطلوب — كل نظام مصدر حقيقة لنطاقه الخاص فقط".
4. آلية الوصول الهرمي الداخلية لـ RIE (اعتمادها الحالي على `File.repColumn/supervisorColumn` اليدوية) **لا تُعالَج بهذا القرار** — تُسجَّل كبند Architecture Backlog مستقل (قسم ٤).

---

## ٣. الأثر (Consequences)

**إيجابي:**
- يفتح الطريق أمام إغلاق ملف "RIE Migration Plan" الحالي (Migrations #1-#8) دون انتظار حل بنية تحتية أعمق غير جاهزة.
- لا كسر لأي من النظامين الحيين (شاشة `/dashboard/employees` الإدارية، أو الشاشات الثلاث المهاجرة).
- أقل مخاطرة ممكنة — صفر تغيير كود.

**تكلفة/قيود:**
- Hierarchy Columns Editor / Route Hierarchy Config Editor **يبقيان بلا ترحيل فعلي** — يستمران على النمط اليدوي (Manual Mapping) كما هما، لأن حلّهما الحقيقي (بند ٤ أدناه) خارج نطاق هذا القرار.
- لا وجود لآلية تزامن أو تنبيه لو تباعدت بيانات الموظف بين النظامين (نفس الشخص بقيم مختلفة في كل نظام) — مقبول ضمنيًا كأثر جانبي لقرار الفصل، وليس خطأ يحتاج إصلاحًا الآن.

---

## ٤. Architecture Backlog — بند مستقل، خارج موجة RIE Migration الحالية

**العنوان:** استبدال آلية Hierarchy Row-Level Filter الداخلية في RIE (حاليًا: أعمدة يدوية `File.repColumn/supervisorColumn/managerColumn`) بآلية Join تلقائية بالكامل، على نمط ما تفعله Migrations #6/#7/#8 بالفعل داخل منطقها الخاص (`RouteID -> Routes.SalesRepID -> Employees`).

**لماذا Backlog وليس Technical Debt:** هذا ليس قصورًا ناتجًا عن اختصار في التنفيذ — هو عمل معماري مستقبلي غير مُنفَّذ بعد، بنطاق تأثير يشمل كل قراءة على المنصة عبر `RieFacade` (وليس شاشة واحدة)، ويحتاج تصميمًا واختبارًا منفصلين قبل البدء.

**الشروط المسبقة قبل البدء فيه:**
1. تصميم آلية الوصول الهرمي الجديدة (كيف تُحدَّد صلاحية رؤية صف بيانات بدون عمود يدوي) واعتمادها.
2. خطة ترحيل تدريجية لا تكسر الشاشات القائمة أثناء التحول (نفس مبدأ ADR-001، القسم ٢ بند ٥).
3. حسم ما إذا كانت هذه الآلية ستستخدم Canonical `Employees` (Excel) أو تحتاج جسرًا لـ Prisma `Employee` — سؤال منفصل عن هذا الـ ADR، يُقيَّم عند بدء هذا المشروع تحديدًا.

**الحالة:** لم يبدأ أي تنفيذ. يُقيَّم كمشروع مستقل بعد اكتمال موجة RIE Migrations الحالية.

---

## ٥. الحالة التنفيذية

**نُفِّذ بالكامل بمجرد اعتماد هذه الوثيقة — قرار توثيقي فقط، لا يتطلب أي تعديل كود.** يُغلق بذلك البند المعلّق في ADR-001 الخاص بازدواجية Employees. Migration #9 (بصيغتها الأصلية في خطة RIE Migration Plan) لا نطاق تنفيذي فعلي لها بعد هذا القرار — تُستبدل ببند Architecture Backlog في القسم ٤ أعلاه.
