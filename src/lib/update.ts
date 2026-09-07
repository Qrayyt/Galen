import type { UpdateProgress } from "../types";

const STABLE_SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isStableVersion(version: string): boolean {
  return STABLE_SEMVER.test(version.trim());
}

export function updateProgress(
  downloaded: number,
  total: number,
  status: UpdateProgress["status"] = "downloading",
): UpdateProgress {
  return {
    downloaded,
    total,
    percent: status === "done" || status === "installing"
      ? 100
      : total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0,
    status,
  };
}
