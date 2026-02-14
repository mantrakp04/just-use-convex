import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
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

type ChatSshSession = FunctionReturnType<typeof api.sandboxes.nodeFunctions.createChatSshAccess>;
type XtermTerminalInputData = Extract<Parameters<Parameters<XtermTerminal["onData"]>[0]>[0], string>;

export type { ExplorerEntry, ExplorerState, TerminalSession };

const TERMINAL_BACKGROUND = "#0b0f19";

export function useChatSandbox(
  chatId: Id<"chats">,
  agent: {
    call: (
      method: string,
      args?: unknown[],
      options?: {
        onChunk?: (chunk: unknown) => void;
        onDone?: (finalChunk: unknown) => void;
        onError?: (error: string) => void;
      }
    ) => Promise<unknown>;
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
  const terminalInputBufferRef = useRef<XtermTerminalInputData>("");
  const terminalOptimisticInputBufferRef = useRef<XtermTerminalInputData>("");
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
      const isExpired = sshSession ? Date.now() >= new Date(sshSession.expiresAt).getTime() : false;
      const session = !sshSession || isExpired ? await createSshAccess() : sshSession;
      if (!session?.token) {
        return;
      }

      const host = session.sshCommand ? parseSshHost(session.sshCommand) : "ssh.app.daytona.io";
      const scheme = editor === "vscode" ? "vscode" : "cursor";
      const uri = `${scheme}://vscode-remote/ssh-remote+${session.token}@${host}/home/daytona/workspace`;

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
      // ignore - sandbox may not be ready yet
    }
  }, [agent, explorer?.path]);

  const navigateExplorer = useCallback(async (path: string) => {
    await refreshExplorer(path);
  }, [refreshExplorer]);

  const downloadFile = useCallback(async (path: string, name: string) => {
    if (!agent) return;
    try {
      const result = await agent.call("downloadFile", [{ path }]) as { base64: string; name: string };
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
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
      const result = await agent.call("downloadFolder", [{ path }]) as { base64: string; name: string };
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
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
          const sel = term.getSelection();
          void navigator.clipboard.writeText(sel).catch(() => undefined);
          return false;
        }
        return true;
      });
      terminalRef.current = term;

      terminalDispose = () => {
        term.dispose();
      };

      terminalIdRef.current = activeTerminalId;

      const openResult = await agent
        .call("openPtyTerminal", [{
          terminalId: activeTerminalId,
          cols: term.cols,
          rows: term.rows,
        }])
        .catch(() => null);

      if (!openResult || isCancelled || !terminalContainerRef.current) {
        if (openResult === null && !isCancelled) {
          term.writeln("\r\nFailed to open PTY terminal session.");
        }
        if (isCancelled && activeTerminalId) {
          void agent.call("closePtyTerminal", [{ terminalId: activeTerminalId }]).catch(() => undefined);
        }
        return;
      }

      void agent.call(
        "streamPtyTerminal",
        [{ terminalId: activeTerminalId }],
        {
          onChunk: (chunk) => {
            if (isCancelled) {
              return;
            }
            if (typeof chunk === "string") {
              const chunkToWrite = consumeOptimisticPtyEcho(chunk, terminalOptimisticInputBufferRef);
              if (chunkToWrite) {
                term.write(chunkToWrite);
              }
            }
          },
          onDone: (finalChunk) => {
            if (isCancelled) {
              return;
            }
            const finalResult = finalChunk as {
              closed?: boolean;
              closeReason?: string | null;
            };
            if (finalResult?.closed) {
              const reason = finalResult.closeReason ? `: ${finalResult.closeReason}` : "";
              term.writeln(`\r\n[session closed${reason}]`);
            }
            void refreshTerminalSessions();
          },
          onError: () => {
            if (!isCancelled) {
              term.writeln("\r\n[terminal stream error]");
            }
          },
        },
      ).catch(() => {
        if (!isCancelled) {
          term.writeln("\r\n[terminal stream error]");
        }
      });

      terminalInputBufferRef.current = "";
      terminalOptimisticInputBufferRef.current = "";
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
        terminalOptimisticInputBufferRef.current += pendingInput;
        // Don't term.write(pendingInput) - xterm already displays via default key handling
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
        } satisfies PtyResizeInput]).catch(() => undefined);
      });
      resizeObserver.observe(terminalContainerRef.current);


    };

    void setupTerminal().catch(() => {
      toast.error("Failed to initialize terminal");
    });

    return () => {
      isCancelled = true;
      if (writeTimer) {
        clearInterval(writeTimer);
      }
      resizeObserver?.disconnect();

      terminalIdRef.current = null;
      terminalInputBufferRef.current = "";
      terminalOptimisticInputBufferRef.current = "";
      terminalWriteInFlightRef.current = false;
      terminalWriteErroredRef.current = false;

      terminalRef.current = null;
      terminalDispose?.();
    };
  }, [agent, terminalReloadKey, isOpen, activeTerminalId, refreshTerminalSessions]);

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

function consumeOptimisticPtyEcho(
  chunk: string,
  terminalOptimisticInputBufferRef: { current: XtermTerminalInputData },
) {
  let pendingOptimisticInput = terminalOptimisticInputBufferRef.current;
  if (!pendingOptimisticInput) {
    return chunk;
  }

  let cursor = 0;

  while (cursor < chunk.length && pendingOptimisticInput.length > 0) {
    const char = chunk[cursor];
    if (char === "\r" || char === "\n") {
      cursor += 1;
      continue;
    }

    const ansiLength = getAnsiEscapeSequenceLength(chunk, cursor);
    if (ansiLength > 0) {
      cursor += ansiLength;
      continue;
    }

    if (chunk[cursor] === pendingOptimisticInput[0]) {
      cursor += 1;
      pendingOptimisticInput = pendingOptimisticInput.slice(1);
      continue;
    }

    terminalOptimisticInputBufferRef.current = pendingOptimisticInput;
    return chunk.slice(cursor);
  }

  if (pendingOptimisticInput.length === 0) {
    terminalOptimisticInputBufferRef.current = "";
    return chunk.slice(cursor);
  }

  terminalOptimisticInputBufferRef.current = pendingOptimisticInput;
  return "";
}

function parseSshHost(sshCommand: string): string {
  const m = sshCommand.match(/@([^\s]+)/);
  return m?.[1] ?? "ssh.app.daytona.io";
}

function getAnsiEscapeSequenceLength(chunk: string, start: number) {
  if (chunk[start] !== "\u001b") {
    return 0;
  }
  if (chunk[start + 1] !== "[") {
    return 0;
  }
  for (let index = start + 2; index < chunk.length; index += 1) {
    const code = chunk.charCodeAt(index);
    if (code >= 64 && code <= 126) {
      return index - start + 1;
    }
  }
  return 0;
}
