import { Prisma } from "@field-sales-os/database";

/** Trusted backend configuration, never a client flag/name/future-data heuristic. */
export function isDemoDailyCompany(companyId: string): boolean {
  const configured = process.env.RIE_DEMO_CANONICAL_COMPANY_ID?.trim();
  return Boolean(configured && configured === companyId);
}

const riyadhFormatter = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"});
export function riyadhReadDay(now = new Date()): string {
  const parts = riyadhFormatter.formatToParts(now);
  const part = (name:string) => parts.find(p=>p.type===name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Included only for the configured tenant; source data/mode are never cached here. */
export function demoDailyCacheTag(companyId: string, readDay = riyadhReadDay()): string {
  return isDemoDailyCompany(companyId) ? `rie-demo-daily-v2:${readDay}` : "";
}

/** An uncorrelated tenant-mode check within the existing SQL statement. */
export function demoDailyGuard(companyId:string, visible:Prisma.Sql):Prisma.Sql {
  if (!isDemoDailyCompany(companyId)) return Prisma.empty;
  return Prisma.sql`AND (NOT EXISTS (SELECT 1 FROM company_operating_settings demo_daily_mode
    WHERE demo_daily_mode.company_id=${companyId} AND demo_daily_mode.operating_mode='FULL_ERP') OR (${visible}))`;
}

function datedValue(value:Prisma.Sql, day:string):Prisma.Sql {
  // Invalid/undated facts cannot establish a day. Dates come from normalized
  // canonical ingestion; the prefix also supports its ISO datetime representation.
  const date=Prisma.sql`left(btrim(${value}),10)`;
  return Prisma.sql`CASE WHEN ${date} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND pg_input_is_valid(${date},'date') THEN ${date} <= ${day} ELSE FALSE END`;
}

const eventDates:Readonly<Record<string,string>>={
  Invoices:"InvoiceDate",Returns:"ReturnDate",Visits:"VisitDate",Collections:"CollectionDate",
  "Van Loads":"LoadDate","Van Inventory":"ReportDate","Sales Calendar":"CalendarDate",
  "Price List":"StartDate","Route Assignments":"StartDate",
};

/** Shared by CTEs and direct canonical readers, before joins/MAX/aggregation. */
export function demoCanonicalReadGuard(companyId:string, entity:string, alias:string):Prisma.Sql {
  if (!isDemoDailyCompany(companyId)) return Prisma.empty;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(alias)) throw Error("Invalid RIE internal alias");
  const data=Prisma.sql`${Prisma.raw(alias)}.data`,day=riyadhReadDay();
  const field=eventDates[entity];
  if(field) return demoDailyGuard(companyId,datedValue(Prisma.sql`${data}->>${field}`,day));
  if(entity==="Employees") {
    const hire=Prisma.sql`${data}->>'HireDate'`;
    return demoDailyGuard(companyId,Prisma.sql`NULLIF(btrim(${hire}),'') IS NULL OR ${datedValue(hire,day)}`);
  }
  if(entity==="Targets") {
    const year=Prisma.sql`${data}->>'Year'`,month=Prisma.sql`${data}->>'Month'`;
    return demoDailyGuard(companyId,Prisma.sql`CASE WHEN ${year} ~ '^[0-9]{4}$' AND ${month} ~ '^([1-9]|0[1-9]|1[0-2])$'
      THEN (${year}||'-'||lpad(${month},2,'0')||'-01') <= ${day} ELSE FALSE END`);
  }
  if(entity==="Invoice Items" || entity==="Return Items") {
    const parent=entity==="Invoice Items"?"Invoices":"Returns",key=entity==="Invoice Items"?"InvoiceNo":"ReturnNo";
    const date=entity==="Invoice Items"?"InvoiceDate":"ReturnDate";
    // One hashable, company-scoped parent-key relation, including for a direct
    // item-only read. Orphan lines cannot bypass the parent's effective date.
    return demoDailyGuard(companyId,Prisma.sql`lower(btrim(${data}->>${key})) IN (
      SELECT lower(btrim(demo_daily_parent.data->>${key})) FROM rie_canonical_entity_rows demo_daily_parent
      WHERE demo_daily_parent.company_id=${companyId} AND demo_daily_parent.entity_name=${parent}
        AND ${datedValue(Prisma.sql`demo_daily_parent.data->>${date}`,day)})`);
  }
  // Master identity, expiry/due/end dates are not business-event dates.
  if(["Companies","Regions","Branches","Routes","Customers","Products"].includes(entity)) return Prisma.empty;
  // New/unknown entities need an explicit temporal contract before Demo reads
  // may expose them. Default/Analysis/other-company behavior is still untouched.
  return demoDailyGuard(companyId,Prisma.sql`FALSE`);
}

/** Non-canonical RIE adapters (calendar/history) use the same day and mode gate. */
export function demoDailyTypedDateGuard(companyId:string,value:Prisma.Sql,nullable=false):Prisma.Sql {
  if(!isDemoDailyCompany(companyId)) return Prisma.empty;
  return demoDailyGuard(companyId,Prisma.sql`${nullable?Prisma.sql`${value} IS NULL OR`:Prisma.empty} ${value} <= ${riyadhReadDay()}::date`);
}
