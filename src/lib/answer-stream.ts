import { visibleAnswer } from "./reasoning";

/** Keep original deltas: a display projection must never become the next input. */
export class AnswerStream {
  private raw = "";

  append(delta: string): string {
    this.raw += delta;
    return visibleAnswer(this.raw);
  }
}
