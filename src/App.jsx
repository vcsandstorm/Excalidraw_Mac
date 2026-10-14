import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
  exportToSvg,
  hashElementsVersion,
  loadFromBlob,
  loadLibraryFromBlob,
  serializeAsJSON,
  serializeLibraryAsJSON,
} from "@excalidraw/excalidraw";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { icons } from "./icons.jsx";

const SESSION_FILE = "session.json";
const LIBRARY_FILE = "library.json";
const DRAWING_FILTER = { name: "Excalidraw Drawing", extensions: ["excalidraw"] };

const sceneHash = (elements) =>
  hashElementsVersion(elements.filter((el) => !el.isDeleted));

const basename = (path) => path.split("/").pop();
const stem = (path) => basename(path).replace(/\.[^.]+$/, "");

// Send external links to the default browser instead of the webview.
const isExternal = (url) => /^(https?:|mailto:)/i.test(url);
window.open = (url) => {
  if (url && isExternal(String(url))) openUrl(String(url));
  return null;
};
document.addEventListener(
  "click",
  (event) => {
    const anchor = event.target.closest?.("a[href]");
    if (anchor && isExternal(anchor.href)) {
      event.preventDefault();
      openUrl(anchor.href);
    }
  },
  true,
);

async function loadInitialData() {
  const [sessionText, libraryText] = await Promise.all([
    invoke("load_app_data", { name: SESSION_FILE }),
    invoke("load_app_data", { name: LIBRARY_FILE }),
  ]);

  let libraryItems = [];
  if (libraryText) {
    try {
      libraryItems = await loadLibraryFromBlob(
        new Blob([libraryText], { type: "application/json" }),
      );
    } catch (err) {
      console.error("Could not restore library", err);
    }
  }

  if (!sessionText) return { session: null, initialData: { libraryItems } };

  try {
    const session = JSON.parse(sessionText);
    const scene = await loadFromBlob(
      new Blob([session.scene], { type: "application/json" }),
      null,
      null,
    );
    return {
      session,
      initialData: {
        elements: scene.elements,
        files: scene.files,
        libraryItems,
        appState: { ...scene.appState, ...session.view },
      },
    };
  } catch (err) {
    console.error("Could not restore last session", err);
    return { session: null, initialData: { libraryItems } };
  }
}

