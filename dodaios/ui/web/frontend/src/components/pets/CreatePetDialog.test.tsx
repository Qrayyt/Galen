import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatePetDialog, fieldForDetail } from "@/components/pets/CreatePetDialog";

function png(name = "sheet.png", bytes = 64): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

function renderDialog(onCreated = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CreatePetDialog open onOpenChange={vi.fn()} onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return onCreated;
}

function fill(name: string, file: File) {
  fireEvent.change(screen.getByTestId("create-pet-name"), { target: { value: name } });
  fireEvent.change(screen.getByTestId("create-pet-sheet"), { target: { files: [file] } });
}

beforeEach(() => {
  // jsdom has no object URLs; the preview only needs a string.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CreatePetDialog", () => {
  it("lists the sheet rows in state order", () => {
    renderDialog();
    const rows = screen.getByTestId("create-pet-rows").textContent ?? "";
    expect(rows.indexOf("Idle")).toBeLessThan(rows.indexOf("Listening"));
    expect(rows.indexOf("Error")).toBeLessThan(rows.indexOf("Sleeping"));
  });

  it("offers the empty template sheet as a download", () => {
    renderDialog();
    const link = screen.getByTestId("create-pet-template");
    expect(link.getAttribute("href")).toBe("/api/pets/template.png");
    expect(link.hasAttribute("download")).toBe(true);
    expect(link.textContent).toBe("Download template");
  });

  it("saves the original PNG through the desktop Downloads API", async () => {
    const bytes = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const fetchSpy = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === "/api/downloads/capabilities") return { ok: true, json: async () => ({ native_file_actions: true }) };
      if (url === "/api/pets/template.png") return { ok: true, blob: async () => bytes };
      if (url === "/api/downloads/save") return { ok: true, json: async () => ({ saved_path: "C:/Users/test/Downloads/pet-template.png" }) };
      throw new Error("Unexpected request: " + url);
    });
    vi.stubGlobal("fetch", fetchSpy);
    const browserClick = vi.spyOn(HTMLAnchorElement.prototype, "click");
    renderDialog();
    fireEvent.click(screen.getByTestId("create-pet-template"));
    await waitFor(() => expect(screen.getByTestId("create-pet-template").getAttribute("aria-busy")).toBe("false"));
    const save = fetchSpy.mock.calls.find(([url]) => url === "/api/downloads/save");
    expect(save?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(save?.[1]?.body))).toEqual({ filename: "pet-template.png", content_b64: "iVBORw==" });
    expect(browserClick).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the normal browser download when native file actions are unavailable", async () => {
    const bytes = new Blob(["png"], { type: "image/png" });
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === "/api/downloads/capabilities") return { ok: true, json: async () => ({ native_file_actions: false }) };
      if (url === "/api/pets/template.png") return { ok: true, blob: async () => bytes };
      throw new Error("Unexpected request: " + url);
    });
    vi.stubGlobal("fetch", fetchSpy);
    const browserClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderDialog();
    fireEvent.click(screen.getByTestId("create-pet-template"));
    await waitFor(() => expect(browserClick).toHaveBeenCalledTimes(1));
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(["/api/downloads/capabilities", "/api/pets/template.png"]);
  });

  it("shows an error instead of a blocked browser download when the native save fails", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === "/api/downloads/capabilities") return { ok: true, json: async () => ({ native_file_actions: true }) };
      if (url === "/api/pets/template.png") return { ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) };
      return { ok: false, status: 500 };
    });
    vi.stubGlobal("fetch", fetchSpy);
    const browserClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderDialog();
    fireEvent.click(screen.getByTestId("create-pet-template"));
    expect((await screen.findByRole("alert")).textContent).toBe("Download failed");
    expect(browserClick).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a PNG before uploading anything", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderDialog();

    fireEvent.change(screen.getByTestId("create-pet-sheet"), {
      target: { files: [new File(["x"], "sheet.gif", { type: "image/gif" })] },
    });

    expect(screen.getByRole("alert").textContent).toBe("Choose a PNG image.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a sheet over 2 MB", () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("create-pet-sheet"), {
      target: { files: [png("big.png", 2 * 1024 * 1024 + 1)] },
    });
    expect(screen.getByRole("alert").textContent).toBe("This image is larger than 2 MB.");
  });

  it("asks for a name before uploading", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderDialog();
    fireEvent.change(screen.getByTestId("create-pet-sheet"), { target: { files: [png()] } });
    fireEvent.click(screen.getByTestId("create-pet-submit"));
    expect(screen.getByRole("alert").textContent).toBe("Give your pet a name.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uploads the form and hands the new pet back", async () => {
    const created = {
      id: "u0123456789abcdef",
      name: "Pixel",
      description: "",
      builtin: false,
      frame_size: 32,
      animations: {},
      sheet_url: "/api/pets/u0123456789abcdef/sheet.png",
    };
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 201, json: async () => created }));
    vi.stubGlobal("fetch", fetchSpy);
    const onCreated = renderDialog();

    fill("Pixel", png());
    fireEvent.click(screen.getByTestId("create-pet-frame-32"));
    fireEvent.click(screen.getByTestId("create-pet-submit"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/pets");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("name")).toBe("Pixel");
    expect(form.get("frame_size")).toBe("32");
    expect(form.get("sheet")).toBeInstanceOf(File);
    expect(form.get("manifest")).toBeNull();
  });

  it("shows the server's refusal at the field it names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ detail: "The sheet is 600 × 600 pixels; the limit is 512 × 512." }),
      })),
    );
    renderDialog();

    fill("Pixel", png());
    fireEvent.click(screen.getByTestId("create-pet-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("the limit is 512");
    expect(alert.id).toContain("sheet");
  });
});

describe("fieldForDetail", () => {
  it("routes a refusal to the part it is about", () => {
    expect(fieldForDetail("manifest: idle is required")).toBe("manifest");
    expect(fieldForDetail("description is longer than 140 characters")).toBe("description");
    expect(fieldForDetail("name must be 1-40 characters")).toBe("name");
    expect(fieldForDetail("not a PNG")).toBe("sheet");
  });
});
