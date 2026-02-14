import { Fragment, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, FileIcon, FolderIcon, LaptopIcon, PlusIcon, RefreshCw, Trash2Icon } from "lucide-react";
import type { ChatSshSessionState, ChatExplorerState, ChatTerminalSessionsState, TerminalSession } from "@/hooks/use-sandbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import "xterm/css/xterm.css";

type ChatSandboxWorkspaceProps = {
  sshSession: ChatSshSessionState;
  explorer: ChatExplorerState;
  terminalSessions: ChatTerminalSessionsState;
  activeTerminalId: string | null;
  onRefreshExplorer: () => void;
  onNavigateExplorer: (path: string) => void;
  onDownloadFile: (path: string, name: string) => void;
  onDownloadFolder: (path: string, name: string) => void;
  onDeleteEntry: (path: string) => void;
  onRefreshTerminalSessions: () => void;
  onSwitchTerminalSession: (terminalId: string) => void;
  onCreateTerminalSession: () => void;
  onCloseTerminalSession: (terminalId: string) => Promise<void>;
  previewPort: number | undefined;
  previewUrl: string | undefined;
  isConnectingPreview: boolean;
  onPreviewPortChange: (port: number | undefined) => void;
  onCreatePreviewAccess: () => Promise<unknown>;
  onOpenInEditor: (editor: "vscode" | "cursor") => Promise<void>;
  onReconnectTerminal: () => void;
  onFocusTerminal: () => void;
  terminalContainerRef: RefObject<HTMLDivElement | null>;
  terminalBackground: string;
};

