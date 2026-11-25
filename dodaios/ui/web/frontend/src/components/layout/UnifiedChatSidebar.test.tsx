import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedChatSidebar } from "./UnifiedChatSidebar";

const mock = vi.hoisted(() => ({
  fetchSessions: vi.fn(), fetchProjects: vi.fn(), search: vi.fn(), searchVoice: vi.fn(), moveVoice: vi.fn(), invalidateConversations: vi.fn(),
  patchProject: vi.fn(), deleteProject: vi.fn(), createProject: vi.fn(),
  patchSession: vi.fn(), deleteSession: vi.fn(),
  newChat: vi.fn(), newThread: vi.fn(), setLayout: vi.fn(), setSection: vi.fn(),
  openChat: vi.fn(), openWork: vi.fn(), removeChat: vi.fn(), pushToast: vi.fn(),
}));
vi.mock("@/i18n", () => ({
  useT: () => (key: string) => key,
  useUiLanguage: () => "en",
  fill: (key: string) => key,
}));
vi.mock("@/components/home/chatRows", () => ({
  useChatRows: () => ({ rows: [], isActive: () => false, open: mock.openChat, remove: mock.removeChat }),
  chatRowLabel: (row: { title: string }) => ({ text: row.title, untitled: false }),
}));
vi.mock("@/lib/chatsApi", () => ({
  fetchChatProjects: mock.fetchProjects, createChatProject: mock.createProject, searchVoiceArchive: mock.searchVoice, moveVoiceConversation: mock.moveVoice, invalidateConversations: mock.invalidateConversations,
  patchChatProject: mock.patchProject, deleteChatProject: mock.deleteProject,
}));
vi.mock("@/lib/agentChatApi", () => ({
  fetchAgentChatSessions: mock.fetchSessions, searchAgentChatSessions: mock.search,
  patchAgentChatSession: mock.patchSession, deleteAgentChatSession: mock.deleteSession,
}));
vi.mock("@/components/agentic/threads/openCodingThread", () => ({ openCodingThread: mock.openWork }));
vi.mock("@/lib/newChat", () => ({ startNewTextChat: mock.newChat }));
vi.mock("@/store/events", () => ({
  useEventStore: (selector: (state: unknown) => unknown) => selector({
    activeSection: "chats", setActiveSection: mock.setSection, pushToast: mock.pushToast,
  }),
}));
vi.mock("@/store/ideThreads", () => ({
  useIdeThreadsStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ selection: { sessionId: null } }),
    { getState: () => ({ newThread: mock.newThread, setLayout: mock.setLayout, forgetThread: vi.fn() }) },
  ),
}));

const project = { project_id: "p1", name: "Galen", icon: "", collapsed: false };
const session = { session_id: "s1", surface: "jarvis", title: "Ordinary", preview: "latest", updated_ms: 1,
  message_count: 4, provider: "test", project_id: "p1" };

