import { useCallback, useEffect, useRef, useState } from "react";
import { native } from "./native";
import type { UpdateInfo, UpdateProgress } from "../types";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useAppUpdater() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [updating, setUpdating] = useState(false);
  const checking = useRef(false);

  const checkNow = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      setUpdate(await native.checkUpdate());
    } catch (error) {
      setUpdate((current) => ({
        available: false,
        currentVersion: current?.currentVersion ?? "—",
        error: errorMessage(error),
      }));
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void checkNow();
    const timer = window.setInterval(() => void checkNow(), CHECK_INTERVAL_MS);
    const onFocus = () => void checkNow();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkNow]);

  const installUpdate = useCallback(async () => {
    if (!update?.available || !update.tag || updating) return;
    setUpdating(true);
    setProgress({ status: "Подготавливаю обновление", downloaded: 0, total: update.assetSize ?? 0, percent: 0, done: false });
    try {
      const path = await native.downloadUpdate(update.tag, setProgress);
      setProgress((current) => ({
        status: "Устанавливаю обновление",
        downloaded: current?.downloaded ?? update.assetSize ?? 0,
        total: current?.total ?? update.assetSize ?? 0,
        percent: 100,
        done: false,
      }));
      await native.restartIntoUpdate(path);
    } catch (error) {
      setProgress((current) => ({
        status: "Не удалось обновить",
        downloaded: current?.downloaded ?? 0,
        total: current?.total ?? update.assetSize ?? 0,
        percent: current?.percent ?? 0,
        done: true,
        error: errorMessage(error),
      }));
      setUpdating(false);
    }
  }, [update, updating]);

  return { update, progress, updating, checkNow, installUpdate };
}
