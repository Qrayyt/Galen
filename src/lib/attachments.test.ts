import { describe, expect, it } from "vitest";
import { attachmentPrompt, imagePayloads } from "./attachments";
import type { Attachment } from "../types";

describe("attachment payloads", () => {
  it("wraps extracted document text with a stable file boundary", () => {
    const attachment: Attachment = {
      id: "doc", name: "brief.pdf", mime: "application/pdf", size: 42, kind: "pdf", text: "Главный вывод",
    };
    expect(attachmentPrompt([attachment])).toContain('<attachment name="brief.pdf">\nГлавный вывод');
  });

  it("passes raw base64 image payloads to Ollama", () => {
    const attachment: Attachment = {
      id: "image", name: "screen.png", mime: "image/png", size: 42, kind: "image",
      dataUrl: "data:image/png;base64,YWJj",
    };
    expect(imagePayloads([attachment])).toEqual(["YWJj"]);
  });
});

