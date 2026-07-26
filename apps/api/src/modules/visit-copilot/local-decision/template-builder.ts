// FDA Local Decision Layer — Template Builder.
//
// FDA requirement (per client's explicit architecture note): the user must
// never be able to tell, from the shape of the reply text, whether a Rule
// Engine or the AI answered. So both paths render through this ONE
// function. Rule Engine responses build a LocalAnswer and pass it here;
// the AI path (unchanged Claude call) keeps returning free-form prose,
// which already reads the same way to the user — this builder just gives
// the Rule Engine path the same three-line shape instead of a raw number.

export interface LocalAnswer {
  title: string;
  value: string;
  contextLine?: string;
}

export function renderLocalAnswer(answer: LocalAnswer): string {
  const lines = [answer.title, answer.value];
  if (answer.contextLine) lines.push(answer.contextLine);
  return lines.join("\n");
}

// Multi-section variant — for replies that summarize several already-
// computed fields at once (e.g. Customer 360) instead of answering one
// specific question. Same rule as renderLocalAnswer: every line here must
// come from real computed data, never an invented value. A section with no
// lines is simply omitted by the caller before this is invoked — this
// function only renders what it's given.
export interface LocalSection {
  heading: string;
  lines: string[];
}

export function renderLocalSections(title: string, sections: LocalSection[]): string {
  const blocks = [title];
  for (const section of sections) {
    if (section.lines.length === 0) continue;
    blocks.push([section.heading, ...section.lines].join("\n"));
  }
  return blocks.join("\n\n");
}
