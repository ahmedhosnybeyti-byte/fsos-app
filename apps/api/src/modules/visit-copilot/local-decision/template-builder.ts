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
