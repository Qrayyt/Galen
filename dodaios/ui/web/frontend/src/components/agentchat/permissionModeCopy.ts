import type { PermissionModeOption } from "@/lib/agentChatApi";

type Translate = (key: string) => string;

const LABEL_KEYS: Record<string, string> = {
  "Ask before edits": "ask_edits",
  "Ask before acting": "ask_actions",
  "Ask (auto-review)": "ask_review",
  Ask: "ask_actions",
  Auto: "auto",
  Plan: "plan",
  "Bypass permissions": "bypass",
  "Auto-accept edits": "accept_edits",
  "Full access": "full",
  "Skip permissions": "skip",
  "CLI's own policy": "cli_policy",
  "Harness policy": "harness_policy",
  Agent: "agent",
};

const DESCRIPTION_KEYS: Record<string, string> = {
  ask_edits: "ask_edits_hint",
  ask_actions: "ask_actions_hint",
  ask_review: "ask_review_hint",
  auto: "auto_hint",
  plan: "plan_hint",
  bypass: "bypass_hint",
  accept_edits: "accept_edits_hint",
  full: "full_hint",
  skip: "bypass_hint",
  cli_policy: "cli_policy_hint",
  harness_policy: "harness_policy_hint",
  agent: "full_hint",
};

/** Localize permission modes supplied by the backend catalog.

The catalog intentionally carries runner-native English because it is shared
by every client.  UI locale files own the visible copy, while the runner ids
remain unchanged and continue to drive exactly the same permission behavior.
*/
export function localizePermissionMode(
  mode: PermissionModeOption,
  t: Translate,
): PermissionModeOption {
  const key = LABEL_KEYS[mode.label];
  if (!key) return mode;
  const labelKey = `agent_chat.permission_mode_${key}`;
  const label = t(labelKey);
  // Small component tests and an older frontend paired with a newer catalog
  // may not have this locale section yet. In either case, keep the complete
  // backend copy instead of painting a raw translation key.
  if (label === labelKey) return mode;
  const descriptionKey = `agent_chat.permission_mode_${DESCRIPTION_KEYS[key]}`;
  const description = mode.description ? t(descriptionKey) : "";
  return {
    ...mode,
    label,
    description: description === descriptionKey ? mode.description : description,
  };
}