export default function App() {
  const [api, setApi] = useState(null);
  const [filePath, setFilePath] = useState(null);
  const [dirty, setDirty] = useState(false);

  const filePathRef = useRef(null);
  const savedHashRef = useRef(null);
  const restoredDirtyRef = useRef(false);
  const sessionTimerRef = useRef(null);
  const initialRef = useRef(null);
  if (!initialRef.current) {
    initialRef.current = loadInitialData().then(({ session, initialData }) => {
      if (session) {
        filePathRef.current = session.filePath ?? null;
        restoredDirtyRef.current = !!session.dirty;
        setFilePath(filePathRef.current);
      }
      return initialData;
    });
  }

  // --- document state -----------------------------------------------------

  const markSaved = useCallback((path, elements) => {
    filePathRef.current = path;
    savedHashRef.current = sceneHash(elements);
    setFilePath(path);
    setDirty(false);
  }, []);

  useEffect(() => {
    const name = filePath ? basename(filePath) : "Untitled";
    getCurrentWindow()
      .setTitle(`${name}${dirty ? " — Edited" : ""}`)
      .catch(() => {});
  }, [filePath, dirty]);

  const writeSession = useCallback(async () => {
    clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = null;
    if (!api) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const appState = api.getAppState();
    const session = {
      filePath: filePathRef.current,
      dirty: sceneHash(elements) !== savedHashRef.current,
      view: {
        theme: appState.theme,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      },
      scene: serializeAsJSON(elements, appState, api.getFiles(), "local"),
    };
    await invoke("save_app_data", {
      name: SESSION_FILE,
      contents: JSON.stringify(session),
    }).catch((err) => console.error("Session save failed", err));
  }, [api]);

  const onChange = useCallback(
    (elements, appState) => {
      if (appState.isLoading) return;
      const hash = sceneHash(elements);
      if (savedHashRef.current === null) {
        // First change after the initial scene loaded: treat it as the baseline.
        savedHashRef.current = restoredDirtyRef.current ? NaN : hash;
      }
      setDirty(hash !== savedHashRef.current);
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = setTimeout(writeSession, 600);
    },
    [writeSession],
  );

  const onLibraryChange = useCallback((items) => {
    invoke("save_app_data", {
      name: LIBRARY_FILE,
      contents: serializeLibraryAsJSON(items),
    }).catch((err) => console.error("Library save failed", err));
  }, []);

  // --- file actions --------------------------------------------------------

  const confirmDiscard = useCallback(async () => {
    if (!api) return false;
    if (sceneHash(api.getSceneElementsIncludingDeleted()) === savedHashRef.current) {
      return true;
    }
    return ask("Your current drawing has unsaved changes. Discard them?", {
      title: "Unsaved Changes",
      kind: "warning",
      okLabel: "Discard Changes",
      cancelLabel: "Cancel",
    });
  }, [api]);

  const openPath = useCallback(
    async (path) => {
      if (!api) return;
      try {
        const text = await invoke("read_text_file", { path });
        const blob = new Blob([text], { type: "application/json" });

        if (JSON.parse(text)?.type === "excalidrawlib") {
          const libraryItems = await loadLibraryFromBlob(blob);
          await api.updateLibrary({ libraryItems, merge: true, openLibraryMenu: true });
          return;
        }

        if (!(await confirmDiscard())) return;
        const scene = await loadFromBlob(blob, api.getAppState(), null);
        api.addFiles(Object.values(scene.files ?? {}));
        api.updateScene({
          elements: scene.elements,
          appState: { ...scene.appState, theme: api.getAppState().theme },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        api.history.clear();
        api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9 });
        markSaved(path, scene.elements);
      } catch (err) {
        await message(`Couldn't open “${basename(path)}”.\n\n${err}`, {
          title: "Open Failed",
          kind: "error",
        });
      }
    },
    [api, confirmDiscard, markSaved],
  );

  const openFile = useCallback(async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Excalidraw", extensions: ["excalidraw", "excalidrawlib", "json"] },
      ],
    });
    if (path) await openPath(path);
  }, [openPath]);

  const writeDrawing = useCallback(
    async (path) => {
      const elements = api.getSceneElementsIncludingDeleted();
      const contents = serializeAsJSON(elements, api.getAppState(), api.getFiles(), "local");
      try {
        await invoke("write_text_file", { path, contents });
        markSaved(path, elements);
        writeSession();
      } catch (err) {
        await message(`Couldn't save “${basename(path)}”.\n\n${err}`, {
          title: "Save Failed",
          kind: "error",
        });
      }
    },
    [api, markSaved, writeSession],
  );

  const saveFileAs = useCallback(async () => {
    if (!api) return;
    const path = await save({
      defaultPath: filePathRef.current ?? "Untitled.excalidraw",
      filters: [DRAWING_FILTER],
    });
    if (path) await writeDrawing(path);
  }, [api, writeDrawing]);

  const saveFile = useCallback(async () => {
    if (!api) return;
    if (filePathRef.current) await writeDrawing(filePathRef.current);
    else await saveFileAs();
  }, [api, writeDrawing, saveFileAs]);

  const newDrawing = useCallback(async () => {
    if (!api || !(await confirmDiscard())) return;
    api.resetScene();
    api.history.clear();
    markSaved(null, []);
    writeSession();
  }, [api, confirmDiscard, markSaved, writeSession]);

  const exportImage = useCallback(
    async (format) => {
      if (!api) return;
      const elements = api.getSceneElements();
      if (!elements.length) {
        await message("There's nothing on the canvas to export.", { title: "Export" });
        return;
      }
      const base = filePathRef.current ? stem(filePathRef.current) : "Untitled";
      const path = await save({
        defaultPath: `${base}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (!path) return;

      const appState = { ...api.getAppState(), exportBackground: true, exportEmbedScene: true };
      const files = api.getFiles();
      try {
        if (format === "svg") {
          const svg = await exportToSvg({ elements, appState, files, exportPadding: 16 });
          await invoke("write_text_file", { path, contents: svg.outerHTML });
        } else {
          const blob = await exportToBlob({
            elements,
            appState,
            files,
            mimeType: "image/png",
            exportPadding: 16,
            getDimensions: (w, h) => ({ width: w * 2, height: h * 2, scale: 2 }),
          });
          const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
          await invoke("write_binary_file", { path, contents: bytes });
        }
      } catch (err) {
        await message(`Export failed.\n\n${err}`, { title: "Export Failed", kind: "error" });
      }
    },
    [api],
  );

  // --- wiring --------------------------------------------------------------

  // Keyboard shortcuts (capture phase so they win over Excalidraw's own).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!event.metaKey || event.altKey || event.ctrlKey) return;
      const key = event.key.toLowerCase();
      const run =
        key === "s" && event.shiftKey ? saveFileAs
        : key === "s" ? saveFile
        : key === "o" && !event.shiftKey ? openFile
        : key === "n" && !event.shiftKey ? newDrawing
        : key === "e" && event.shiftKey ? () => exportImage("png")
        : null;
      if (!run) return;
      event.preventDefault();
      event.stopPropagation();
      run();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [saveFile, saveFileAs, openFile, newDrawing, exportImage]);

  // Files opened from Finder (double-click, "Open With", drag onto Dock icon).
  useEffect(() => {
    if (!api) return;
    let unlisten;
    let cancelled = false;
    const drain = async () => {
      const paths = await invoke("take_pending_files");
      if (paths.length) await openPath(paths[paths.length - 1]);
    };
    initialRef.current.then(async () => {
      if (cancelled) return;
      unlisten = await listen("open-files", drain);
      drain();
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [api, openPath]);

  // Flush the autosave when the window closes or loses focus.
  useEffect(() => {
    if (!api) return;
    const onBlur = () => writeSession();
    window.addEventListener("blur", onBlur);
    const closing = getCurrentWindow().onCloseRequested(() => writeSession());
    return () => {
      window.removeEventListener("blur", onBlur);
      closing.then((unlisten) => unlisten());
    };
  }, [api, writeSession]);

  return (
    <Excalidraw
      excalidrawAPI={setApi}
      initialData={initialRef.current}
      onChange={onChange}
      onLibraryChange={onLibraryChange}
      UIOptions={{
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          saveAsImage: false,
          export: false,
          clearCanvas: false,
        },
      }}
    >
      <MainMenu>
        <MainMenu.Item icon={icons.file} onSelect={newDrawing} shortcut="⌘N">
          New Drawing
        </MainMenu.Item>
        <MainMenu.Item icon={icons.folder} onSelect={openFile} shortcut="⌘O">
          Open…
        </MainMenu.Item>
        <MainMenu.Item icon={icons.save} onSelect={saveFile} shortcut="⌘S">
          Save
        </MainMenu.Item>
        <MainMenu.Item icon={icons.saveAs} onSelect={saveFileAs} shortcut="⇧⌘S">
          Save As…
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.Item icon={icons.image} onSelect={() => exportImage("png")} shortcut="⇧⌘E">
          Export as PNG…
        </MainMenu.Item>
        <MainMenu.Item icon={icons.image} onSelect={() => exportImage("svg")}>
          Export as SVG…
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.CommandPalette />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.Help />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint />
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.HelpHint />
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Logo />
          <WelcomeScreen.Center.Heading>
            Everything stays on your Mac.
          </WelcomeScreen.Center.Heading>
          <WelcomeScreen.Center.Menu>
            <WelcomeScreen.Center.MenuItem icon={icons.folder} onSelect={openFile} shortcut="⌘O">
              Open a drawing
            </WelcomeScreen.Center.MenuItem>
            <WelcomeScreen.Center.MenuItemHelp />
          </WelcomeScreen.Center.Menu>
        </WelcomeScreen.Center>
      </WelcomeScreen>
    </Excalidraw>
  );
}
