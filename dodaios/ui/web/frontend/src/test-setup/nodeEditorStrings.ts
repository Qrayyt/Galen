/**
 * The node editors keep their words in a locale chunk that the editor host
 * loads before it draws an editor. Tests render editors on their own, so the
 * chunk is made resident before every test file.
 */
import { beforeAll, beforeEach } from "vitest";

import { loadLocaleChunk, useI18nStore } from "@/i18n";

beforeAll(async () => {
  await loadLocaleChunk("node_editors");
});

// Galen starts in Russian for people running the app for the first time. Most
// component tests assert the upstream English copy, so isolate each test from
// the persisted/default language and let locale-specific tests opt in again.
beforeEach(() => {
  useI18nStore.getState().setUi("en", { push: false });
});
