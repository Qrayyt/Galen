import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import ru from "@/i18n/locales/ru.json";
import { STATUS_LABEL_KEYS } from "./state";

describe("Galen HUD localization", () => {
  it("has real English and Russian labels for every HUD state", () => {
    for (const key of Object.values(STATUS_LABEL_KEYS)) {
      const label = key.split(".")[1] as keyof typeof en.voice_state;
      expect(en.voice_state[label]).toBeTruthy();
      expect(ru.voice_state[label]).toMatch(/[А-Яа-яЁё]/);
    }
  });
  it("uses the Galen mark on exported statistics", () => {
    expect(en.board_view.share.card.brand).toBe("GALEN");
    expect(ru.board_view.share.card.brand).toBe("GALEN");
  });
});
