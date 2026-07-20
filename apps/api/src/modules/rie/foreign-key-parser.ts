// RIE Navigation Engine — Relationship Registry `navigation.foreignKey`
// string parser.
//
// The Registry documents foreignKey as free-form text copied from the
// Canonical Database's own notation ("Regions.CompanyID",
// "Visits.InvoiceNo (nullable)", "Targets.(Month,Year,RouteID) composite
// key", "Visits.VisitDate = Sales Calendar.CalendarDate (logical join, not
// a stored FK)"). This is intentional — the Registry Specification defines
// it as documentation, not a machine contract (see FSOS Relationship
// Registry Specification v1.0). Navigation Engine is the first consumer
// that needs it programmatically, so parsing happens here, once, in one
// place — never re-parsed ad hoc inside navigation logic.

export interface ForeignKeySpec {
  /** Literal entity name the join column physically lives on (the "many"/child side), or null if unparseable / not a simple single-column FK. */
  onEntity: string | null;
  /** Column name on `onEntity`, or null if unparseable. */
  column: string | null;
  isNullable: boolean;
  isComposite: boolean;
  isLogicalJoin: boolean;
  /** For logical joins only: the other side's entity + column (e.g. Sales Calendar / CalendarDate). */
  logicalJoinTarget: { entity: string; column: string } | null;
  raw: string | null;
}

const SIMPLE_FK_RE = /^([^.]+)\.([A-Za-z0-9_]+)/;
const LOGICAL_JOIN_RE = /^(.+?)\s*=\s*(.+?)(?:\s*\(logical join.*)?$/i;

export function parseForeignKeySpec(foreignKey: string | null): ForeignKeySpec {
  if (!foreignKey) {
    return { onEntity: null, column: null, isNullable: false, isComposite: false, isLogicalJoin: false, logicalJoinTarget: null, raw: null };
  }

  const isNullable = /\(nullable/i.test(foreignKey);
  const isComposite = /composite key|\([A-Za-z]+,\s*[A-Za-z]+/i.test(foreignKey);
  const isLogicalJoin = /logical join/i.test(foreignKey) || foreignKey.includes("=");

  if (isLogicalJoin) {
    const match = LOGICAL_JOIN_RE.exec(foreignKey);
    if (match) {
      const left = parseSimpleSide(match[1]!.trim());
      const right = parseSimpleSide(match[2]!.trim());
      // `left` is treated as the primary side (the entity that "owns" this navigation entry's foreignKey documentation is always listed first).
      return {
        onEntity: left?.entity ?? null,
        column: left?.column ?? null,
        isNullable,
        isComposite: false,
        isLogicalJoin: true,
        logicalJoinTarget: right ? { entity: right.entity, column: right.column } : null,
        raw: foreignKey,
      };
    }
    return { onEntity: null, column: null, isNullable, isComposite: false, isLogicalJoin: true, logicalJoinTarget: null, raw: foreignKey };
  }

  if (isComposite) {
    // e.g. "Targets.(Month,Year,RouteID) composite key" — extract the owning entity at least.
    const entityMatch = /^([^.]+)\./.exec(foreignKey);
    return {
      onEntity: entityMatch ? entityMatch[1]!.trim() : null,
      column: null,
      isNullable,
      isComposite: true,
      isLogicalJoin: false,
      logicalJoinTarget: null,
      raw: foreignKey,
    };
  }

  const simple = parseSimpleSide(foreignKey);
  return {
    onEntity: simple?.entity ?? null,
    column: simple?.column ?? null,
    isNullable,
    isComposite: false,
    isLogicalJoin: false,
    logicalJoinTarget: null,
    raw: foreignKey,
  };
}

function parseSimpleSide(text: string): { entity: string; column: string } | null {
  const match = SIMPLE_FK_RE.exec(text.trim());
  if (!match) return null;
  return { entity: match[1]!.trim(), column: match[2]!.trim() };
}
