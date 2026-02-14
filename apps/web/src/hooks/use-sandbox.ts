import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { useAction } from "convex/react";
import { toast } from "sonner";
import type { Terminal as XtermTerminal } from "xterm";
import type {
  ExplorerEntry,
  ExplorerState,
  FileInfo,
  PtyResizeInput,
  TerminalSession,
} from "@just-use-convex/agent/src/tools/sandbox/types";

export type { ExplorerEntry, ExplorerState, TerminalSession };

const TERMINAL_BACKGROUND = "#0b0f19";

type AgentCaller = {
  call: (
    method: string,
    args?: unknown[],
    options?: {
      onChunk?: (chunk: unknown) => void;
      onDone?: (finalChunk: unknown) => void;
      onError?: (error: string) => void;
    }
  ) => Promise<unknown>;
};

type TerminalWriteState = {
  inputBuffer: string;
  optimisticBuffer: string;
  inFlight: boolean;
  errored: boolean;
};

export function useChatSandbox(chatId: Id<"chats">, agent: AgentCaller | null) {
  const createChatSshAccess = useAction(api.sandboxes.nodeFunctions.createChatSshAccess);
  const createChatPreviewAccess = useAction(api.sandboxes.nodeFunctions.createChatPreviewAccess);

  const [isOpen, setIsOpen] = useState(false);
  const [sshSession, setSshSession] = useState<Awaited<ReturnType<typeof createChatSshAccess>> | null>(null);
  const [sshPending, setSshPending] = useState(false);
  const [explorer, setExplorer] = useState<ExplorerState | null>(null);
  const [preview, setPreview] = useState<{ port?: number; url?: string }>({});
  const [previewPending, setPreviewPending] = useState(false);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [terminalReloadKey, setTerminalReloadKey] = useState(0);

  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const writeState = useRef<TerminalWriteState>({
    inputBuffer: "",
    optimisticBuffer: "",
    inFlight: false,
    errored: false,
  });

  // Reset all state when chat changes
  useEffect(() => {
    setIsOpen(false);
    setSshSession(null);
    setExplorer(null);
    setPreview({});
    setTerminalSessions([]);
    setActiveTerminalId(null);
    setTerminalReloadKey(0);
  }, [chatId]);

  const createSshAccess = useCallback(
    async (expiresInMinutes?: number) => {
      setSshPending(true);
      try {
        const session = await createChatSshAccess({ chatId, expiresInMinutes });
        setSshSession(session);
        return session;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create SSH access");
        return null;
      } finally {
        setSshPending(false);
      }
    },
    [chatId, createChatSshAccess]
  );

  const createPreviewAccess = useCallback(async () => {
    if (preview.port === undefined) return null;
    setPreviewPending(true);
    try {
      const result = await createChatPreviewAccess({ chatId, previewPort: preview.port });
      setPreview((prev) => ({ ...prev, url: result.preview.url }));
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create preview access");
      return null;
    } finally {
      setPreviewPending(false);
    }
  }, [chatId, createChatPreviewAccess, preview.port]);

  const openInEditor = useCallback(
    async (editor: "vscode" | "cursor") => {
      const isExpired = sshSession ? Date.now() >= new Date(sshSession.expiresAt).getTime() : false;
      const session = !sshSession || isExpired ? await createSshAccess() : sshSession;
      if (!session?.token) return;

      const host = session.sshCommand ? parseSshHost(session.sshCommand) : "ssh.app.daytona.io";
      const scheme = editor === "vscode" ? "vscode" : "cursor";
      window.open(`${scheme}://vscode-remote/ssh-remote+${session.token}@${host}/home/daytona/workspace`, "_blank");
    },
    [createSshAccess, sshSession]
  );

  const refreshExplorer = useCallback(async (path?: string) => {
    if (!agent) return;
    try {
      const resolvedPath = path ?? explorer?.path ?? ".";
      const entries = (await agent.call("listFiles", [{ path: resolvedPath }])) as FileInfo[];
      const basePath = resolvedPath === "." || resolvedPath === "" ? "" : resolvedPath.replace(/\/$/, "");
      setExplorer({
        path: basePath || ".",
        entries: entries.map((e) => ({
          name: e.name,
          path: basePath ? `${basePath}/${e.name}` : e.name,
          isDir: e.isDir,
          size: e.size,
          modifiedAt: new Date(e.modTime).getTime(),
        })),
      });
    } catch {
      // sandbox may not be ready yet
    }
  }, [agent, explorer?.path]);

  const downloadFile = useCallback(async (path: string, name: string) => {
    if (!agent) return;
    try {
      const result = await agent.call("downloadFile", [{ path }]) as { base64: string };
      triggerDownload(atob(result.base64), name);
    } catch {
      toast.error("Failed to download file");
    }
  }, [agent]);

  const downloadFolder = useCallback(async (path: string, name: string) => {
    if (!agent) return;
    try {
      const result = await agent.call("downloadFolder", [{ path }]) as { base64: string };
      triggerDownload(atob(result.base64), `${name}.tar.gz`, "application/gzip");
    } catch {
      toast.error("Failed to download folder");
    }
  }, [agent]);

  const deleteEntry = useCallback(async (path: string) => {
    if (!agent) return;
    try {
      await agent.call("deleteEntry", [{ path }]);
      if (explorer) await refreshExplorer(explorer.path);
      toast.success("Deleted successfully");
    } catch {
      toast.error("Failed to delete");
    }
  }, [agent, explorer, refreshExplorer]);

  const refreshTerminalSessions = useCallback(async () => {
    if (!agent) return;
    try {
      const result = await agent.call("listPtyTerminalSessions") as { sessions?: TerminalSession[] };
      setTerminalSessions(result.sessions ?? []);
    } catch {
      // sandbox may not be ready yet
    }
  }, [agent]);

  const closeTerminalSession = useCallback(async (terminalId: string) => {
    if (!agent) return;
    try {
      await agent.call("closePtyTerminal", [{ terminalId }]);
      const result = await agent.call("listPtyTerminalSessions") as { sessions?: TerminalSession[] };
      const sessions = result.sessions ?? [];
      setTerminalSessions(sessions);

      if (activeTerminalId === terminalId) {
        setActiveTerminalId(sessions[0]?.id ?? crypto.randomUUID());
        setTerminalReloadKey((k) => k + 1);
      }
    } catch {
      toast.error("Failed to close terminal session");
    }
  }, [agent, activeTerminalId]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Auto-create terminal session ID when opening
  useEffect(() => {
    if (isOpen && !activeTerminalId) {
      setActiveTerminalId(crypto.randomUUID());
    }
  }, [isOpen, activeTerminalId]);

  // Auto-refresh explorer on open
  useEffect(() => {
    if (isOpen && agent && !explorer) {
      void refreshExplorer();
    }
  }, [isOpen, agent, explorer, refreshExplorer]);

  // Auto-refresh terminal sessions on open
  useEffect(() => {
    if (isOpen && agent) {
      void refreshTerminalSessions();
    }
  }, [isOpen, agent, refreshTerminalSessions, terminalReloadKey]);

  // Terminal setup effect
  useEffect(() => {
    if (!agent || !terminalContainerRef.current || !activeTerminalId) return;

    let cancelled = false;
    let writeTimer: ReturnType<typeof setInterval> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let dispose: (() => void) | null = null;

    const setup = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (cancelled || !terminalContainerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        scrollback: 20000,
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        theme: { background: TERMINAL_BACKGROUND, foreground: "#e5e7eb", cursor: "#f9fafb" },
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalContainerRef.current);
      fitAddon.fit();
      term.focus();
      term.writeln("Connecting to sandbox shell through agent proxy...");

      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;
        if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "v") {
          event.preventDefault();
          navigator.clipboard.readText().then((text) => term.paste(text)).catch(() => undefined);
          return false;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "c" && term.hasSelection()) {
          event.preventDefault();
          void navigator.clipboard.writeText(term.getSelection()).catch(() => undefined);
          return false;
        }
        return true;
      });

      terminalRef.current = term;
      terminalIdRef.current = activeTerminalId;
      dispose = () => term.dispose();

      const openResult = await agent
        .call("openPtyTerminal", [{ terminalId: activeTerminalId, cols: term.cols, rows: term.rows }])
        .catch(() => null);

      if (!openResult || cancelled || !terminalContainerRef.current) {
        if (openResult === null && !cancelled) term.writeln("\r\nFailed to open PTY terminal session.");
        if (cancelled && activeTerminalId) {
          void agent.call("closePtyTerminal", [{ terminalId: activeTerminalId }]).catch(() => undefined);
        }
        return;
      }

      void agent.call("streamPtyTerminal", [{ terminalId: activeTerminalId }], {
        onChunk: (chunk) => {
          if (cancelled || typeof chunk !== "string") return;
          const toWrite = consumeOptimisticEcho(chunk, writeState);
          if (toWrite) term.write(toWrite);
        },
        onDone: (finalChunk) => {
          if (cancelled) return;
          const result = finalChunk as { closed?: boolean; closeReason?: string | null };
          if (result?.closed) {
            term.writeln(`\r\n[session closed${result.closeReason ? `: ${result.closeReason}` : ""}]`);
          }
          void refreshTerminalSessions();
        },
        onError: () => {
          if (!cancelled) term.writeln("\r\n[terminal stream error]");
        },
      }).catch(() => {
        if (!cancelled) term.writeln("\r\n[terminal stream error]");
      });

      writeState.current = { inputBuffer: "", optimisticBuffer: "", inFlight: false, errored: false };
      void refreshTerminalSessions();

      term.onData((data: string) => {
        writeState.current.inputBuffer += data;
      });

      writeTimer = setInterval(() => {
        const ws = writeState.current;
        if (!ws.inputBuffer || !terminalIdRef.current || ws.inFlight) return;

        const pending = ws.inputBuffer;
        ws.inFlight = true;
        ws.inputBuffer = "";
        ws.optimisticBuffer += pending;

        void agent.call("writePtyTerminal", [{ terminalId: terminalIdRef.current, data: pending }])
          .then(() => { ws.errored = false; })
          .catch(() => {
            if (!ws.errored) {
              term.writeln("\r\n[input unavailable]");
              ws.errored = true;
            }
            ws.inputBuffer = pending + ws.inputBuffer;
          })
          .finally(() => { ws.inFlight = false; });
      }, 25);

      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (!terminalIdRef.current) return;
        void agent.call("resizePtyTerminal", [{
          terminalId: terminalIdRef.current,
          cols: term.cols,
          rows: term.rows,
        } satisfies PtyResizeInput]).catch(() => undefined);
      });
      resizeObserver.observe(terminalContainerRef.current);
    };

    void setup().catch(() => toast.error("Failed to initialize terminal"));

    return () => {
      cancelled = true;
      if (writeTimer) clearInterval(writeTimer);
      resizeObserver?.disconnect();
      terminalIdRef.current = null;
      writeState.current = { inputBuffer: "", optimisticBuffer: "", inFlight: false, errored: false };
      terminalRef.current = null;
      dispose?.();
    };
  }, [agent, terminalReloadKey, isOpen, activeTerminalId, refreshTerminalSessions]);

  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    toggle,
    sshSession,
    explorer,
    refreshExplorer,
    navigateExplorer: refreshExplorer,
    downloadFile,
    downloadFolder,
    deleteEntry,
    previewPort: preview.port,
    previewUrl: preview.url,
    setPreviewPort: useCallback((port: number | undefined) => setPreview((p) => ({ ...p, port })), []),
    createPreviewAccess,
    openInEditor,
    reconnectSsh: createSshAccess,
    reconnectTerminal: useCallback(() => setTerminalReloadKey((k) => k + 1), []),
    switchTerminalSession: useCallback((id: string) => {
      setActiveTerminalId(id);
      setTerminalReloadKey((k) => k + 1);
    }, []),
    createTerminalSession: useCallback(() => {
      setActiveTerminalId(crypto.randomUUID());
      setTerminalReloadKey((k) => k + 1);
    }, []),
    closeTerminalSession,
    refreshTerminalSessions,
    terminalSessions,
    activeTerminalId,
    focusTerminal: useCallback(() => terminalRef.current?.focus(), []),
    terminalContainerRef,
    terminalBackground: TERMINAL_BACKGROUND,
    isConnectingSsh: sshPending,
    isConnectingPreview: previewPending,
  };
}

