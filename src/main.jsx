import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";

if (import.meta.env.DEV && !window.__TAURI_INTERNALS__) {
  await import("./devMocks.js");
}

const { default: App } = await import("./App.jsx");
createRoot(document.getElementById("root")).render(<App />);
