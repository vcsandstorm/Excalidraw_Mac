// Dev-only stand-ins for the native commands so `npm run dev` works in a
// plain browser. Never included in the production bundle.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

const appData = new Map();

mockWindows("main");
mockIPC(
  (cmd, args) => {
    switch (cmd) {
      case "load_app_data":
        return appData.get(args.name) ?? null;
      case "save_app_data":
        appData.set(args.name, args.contents);
        return null;
      case "take_pending_files":
        return [];
      default:
        console.debug("[mock ipc]", cmd, args);
        return null;
    }
  },
  { shouldMockEvents: true },
);
