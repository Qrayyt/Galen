import { afterEach, describe, expect, test, vi } from "vitest";
import { createChatProject, fetchChatProjects, patchChatProject } from "./chatsApi";

const project = {
  id: "project-123", name: "Galen", icon: "", instructions: "", context_files: [],
  agent_id: null, collapsed: false, position: 0, created_at_ns: 1000000,
  updated_at_ns: 2000000, chat_count: 0,
};
const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("chat project API wire contract", () => {
  test("list, create and patch consistently decode the server id", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response([project]))
      .mockResolvedValueOnce(response(project))
      .mockResolvedValueOnce(response({ ...project, icon: "G" }));
    vi.stubGlobal("fetch", fetch);
    const [listed] = await fetchChatProjects();
    expect(listed).toMatchObject({ project_id: "project-123", created_ms: 1, updated_ms: 2 });
    expect(await createChatProject({ name: "Galen" })).toMatchObject({ project_id: listed.project_id });
    expect(await patchChatProject(listed.project_id, { icon: "G" })).toMatchObject({ project_id: listed.project_id, icon: "G" });
    expect(fetch.mock.calls[2][0]).toBe("/api/chats/projects/project-123");
  });

  test("does not silently render rows with an invalid identifier", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([{ ...project, id: "" }])));
    await expect(fetchChatProjects()).rejects.toThrow("project-response-invalid-id");
  });
});
