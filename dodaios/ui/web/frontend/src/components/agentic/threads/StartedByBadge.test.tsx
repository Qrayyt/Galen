import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEventStore } from "@/store/events";
import { StartedByBadge } from "./StartedByBadge";

afterEach(cleanup);

describe("the started-by mark on a thread's logo", () => {
  it("names Galen by the assistant's own name", () => {
    useEventStore.setState({ assistantName: "Nova" });
    render(<StartedByBadge startedBy="jarvis" testId="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.getAttribute("aria-label")).toBe("Started by Nova");
    expect(badge.getAttribute("title")).toBe("Started by Nova");
    expect(badge.querySelector("path")?.getAttribute("d")).toBeTruthy();
  });

  it("says another Galen agent opened it when the lead did not", () => {
    render(<StartedByBadge startedBy="scout" testId="badge" />);
    expect(screen.getByTestId("badge").getAttribute("aria-label")).toBe("Started by a Galen agent");
  });
});