export function ChatSandboxWorkspace({
  sshSession,
  explorer,
  terminalSessions,
  activeTerminalId,
  onRefreshExplorer,
  onNavigateExplorer,
  onDownloadFile,
  onDownloadFolder,
  onDeleteEntry,
  onRefreshTerminalSessions,
  onSwitchTerminalSession,
  onCreateTerminalSession,
  onCloseTerminalSession,
  previewPort,
  previewUrl,
  isConnectingPreview,
  onPreviewPortChange,
  onCreatePreviewAccess,
  onOpenInEditor,
  onReconnectTerminal,
  onFocusTerminal,
  terminalContainerRef,
  terminalBackground,
}: ChatSandboxWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "terminal" | "explorer">("preview");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const refreshPreview = useCallback(() => {
    if (iframeRef.current) {
      const src = iframeRef.current.src;
      iframeRef.current.src = "";
      iframeRef.current.src = src;
    }
  }, []);

  const sortedEntries = useMemo(() => {
    const entries = explorer?.entries ?? [];
    return [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [explorer?.entries]);

  const pathSegments = useMemo(() => {
    const path = explorer?.path ?? "workspace";
    const parts = path.split("/").filter(Boolean);
    return parts.map((part, index) => ({
      name: part,
      path: parts.slice(0, index + 1).join("/"),
    }));
  }, [explorer?.path]);

  const sessionOptions = useMemo(() => {
    if (!activeTerminalId) {
      return terminalSessions;
    }
    if (terminalSessions.some((session) => session.id === activeTerminalId)) {
      return terminalSessions;
    }
    return [
      ...terminalSessions,
      {
        id: activeTerminalId,
        active: false,
        cwd: "",
      } satisfies TerminalSession,
    ];
  }, [activeTerminalId, terminalSessions]);

  useEffect(() => {
    if (activeTab === "terminal") {
      onFocusTerminal();
    }
  }, [activeTab, onFocusTerminal]);

  return (
    <div className="h-full border-l bg-background">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "preview" | "terminal" | "explorer")}
        className="flex h-full flex-col gap-0"
      >
        <div className="flex items-center justify-end border-b px-2 py-1.5">
          <TabsList className="w-auto">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="terminal">Terminal</TabsTrigger>
            <TabsTrigger value="explorer">File Explorer</TabsTrigger>
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon-lg" aria-label="Open in VSCode or Cursor">
                  <LaptopIcon />
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

        <TabsContent value="preview" className="mt-0 flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 flex-1 items-center overflow-hidden rounded-md border bg-muted/50 text-sm">
              <span className="shrink-0 pl-2.5 text-muted-foreground">http://localhost:</span>
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
                className="h-full w-20 border-0 bg-transparent px-0.5 shadow-none focus-visible:ring-0"
              />
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={refreshPreview}
              disabled={!previewUrl}
              aria-label="Refresh preview"
            >
              <RefreshCw className="size-3.5" />
            </Button>
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
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
            <iframe
              ref={iframeRef}
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
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button type="button" variant="outline" size="sm">
                      {activeTerminalId ? formatSessionLabel(activeTerminalId, true) : "Sessions"}
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {sessionOptions.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">No sessions found.</p>
                  ) : (
                    sessionOptions.map((session) => {
                      const isCurrentSession = session.id === activeTerminalId;
                      return (
                        <DropdownMenuItem
                          key={session.id}
                          disabled={isCurrentSession}
                          onClick={() => onSwitchTerminalSession(session.id)}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="truncate text-sm">
                            {formatSessionLabel(session.id, session.active ?? false)}
                            {isCurrentSession ? " (current)" : ""}
                          </span>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onCloseTerminalSession(session.id);
                            }}
                            aria-label={`Delete session ${session.id}`}
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCreateTerminalSession}
              >
                <PlusIcon className="size-3.5" />
                Session
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  onReconnectTerminal();
                  void onRefreshTerminalSessions();
                }}
                aria-label="Refresh sessions"
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </div>
          <div
            ref={terminalContainerRef}
            className="min-h-0 flex-1 overflow-hidden rounded-md border"
            style={{ backgroundColor: terminalBackground }}
          />
          {sshSession && (
            <div className="mt-2 text-xs text-muted-foreground">
              SSH expires: {new Date(sshSession.ssh.expiresAt).toLocaleString()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="explorer" className="mt-0 flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <Breadcrumb>
                <BreadcrumbList>
                  {pathSegments.map((segment, index) => (
                    <Fragment key={segment.path}>
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem>
                        {index === pathSegments.length - 1 ? (
                          <BreadcrumbPage>{segment.name}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            render={<button type="button" />}
                            onClick={() => onNavigateExplorer(segment.path)}
                          >
                            {segment.name}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRefreshExplorer}
              aria-label="Refresh file explorer"
            >
              <RefreshCw className="size-3" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            {sortedEntries.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No files found.</div>
            ) : (
              <ul className="p-1">
                {sortedEntries.map((entry) => (
                  <li key={entry.path}>
                    <div className="group flex w-full items-center rounded-md px-2 py-1 text-left text-xs hover:bg-muted/50">
                      {entry.isDir ? (
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2"
                          onClick={() => onNavigateExplorer(entry.path)}
                        >
                          <FolderIcon className="size-3.5 shrink-0 text-blue-500" />
                          <span className="truncate">{entry.name}</span>
                        </button>
                      ) : (
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{entry.name}</span>
                        </span>
                      )}
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            if (entry.isDir) {
                              void onDownloadFolder(entry.path, entry.name);
                            } else {
                              void onDownloadFile(entry.path, entry.name);
                            }
                          }}
                          aria-label={`Download ${entry.name}`}
                        >
                          <DownloadIcon className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            if (window.confirm(`Delete "${entry.name}"? This cannot be undone.`)) {
                              void onDeleteEntry(entry.path);
                            }
                          }}
                          aria-label={`Delete ${entry.name}`}
                        >
                          <Trash2Icon className="size-3 text-destructive" />
                        </Button>
                      </div>
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

function formatSessionLabel(sessionId: string, isRemoteActive: boolean) {
  const shortId = sessionId.length > 12 ? sessionId.slice(0, 12) : sessionId;
  return isRemoteActive ? `${shortId} (active)` : shortId;
}
