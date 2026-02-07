import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FileIcon, FolderIcon, LaptopIcon, RefreshCw } from "lucide-react";
import type { Terminal as XtermTerminal } from "xterm";
import type { ChatSshSessionState } from "@/hooks/use-sandbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import "xterm/css/xterm.css";

const TERMINAL_BACKGROUND = "#0b0f19";

type XtermTerminalWriteData = Extract<Parameters<XtermTerminal["write"]>[0], string>;
type XtermTerminalInputData = Extract<Parameters<Parameters<XtermTerminal["onData"]>[0]>[0], string>;
type XtermTerminalResizeEvent = Parameters<Parameters<XtermTerminal["onResize"]>[0]>[0];

type ChatSandboxWorkspaceProps = {
  sshSession: ChatSshSessionState;
  previewPort: number | undefined;
  previewUrl: string | undefined;
  isConnectingPreview: boolean;
  onPreviewPortChange: (port: number | undefined) => void;
  onCreatePreviewAccess: () => Promise<unknown>;
  onCopySshCommand: () => Promise<void>;
  onOpenInEditor: (editor: "vscode" | "cursor") => Promise<void>;
  agent: {
    call: (method: string, args?: unknown[]) => Promise<unknown>;
  } | null;
};

export function ChatSandboxWorkspace({
  sshSession,
  previewPort,
  previewUrl,
  isConnectingPreview,
  onPreviewPortChange,
  onCreatePreviewAccess,
  onCopySshCommand,
  onOpenInEditor,
  agent,
}: ChatSandboxWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "terminal" | "explorer">("preview");
  const [terminalReloadKey, setTerminalReloadKey] = useState(0);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const terminalCursorRef = useRef(0);
  const terminalInputBufferRef = useRef<XtermTerminalInputData>("");
  const terminalWriteInFlightRef = useRef(false);
  const terminalWriteErroredRef = useRef(false);

  const sortedEntries = useMemo(() => {
    const entries = sshSession?.explorer.entries ?? [];
    return [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [sshSession?.explorer.entries]);

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
  }, [agent, terminalReloadKey]);

  useEffect(() => {
    if (activeTab === "terminal") {
      terminalRef.current?.focus();
    }
  }, [activeTab]);

  return (
    <div className="h-full border-l bg-background">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "preview" | "terminal" | "explorer")}
        className="flex h-full flex-col gap-0"
      >
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <TabsList variant="line" className="w-auto">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="terminal">Terminal</TabsTrigger>
            <TabsTrigger value="explorer">File Explorer</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTerminalReloadKey((value) => value + 1)}
              aria-label="Reconnect terminal session"
            >
              <RefreshCw className="size-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Open in VSCode or Cursor">
                    <LaptopIcon className="size-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void onOpenInEditor("vscode")}>
                  Open in VSCode
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onOpenInEditor("cursor")}>
                  Open in Cursor
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <TabsContent value="preview" className="mt-0 flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-2 flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={65535}
              value={previewPort ?? ""}
              onChange={(event) => {
                const nextPort = Number(event.target.value);
                onPreviewPortChange(Number.isFinite(nextPort) && nextPort > 0 ? nextPort : undefined);
              }}
              placeholder="3000"
              className="h-8"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onCreatePreviewAccess()}
              disabled={previewPort === undefined || isConnectingPreview}
            >
              {isConnectingPreview ? "Connecting..." : "Connect"}
            </Button>
          </div>
          <Input value={previewUrl ?? ""} readOnly placeholder="https://..." className="mb-2 h-8" />
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
            <iframe
              className="h-full w-full"
              src={previewUrl || undefined}
              title="Sandbox Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            />
          </div>
        </TabsContent>

        <TabsContent value="terminal" keepMounted className="mt-0 flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Sandbox terminal</p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTerminalReloadKey((value) => value + 1)}
              >
                Reload
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void onCopySshCommand()}>
                Copy SSH
              </Button>
            </div>
          </div>
          <div
            ref={terminalContainerRef}
            className="min-h-0 flex-1 overflow-hidden rounded-md border"
            style={{ backgroundColor: TERMINAL_BACKGROUND }}
          />
          {sshSession && (
            <div className="mt-2 text-xs text-muted-foreground">
              SSH expires: {new Date(sshSession.ssh.expiresAt).toLocaleString()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="explorer" className="mt-0 min-h-0 flex-1 p-3">
          <div className="mb-2 text-xs text-muted-foreground">{sshSession?.explorer.path ?? "/"}</div>
          <div className="h-full overflow-auto rounded-md border">
            {sortedEntries.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No files found.</div>
            ) : (
              <ul className="p-1">
                {sortedEntries.map((entry) => (
                  <li key={entry.path}>
                    <div className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        {entry.isDir ? (
                          <FolderIcon className="size-3.5 shrink-0 text-blue-500" />
                        ) : (
                          <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </span>
                      {!entry.isDir && <ExternalLink className="size-3 text-muted-foreground" />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
