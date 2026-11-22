import { useEffect } from "react";
import { useSegments } from "expo-router";
import { observeApi } from "@/lib/api/observe";
import { ACTIONS } from "./model";
import { loadTester, markTaskDone, useTester } from "./state";
import { flushInBackground, track } from "./track";

function onAction(name: string) {
  const action = ACTIONS[name];
  if (!action) return;
  track(action.event);
  if (action.task) markTaskDone(action.task);
}

/** Starts the test and records which screens are opened. Route patterns only, so no IDs go out. */
export function TesterHost() {
  const screen = useSegments().join("/");
  const { sharing } = useTester();
  useEffect(() => {
    void loadTester();
    observeApi(Object.keys(ACTIONS), onAction);
    return flushInBackground();
  }, []);
  useEffect(() => {
    if (sharing) track("screen_viewed", { screen: screen || "home" });
  }, [screen, sharing]);
  return null;
}
