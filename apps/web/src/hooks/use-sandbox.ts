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

  const copySshCommand = useCallback(async () => {
    const nextSession = sshSession ?? await createSshAccess();
    if (!nextSession?.ssh.command) {
      return;
    }

    try {
      await navigator.clipboard.writeText(nextSession.ssh.command);
      toast.success("SSH command copied");
    } catch {
      toast.error("Failed to copy SSH command");
    }
  }, [createSshAccess, sshSession]);

  const openInEditor = useCallback(
    async (editor: "vscode" | "cursor") => {
      const nextSession = await createSshAccess();
      if (!nextSession?.ssh.command) {
        return;
      }

      try {
        await navigator.clipboard.writeText(nextSession.ssh.command);
        toast.success("SSH command copied");
      } catch {
        toast.error("Failed to copy SSH command");
      }

      if (typeof window === "undefined") {
        return;
      }

      window.location.href = editor === "vscode" ? "vscode://" : "cursor://";
    },
    [createSshAccess]
  );

  const refreshExplorer = useCallback(async (path?: string) => {
    if (!agent) return;
    try {
      const result = await agent.call("listFiles", [path ? { path } : undefined]) as ExplorerState;
      setExplorer(result);
    } catch {
      // ignore - sandbox may not be ready yet
    }
  }, [agent]);

  const reconnectSsh = useCallback(async () => {
    await createSshAccess();
  }, [createSshAccess]);
  const reconnectTerminal = useCallback(() => {
    setTerminalReloadKey((value) => value + 1);
  }, []);
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
    if (!agent || !terminalContainerRef.current) {
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

      const openResponse = await agent.call("openSshTerminal", [{
        cols: term.cols,
        rows: term.rows,
      }]) as { terminalId?: string };
      if (isCancelled) {
        const terminalId = openResponse?.terminalId;
        if (terminalId) {
          void agent.call("closeSshTerminal", [{ terminalId }]).catch(() => undefined);
        }
        return;
      }

      const terminalId = openResponse?.terminalId;
      if (!terminalId) {
        term.writeln("\r\nFailed to open SSH terminal session.");
        return;
      }
      terminalIdRef.current = terminalId;
      terminalCursorRef.current = 0;
      terminalInputBufferRef.current = "";
      terminalWriteInFlightRef.current = false;
      terminalWriteErroredRef.current = false;

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
        void agent.call("writeSshTerminal", [{
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
        void agent.call("resizeSshTerminal", [{
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

        void agent.call("readSshTerminal", [{
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

      const terminalId = terminalIdRef.current;
      terminalIdRef.current = null;
      terminalCursorRef.current = 0;
      terminalInputBufferRef.current = "";
      terminalWriteInFlightRef.current = false;
      terminalWriteErroredRef.current = false;
      if (terminalId) {
        void agent.call("closeSshTerminal", [{ terminalId }]).catch(() => undefined);
      }

      terminalRef.current = null;
      terminalDispose?.();
    };
  }, [agent, terminalReloadKey, isOpen]);

  useEffect(() => {
    if (isOpen && agent && !explorer) {
      void refreshExplorer();
    }
  }, [isOpen, agent, explorer, refreshExplorer]);

  useEffect(() => {
    setIsOpen(false);
    setSshSession(null);
    setExplorer(null);
    setPreviewPort(undefined);
    setPreviewUrl(undefined);
    setTerminalReloadKey(0);
  }, [chatId]);

  return {
    isOpen,
    open,
    close,
    toggle,
    sshSession,
    explorer,
    refreshExplorer,
    previewPort,
    previewUrl,
    setPreviewPort,
    createPreviewAccess,
    copySshCommand,
    openInEditor,
    reconnectSsh,
    reconnectTerminal,
    focusTerminal,
    terminalContainerRef,
    terminalBackground: TERMINAL_BACKGROUND,
    isConnectingSsh: createSshMutation.isPending,
    isConnectingPreview: createPreviewMutation.isPending,
  };
}

export type ChatSshSessionState = ReturnType<typeof useChatSandbox>["sshSession"];
export type ChatExplorerState = ReturnType<typeof useChatSandbox>["explorer"];
