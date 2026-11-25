import { describe, expect, it } from "vitest";

// Keep stored/API identifiers intact but present the Galen Work mode consistently.
const dictionaries = import.meta.glob("../i18n/locales/**/*.json", { eager: true, import: "default" }) as Record<string, Record<string, unknown>>;
const keys: Record<string, string[]> = {
  main: ["sidebar.recent_activity_empty", "shortcut_overlay.workspace.ide_menu", "quick_switch.placeholder", "settings_view.app_zoom.note_terminal", "costs_view.chart_include_ide", "ide_hotkeys.menu.aria", "ide_threads.agent_link.open"],
  custom_cli: ["custom_cli.headless_command_hint"],
  computers: ["computers.ready_body", "computers.ready_body_windows", "computers.keep_body", "computers.wz_next_ide", "computers.wz_next_ide_body"],
  onboarding: ["first_run.tour.labels.ide", "first_run.tour.stops.ide"],
  self_build: ["self_build.detail.open_thread_title"],
  society: ["society.office.launch_body", "society.office.coding_empty", "society.office.open_ide", "society.office.mission_not_started"],
};
describe("Work mode secondary labels", () => {
  for (const locale of ["en", "de", "es", "pt", "ru", "zh"]) {
    it(`${locale} uses Work in mode-specific labels`, () => {
      for (const [group, paths] of Object.entries(keys)) {
        const file = `../i18n/locales/${group === "main" ? "" : group + "/"}${locale}.json`;
        const dictionary = dictionaries[file];
        expect(dictionary, file).toBeDefined();
        for (const key of paths) {
          const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dictionary);
          expect(typeof value, file + ":" + key).toBe("string");
          expect(value, file + ":" + key).toContain("Work");
          expect(value, file + ":" + key).not.toMatch(/\bIDE\b/);
        }
      }
    });
  }
});