export type ChatSandboxReturn = ReturnType<typeof useChatSandbox>;

// --- Helpers ---

function triggerDownload(decoded: string, filename: string, mime?: string) {
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], mime ? { type: mime } : undefined);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseSshHost(sshCommand: string): string {
  return sshCommand.match(/@([^\s]+)/)?.[1] ?? "ssh.app.daytona.io";
}

function consumeOptimisticEcho(chunk: string, ws: { current: TerminalWriteState }) {
  let pending = ws.current.optimisticBuffer;
  if (!pending) return chunk;

  let cursor = 0;
  while (cursor < chunk.length && pending.length > 0) {
    const char = chunk[cursor];
    if (char === "\r" || char === "\n") { cursor++; continue; }

    // Skip ANSI escape sequences
    if (char === "\u001b" && chunk[cursor + 1] === "[") {
      let i = cursor + 2;
      while (i < chunk.length) {
        const code = chunk.charCodeAt(i);
        if (code >= 64 && code <= 126) { cursor = i + 1; break; }
        i++;
      }
      if (i >= chunk.length) break;
      continue;
    }

    if (chunk[cursor] === pending[0]) {
      cursor++;
      pending = pending.slice(1);
      continue;
    }

    ws.current.optimisticBuffer = pending;
    return chunk.slice(cursor);
  }

  ws.current.optimisticBuffer = pending;
  return pending.length === 0 ? chunk.slice(cursor) : "";
}
