// FDA Local Decision Layer — Entity Resolution (generic, platform-level).
//
// Client's explicit rule (2026-07-26): when a chat message needs an entity
// (customer, salesperson, branch, region, ...) and doesn't name one, the
// system must resolve it deterministically or refuse — never guess, and
// never hand an ambiguous question to AI (AI would just guess itself, or
// ask its own clarifying question — that job belongs to this layer, not
// the model). Execution order, fixed:
//
//   1. Explicit entity named in the current message.
//   2. Most recent valid entity mentioned earlier in the conversation
//      history (request-scoped only — read from the history the caller
//      already sends with every request; no new storage, no session
//      table, no persistent Conversation Context Manager).
//   3. Self-context or a uniquely-scoped entity derivable from the
//      authenticated user's own hierarchy/permissions.
//   4. Still ambiguous → return a local clarification message. Do not
//      call AI.
//
// This file is the generic mechanism only — it knows nothing about what a
// "Customer" or "Branch" actually is. Each entity type registers an
// EntityResolver (below) that knows how to extract a mention from text and
// how to look up self-context/unique-scope for that one entity. The engine
// never talks to RieFacade, Prisma, or any other storage directly.

export interface ResolvedEntity {
  entityType: string;
  id: string;
  label: string;
}

export type EntityResolutionOutcome =
  | { status: "resolved"; entity: ResolvedEntity; via: "explicit" | "history" | "self-context" | "unique-scope" }
  | { status: "ambiguous"; entityType: string; clarificationMessage: string };

// A ChatTurn is intentionally minimal — just enough to scan history for a
// prior mention. Both Visit Copilot and Smart Assistant's chat histories
// are `{role, content}` already; no new shape is introduced here.
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface EntityResolver<TAuthContext> {
  entityType: string;
  // Tries to find an explicit mention of this entity in a single message.
  // Returns null if the message doesn't clearly name one — same contract
  // Dictionary Engine's resolveMentionedCustomer already follows.
  findMention: (message: string) => Promise<ResolvedEntity | null>;
  // Tries to resolve "the current user's own X" or "the one X the user's
  // permissions allow" — returns null if neither applies (e.g. the field
  // linking user to entity isn't set, or the user's scope contains more
  // than one candidate). Must never guess among multiple candidates.
  resolveSelfOrUniqueScope: (auth: TAuthContext) => Promise<ResolvedEntity | null>;
  // Arabic clarification prompt shown when resolution fails outright.
  clarificationMessage: string;
}

// Scans history newest-first for the most recent message the given
// resolver can extract a mention from. Only user-authored turns are
// considered — an assistant's own prior reply mentioning an entity (e.g.
// while explaining something) is not a reliable signal of what the user is
// now asking about.
async function findInHistory<TAuthContext>(resolver: EntityResolver<TAuthContext>, history: readonly ChatTurn[]): Promise<ResolvedEntity | null> {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (!turn || turn.role !== "user") continue;
    const mention = await resolver.findMention(turn.content);
    if (mention) return mention;
  }
  return null;
}

// The single entry point. Runs the fixed 4-step order for one entity type
// and returns either a resolved entity (with which step resolved it, for
// diagnostics) or an ambiguous outcome carrying the exact local
// clarification text — callers must stop and return that text verbatim,
// never fall through to AI on an ambiguous outcome.
export async function resolveEntity<TAuthContext>(
  resolver: EntityResolver<TAuthContext>,
  message: string,
  history: readonly ChatTurn[],
  auth: TAuthContext,
): Promise<EntityResolutionOutcome> {
  const explicit = await resolver.findMention(message);
  if (explicit) return { status: "resolved", entity: explicit, via: "explicit" };

  const fromHistory = await findInHistory(resolver, history);
  if (fromHistory) return { status: "resolved", entity: fromHistory, via: "history" };

  const selfOrUnique = await resolver.resolveSelfOrUniqueScope(auth);
  if (selfOrUnique) return { status: "resolved", entity: selfOrUnique, via: "self-context" };

  return { status: "ambiguous", entityType: resolver.entityType, clarificationMessage: resolver.clarificationMessage };
}
