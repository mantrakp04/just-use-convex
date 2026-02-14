import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useAction } from "convex/react";
import { toast } from "sonner";
import type { Terminal as XtermTerminal } from "xterm";
type ChatSshSession = FunctionReturnType<typeof api.sandboxes.nodeFunctions.createChatSshAccess>;
type XtermTerminalWriteData = Extract<Parameters<XtermTerminal["write"]>[0], string>;
type XtermTerminalInputData = Extract<Parameters<Parameters<XtermTerminal["onData"]>[0]>[0], string>;
type XtermTerminalResizeEvent = Parameters<Parameters<XtermTerminal["onResize"]>[0]>[0];

export type ExplorerEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
};

export type ExplorerState = {
  path: string;
  entries: ExplorerEntry[];
};

/** Wire format from listPtyTerminalSessions - matches Daytona PtySessionInfo */
export type TerminalSession = {
  id: string;
  active?: boolean;
  processId?: number;
  cwd?: string;
  cols?: number;
  rows?: number;
  createdAt?: string;
};

const TERMINAL_BACKGROUND = "#0b0f19";

export function useChatSandbox(
  chatId: Id<"chats">,
  agent: {
    call: (method: string, args?: unknown[]) => Promise<unknown>;
  } | null
) {
  const createChatSshAccess = useAction(api.sandboxes.nodeFunctions.createChatSshAccess);
  const createChatPreviewAccess = useAction(api.sandboxes.nodeFunctions.createChatPreviewAccess);
  const [isOpen, setIsOpen] = useState(false);
  const [sshSession, setSshSession] = useState<ChatSshSession | null>(null);
  const [explorer, setExplorer] = useState<ExplorerState | null>(null);
  const [previewPort, setPreviewPort] = useState<number | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [terminalReloadKey, setTerminalReloadKey] = useState(0);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const terminalCursorRef = useRef(0);
  const terminalInputBufferRef = useRef<XtermTerminalInputData>("");
  const terminalWriteInFlightRef = useRef(false);
  const terminalWriteErroredRef = useRef(false);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);

  const createSshMutation = useMutation({
    mutationFn: async ({
      chatId,
      expiresInMinutes,
    }: {
      chatId: Id<"chats">;
      expiresInMinutes?: number;
    }) => {
      return await createChatSshAccess({
        chatId,
        expiresInMinutes,
      });
    },
    onSuccess: (nextSession) => {
      setSshSession(nextSession);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create SSH access");
    },
  });

  const createPreviewMutation = useMutation({
    mutationFn: async ({
      chatId,
      previewPort,
    }: {
      chatId: Id<"chats">;
      previewPort: number;
    }) => {
      return await createChatPreviewAccess({
        chatId,
        previewPort,
      });
    },
    onSuccess: (nextPreview) => {
      setPreviewUrl(nextPreview.preview.url);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create preview access");
    },
  });

  const createSshAccess = useCallback(
    async (expiresInMinutes?: number) => {
      return await createSshMutation.mutateAsync({
        chatId,
        expiresInMinutes,
      });
    },
    [chatId, createSshMutation]
  );

  const createPreviewAccess = useCallback(async () => {
    if (previewPort === undefined) {
      return null;
    }

    const preview = await createPreviewMutation.mutateAsync({
      chatId,
      previewPort,
    });
    return preview;
  }, [chatId, createPreviewMutation, previewPort]);

  const openInEditor = useCallback(
    async (editor: "vscode" | "cursor") => {
      const isExpired = sshSession && Date.now() >= sshSession.ssh.expiresAt;
      const session = (!sshSession || isExpired) ? await createSshAccess() : sshSession;
      if (!session?.ssh) {
        return;
      }

      const { token, host } = session.ssh;
      const scheme = editor === "vscode" ? "vscode" : "cursor";
      const uri = `${scheme}://vscode-remote/ssh-remote+${token}@${host}/home/daytona/workspace`;

      if (typeof window !== "undefined") {
        window.open(uri, "_blank");
      }
    },
    [createSshAccess, sshSession]
  );

  const refreshExplorer = useCallback(async (path?: string) => {
    if (!agent) return;
    try {
      const resolvedPath = path ?? explorer?.path ?? ".";
      const result = await agent.call("listFiles", [{ path: resolvedPath }]) as ExplorerState;
      setExplorer(result);
    } catch {
      // ignore - sandbox may not be ready yet
    }
  }, [agent, explorer?.path]);

  const navigateExplorer = useCallback(async (path: string) => {
    await refreshExplorer(path);
  }, [refreshExplorer]);

  const downloadFile = useCallback(async (path: string, name: string) => {
    if (!agent) return;
    try {
      const result = await agent.call("downloadFile", [{ path }]) as {
        content: string;
        encoding: string;
        size: number;
      };
      const bytes = Uint8Array.from(atob(result.content), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download file");
    }
  }, [agent]);

  const downloadFolder = useCallback(async (path: string, name: string) => {
    if (!agent) return;
    try {
      const result = await agent.call("downloadFolder", [{ path }]) as {
        content: string;
        encoding: string;
        archiveType: string;
      };
      const bytes = Uint8Array.from(atob(result.content), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/gzip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.tar.gz`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download folder");
    }
  }, [agent]);

  const deleteEntry = useCallback(async (path: string) => {
    if (!agent) return;
    try {
      await agent.call("deleteEntry", [{ path }]);
      if (explorer) {
        await refreshExplorer(explorer.path);
      }
      toast.success("Deleted successfully");
    } catch {
      toast.error("Failed to delete");
    }
  }, [agent, explorer, refreshExplorer]);

  const reconnectSsh = useCallback(async () => {
    await createSshAccess();
  }, [createSshAccess]);
  const reconnectTerminal = useCallback(() => {
    setTerminalReloadKey((value) => value + 1);
  }, []);
  const switchTerminalSession = useCallback((terminalId: string) => {
    setActiveTerminalId(terminalId);
    setTerminalReloadKey((value) => value + 1);
  }, []);
  const createTerminalSession = useCallback(() => {
    const nextTerminalId = createTerminalSessionId();
    setActiveTerminalId(nextTerminalId);
    setTerminalReloadKey((value) => value + 1);
  }, []);
  const refreshTerminalSessions = useCallback(async () => {
    if (!agent) {
      return;
    }
    try {
      const result = await agent.call("listPtyTerminalSessions") as { sessions?: TerminalSession[] };
      const sessions = result.sessions ?? [];
      setTerminalSessions(sessions);
    } catch {
      // ignore - sandbox may not be ready yet
    }
  }, [agent]);
  const closeTerminalSession = useCallback(
    async (terminalId: string) => {
      if (!agent) {
        return;
      }
      try {
        await agent.call("closePtyTerminal", [{ terminalId }]);
        const result = await agent.call("listPtyTerminalSessions") as { sessions?: TerminalSession[] };
        const sessions = result.sessions ?? [];
        setTerminalSessions(sessions);

        if (activeTerminalId !== terminalId) {
          return;
        }

        const nextTerminalId = sessions[0]?.id ?? createTerminalSessionId();
        setActiveTerminalId(nextTerminalId);
        setTerminalReloadKey((value) => value + 1);
      } catch {
        toast.error("Failed to close terminal session");
      }
    },
    [agent, activeTerminalId]
  );
  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const open = useCallback(async () => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(async () => {
    if (isOpen) {
      close();
      return;
    }

    await open();
  }, [close, isOpen, open]);

  useEffect(() => {
    if (isOpen && !activeTerminalId) {
      setActiveTerminalId(createTerminalSessionId());
    }
  }, [isOpen, activeTerminalId]);

  useEffect(() => {
    if (!agent || !terminalContainerRef.current || !activeTerminalId) {
      return;
    }

    let isCancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let writeTimer: ReturnType<typeof setInterval> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let terminalDispose: (() => void) | null = null;

    const setupTerminal = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (isCancelled || !terminalContainerRef.current) {
        return;
      }

      const term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        scrollback: 20000,
        fontSize: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        theme: {
          background: TERMINAL_BACKGROUND,
          foreground: "#e5e7eb",
          cursor: "#f9fafb",
        },
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalContainerRef.current);
      fitAddon.fit();
      term.focus();
      term.writeln("Connecting to sandbox shell through agent proxy...");
      term.attachCustomKeyEventHandler((event) => {
        if (event.type === "keydown" && event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        return true;
      });
      terminalRef.current = term;

      terminalDispose = () => {
        term.dispose();
      };

      const openResponse = await agent.call("openPtyTerminal", [{
        terminalId: activeTerminalId,
        cols: term.cols,
        rows: term.rows,
      }]) as { terminalId?: string };
      if (isCancelled) {
        const terminalId = openResponse?.terminalId;
        if (terminalId) {
          void agent.call("closePtyTerminal", [{ terminalId }]).catch(() => undefined);
        }
        return;
      }

      const terminalId = openResponse?.terminalId;
      if (!terminalId) {
        term.writeln("\r\nFailed to open PTY terminal session.");
        return;
      }
      terminalIdRef.current = terminalId;
      terminalCursorRef.current = 0;
      terminalInputBufferRef.current = "";
      terminalWriteInFlightRef.current = false;
      terminalWriteErroredRef.current = false;
      void refreshTerminalSessions();

      term.onData((data: XtermTerminalInputData) => {
        terminalInputBufferRef.current += data;
      });

      writeTimer = setInterval(() => {
        const pendingInput = terminalInputBufferRef.current;
        if (!pendingInput || !terminalIdRef.current || terminalWriteInFlightRef.current) {
          return;
        }
        terminalWriteInFlightRef.current = true;
        terminalInputBufferRef.current = "";
        void agent.call("writePtyTerminal", [{
          terminalId: terminalIdRef.current,
          data: pendingInput,
        }]).then(() => {
          terminalWriteErroredRef.current = false;
        }).catch(() => {
          if (!terminalWriteErroredRef.current) {
            term.writeln("\r\n[input unavailable]");
            terminalWriteErroredRef.current = true;
          }
          terminalInputBufferRef.current = pendingInput + terminalInputBufferRef.current;
        }).finally(() => {
          terminalWriteInFlightRef.current = false;
        });
      }, 25);

      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (!terminalIdRef.current) {
          return;
        }
        void agent.call("resizePtyTerminal", [{
          terminalId: terminalIdRef.current,
          cols: term.cols,
          rows: term.rows,
        } satisfies XtermTerminalResizeEvent & { terminalId: string }]).catch(() => undefined);
      });
      resizeObserver.observe(terminalContainerRef.current);

      pollTimer = setInterval(() => {
        if (!terminalIdRef.current) {
          return;
        }

        void agent.call("readPtyTerminal", [{
          terminalId: terminalIdRef.current,
          offset: terminalCursorRef.current,
        }]).then((result) => {
          const response = result as {
            data?: XtermTerminalWriteData;
            offset?: number;
            closed?: boolean;
            closeReason?: string | null;
          };
          if (response.data) {
            term.write(response.data);
          }
          if (typeof response.offset === "number") {
            terminalCursorRef.current = response.offset;
          }

          if (response.closed) {
            const reason = response.closeReason ? `: ${response.closeReason}` : "";
            term.writeln(`\r\n[session closed${reason}]`);
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
            if (writeTimer) {
              clearInterval(writeTimer);
              writeTimer = null;
            }
          }
        }).catch(() => undefined);
      }, 120);
    };

    void setupTerminal().catch(() => {
      toast.error("Failed to initialize terminal");
    });

    return () => {
      isCancelled = true;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      if (writeTimer) {
        clearInterval(writeTimer);
      }
      resizeObserver?.disconnect();

      terminalIdRef.current = null;
      terminalCursorRef.current = 0;
      terminalInputBufferRef.current = "";
      terminalWriteInFlightRef.current = false;
      terminalWriteErroredRef.current = false;

      terminalRef.current = null;
      terminalDispose?.();
    };
  }, [agent, terminalReloadKey, isOpen, activeTerminalId, refreshTerminalSessions]);

  useEffect(() => {
    if (isOpen && !sshSession) {
      void createSshAccess().catch(() => undefined);
    }
  }, [isOpen, sshSession, createSshAccess]);

  useEffect(() => {
    if (isOpen && agent && !explorer) {
      void refreshExplorer();
    }
  }, [isOpen, agent, explorer, refreshExplorer]);

  useEffect(() => {
    if (!isOpen || !agent) {
      return;
    }
    void refreshTerminalSessions();
  }, [isOpen, agent, refreshTerminalSessions, terminalReloadKey]);

  useEffect(() => {
    setIsOpen(false);
    setSshSession(null);
    setExplorer(null);
    setPreviewPort(undefined);
    setPreviewUrl(undefined);
    setTerminalReloadKey(0);
    setTerminalSessions([]);
    setActiveTerminalId(null);
  }, [chatId]);

  return {
    isOpen,
    open,
    close,
    toggle,
    sshSession,
    explorer,
    refreshExplorer,
    navigateExplorer,
    downloadFile,
    downloadFolder,
    deleteEntry,
    previewPort,
    previewUrl,
    setPreviewPort,
    createPreviewAccess,
    openInEditor,
    reconnectSsh,
    reconnectTerminal,
    switchTerminalSession,
    createTerminalSession,
    closeTerminalSession,
    refreshTerminalSessions,
    terminalSessions,
    activeTerminalId,
    focusTerminal,
    terminalContainerRef,
    terminalBackground: TERMINAL_BACKGROUND,
    isConnectingSsh: createSshMutation.isPending,
    isConnectingPreview: createPreviewMutation.isPending,
  };
}

export type ChatSshSessionState = ReturnType<typeof useChatSandbox>["sshSession"];
export type ChatExplorerState = ReturnType<typeof useChatSandbox>["explorer"];
export type ChatTerminalSessionsState = ReturnType<typeof useChatSandbox>["terminalSessions"];

function createTerminalSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
