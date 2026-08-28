export interface ReasoningSplit {
  answer: string;
  reasoning: string;
}

const TAGGED_REASONING = /<(think|thinking|analysis|reasoning)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const OPEN_REASONING = /<(think|thinking|analysis|reasoning)\b[^>]*>/i;
const STRAY_REASONING_TAG = /<\/?(?:think|thinking|analysis|reasoning)\b[^>]*>/gi;
const CHANNEL_REASONING = /<\|channel\|>\s*(?:analysis|reasoning)([\s\S]*?)<\|channel\|>\s*final/gi;

/** Defensive UI-side filter for persisted chats and unusual model templates. */
export function splitReasoningText(input: string): ReasoningSplit {
  const reasoning: string[] = [];
  let answer = input.replace(CHANNEL_REASONING, (_match, hidden: string) => {
    const value = hidden.trim();
    if (value) reasoning.push(value);
    return "";
  });

  answer = answer.replace(TAGGED_REASONING, (_match, _tag: string, hidden: string) => {
    const value = hidden.trim();
    if (value) reasoning.push(value);
    return "";
  });

  const unfinished = answer.match(OPEN_REASONING);
  if (unfinished?.index !== undefined) {
    const tail = answer.slice(unfinished.index + unfinished[0].length).trim();
    if (tail) reasoning.push(tail);
    answer = answer.slice(0, unfinished.index);
  }

  return {
    answer: answer.replace(STRAY_REASONING_TAG, "").trim(),
    reasoning: reasoning.join("\n\n").trim(),
  };
}

export function visibleAnswer(input: string): string {
  return splitReasoningText(input).answer;
}
