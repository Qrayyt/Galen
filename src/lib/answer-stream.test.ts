import { describe, expect, it } from "vitest";
import { AnswerStream } from "./answer-stream";

describe("answer stream whitespace fidelity", () => {
  it("keeps trailing spaces for the next delta", () => {
    const stream = new AnswerStream();
    expect(stream.append("Привет, ")).toBe("Привет,");
    expect(stream.append("как дела? ")).toBe("Привет, как дела?");
    expect(stream.append("Всё хорошо.")).toBe("Привет, как дела? Всё хорошо.");
  });

  it.each([
    "## Ответ\n\nОбычный русский текст. 😀\n\nСледующий абзац.",
    "| Имя | Значение |\n| --- | --- |\n| Один | Два |",
    "```powershell\n  Write-Output 'Привет мир'\n\n  Get-Date\n```",
    "Путь `C:\\Users\\Илья\\Мой проект`, camelCase и https://example.com/a_b.",
  ])("preserves content regardless of chunk boundaries: %s", (source) => {
    for (let width = 1; width <= 31; width++) {
      const stream = new AnswerStream();
      let result = "";
      for (let offset = 0; offset < source.length; offset += width) {
        result = stream.append(source.slice(offset, offset + width));
      }
      expect(result).toBe(source);
    }
  });

  it("retains hidden input until a reasoning block closes", () => {
    const stream = new AnswerStream();
    expect(stream.append("<think>Скрытое")).toBe("");
    expect(stream.append(" продолжение</think>Готово. ")).toBe("Готово.");
    expect(stream.append("Ответ здесь.")).toBe("Готово. Ответ здесь.");
  });
});
