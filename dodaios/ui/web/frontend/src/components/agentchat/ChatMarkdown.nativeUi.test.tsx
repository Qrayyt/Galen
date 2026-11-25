import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatMarkdown } from "./ChatMarkdown";

const payload = JSON.stringify({ version: 1, fallback: "Test plan", blocks: [{ type: "checklist", title: "Steps", items: ["Run tests"] }] });
const open = "```galen-ui\n" + payload;
const closed = open + "\n```";
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("normalized provider text with native UI", () => {
  it.each<[string, string[]]>([["OpenAI-style chunks", [open.slice(0, 20), open.slice(20), "\n```"]], ["Anthropic-style chunks", ["```galen-ui\n", payload, "\n```"]], ["Gemini-style text parts", [open, "\n```"]]])("renders safely after %s complete", async (_name, chunks) => {
    let text = "Summary before widget.\n\n";
    const { rerender } = render(<ChatMarkdown text={text} live messageId="message-a" />);
    for (const chunk of chunks.slice(0, -1)) {
      text += chunk;
      rerender(<ChatMarkdown text={text} live messageId="message-a" />);
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.getByText("Summary before widget.")).toBeTruthy();
    }
    rerender(<ChatMarkdown text={text + chunks[chunks.length - 1]} live messageId="message-a" />);
    const widget = await screen.findByTestId("galen-native-ui");
    expect(within(widget).getByRole("checkbox", { name: "Run tests" })).toBeTruthy();
  });

  it("leaves a completed malformed or unterminated response readable as code", () => {
    const { rerender, container } = render(<ChatMarkdown text={"Useful text.\n\n" + open} live={false} />);
    expect(screen.getByText("Useful text.")).toBeTruthy();
    expect(screen.queryByTestId("galen-native-ui")).toBeNull();
    expect(container.textContent).toContain("Run tests");
    rerender(<ChatMarkdown text={"Useful text.\n\n```galen-ui\n{invalid\n```"} live={false} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container.textContent).toContain("{invalid");
  });

  it("does not expose quoted controls before their closing marker", async () => {
    const quoted = open.split("\n").map(line => "> " + line).join("\n");
    const { rerender } = render(<ChatMarkdown text={quoted} live messageId="quoted" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    rerender(<ChatMarkdown text={quoted + "\n> ```"} live messageId="quoted" />);
    expect(await screen.findByRole("checkbox", { name: "Run tests" })).toBeTruthy();
  });

  it("restores a control for its own message only", async () => {
    const view = render(<ChatMarkdown text={closed} live={false} messageId="first" />);
    const checkbox = await screen.findByRole("checkbox", { name: "Run tests" }) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    view.unmount();
    const second = render(<ChatMarkdown text={closed} live={false} messageId="second" />);
    expect((await screen.findByRole("checkbox", { name: "Run tests" }) as HTMLInputElement).checked).toBe(false);
    second.unmount();
    render(<ChatMarkdown text={closed} live={false} messageId="first" />);
    expect((await screen.findByRole("checkbox", { name: "Run tests" }) as HTMLInputElement).checked).toBe(true);
  });
});