beforeEach(() => {
  vi.resetAllMocks();
  mock.fetchProjects.mockResolvedValue([project]);
  mock.fetchSessions.mockResolvedValue([session]);
  mock.search.mockResolvedValue([]);
  mock.searchVoice.mockResolvedValue([]);
  mock.moveVoice.mockResolvedValue(undefined);
  mock.patchProject.mockResolvedValue(project);
  mock.deleteProject.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("unified history and project controls", () => {
  it("starts either conversation mode inside the selected project", async () => {
    render(<UnifiedChatSidebar />);
    const group = await screen.findByRole("region", { name: "Galen" });
    fireEvent.click(within(group).getByRole("button", { name: "sidebar.new_chat" }));
    expect(mock.newChat).toHaveBeenCalledWith("p1");
    fireEvent.change(screen.getByRole("combobox", { name: "sidebar.mode_aria" }), { target: { value: "work" } });
    fireEvent.click(within(group).getByRole("button", { name: "sidebar.new_chat" }));
    expect(mock.newThread).toHaveBeenCalledWith("", "p1");
    expect(mock.setSection).toHaveBeenCalledWith("agentic-ide");
  });

  it("searches the message history of both modes, including older chats outside the initial list", async () => {
    mock.search.mockImplementation((_query: string, options: { surface: string }) => Promise.resolve(
      options.surface === "agent" ? [{ session_id: "older", title: "Old Work", snippet: "needle in an earlier message", updated_ms: 2, matches: 1 }] : [],
    ));
    render(<UnifiedChatSidebar />);
    fireEvent.change(screen.getByPlaceholderText("all_chats.search_placeholder"), { target: { value: "needle" } });
    const row = await screen.findByRole("button", { name: /Old Work/ });
    expect(mock.search).toHaveBeenCalledWith("needle", expect.objectContaining({ surface: "jarvis" }));
    expect(mock.search).toHaveBeenCalledWith("needle", expect.objectContaining({ surface: "agent" }));
    expect(screen.getByText("needle in an earlier message")).toBeTruthy();
    fireEvent.click(row);
    expect(mock.openWork).toHaveBeenCalledWith("older");
  });

  it("opens an older voice search result as a voice archive, not an agent chat", async () => {
    mock.searchVoice.mockResolvedValue([{ kind: "voice", id: "archived", title: "Voice call", preview: "Later matching phrase", updated_ms: 2, created_ms: 1, message_count: 4 }]);
    render(<UnifiedChatSidebar />);
    fireEvent.change(screen.getByPlaceholderText("all_chats.search_placeholder"), { target: { value: "matching" } });
    fireEvent.click(await screen.findByRole("button", { name: /Voice call/ }));
    expect(mock.searchVoice).toHaveBeenCalledWith("matching", expect.any(AbortSignal), 100);
    expect(mock.openChat).toHaveBeenCalledWith(expect.objectContaining({ kind: "voice", id: "archived" }));
    expect(mock.openWork).not.toHaveBeenCalled();
  });

  it("moves an archive into a project with explicit confirmation", async () => {
    mock.searchVoice.mockResolvedValue([{ kind: "voice", id: "archived", title: "Voice call", preview: "matching", updated_ms: 2, created_ms: 1, message_count: 4 }]);
    render(<UnifiedChatSidebar />);
    fireEvent.change(screen.getByPlaceholderText("all_chats.search_placeholder"), { target: { value: "matching" } });
    const row = (await screen.findByRole("button", { name: /Voice call/ })).closest("li")!;
    fireEvent.change(within(row).getByRole("combobox", { name: "ide_threads.projects" }), { target: { value: "p1" } });
    expect(mock.moveVoice).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "common.apply" }));
    await waitFor(() => expect(mock.moveVoice).toHaveBeenCalledWith("archived", "p1"));
    expect(within(await screen.findByRole("region", { name: "Galen" })).getByRole("button", { name: /Voice call/ })).toBeTruthy();
  });

  it("edits an icon and asks for deliberate confirmation before removing project metadata", async () => {
    render(<UnifiedChatSidebar />);
    const group = await screen.findByRole("region", { name: "Galen" });
    fireEvent.click(within(group).getByRole("button", { name: "common.edit" }));
    fireEvent.change(within(group).getByLabelText("Project icon (optional)"), { target: { value: "G" } });
    fireEvent.click(within(group).getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(mock.patchProject).toHaveBeenCalledWith("p1", { name: "Galen", icon: "G", instructions: "", context_documents: {} }));
    const remove = await within(group).findByRole("button", { name: "ide_threads.remove_project" });
    fireEvent.click(remove);
    expect(mock.deleteProject).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole("button", { name: "common.cancel" }));
    expect(mock.deleteProject).not.toHaveBeenCalled();
    fireEvent.click(remove);
    fireEvent.click(within(group).getByRole("button", { name: "common.delete" }));
    await waitFor(() => expect(mock.deleteProject).toHaveBeenCalledWith("p1"));
  });
});
