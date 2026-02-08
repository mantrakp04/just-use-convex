import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FileIcon, FolderIcon, LaptopIcon, RefreshCw } from "lucide-react";
import type { ChatSshSessionState, ChatExplorerState } from "@/hooks/use-sandbox";
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

type ChatSandboxWorkspaceProps = {
  sshSession: ChatSshSessionState;
  explorer: ChatExplorerState;
  onRefreshExplorer: () => void;
  previewPort: number | undefined;
  previewUrl: string | undefined;
  isConnectingPreview: boolean;
  onPreviewPortChange: (port: number | undefined) => void;
  onCreatePreviewAccess: () => Promise<unknown>;
  onCopySshCommand: () => Promise<void>;
  onOpenInEditor: (editor: "vscode" | "cursor") => Promise<void>;
  onReconnectTerminal: () => void;
  onFocusTerminal: () => void;
  terminalContainerRef: RefObject<HTMLDivElement | null>;
  terminalBackground: string;
};

export function ChatSandboxWorkspace({
  sshSession,
  explorer,
  onRefreshExplorer,
  previewPort,
  previewUrl,
  isConnectingPreview,
  onPreviewPortChange,
  onCreatePreviewAccess,
  onCopySshCommand,
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
              onClick={onReconnectTerminal}
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
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReconnectTerminal}
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
            style={{ backgroundColor: terminalBackground }}
          />
          {sshSession && (
            <div className="mt-2 text-xs text-muted-foreground">
              SSH expires: {new Date(sshSession.ssh.expiresAt).toLocaleString()}
            </div>
          )}
        </TabsContent>

        <TabsContent value="explorer" className="mt-0 min-h-0 flex-1 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{explorer?.path ?? "/"}</span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onRefreshExplorer} aria-label="Refresh file explorer">
              <RefreshCw className="size-3" />
            </Button>
          </div>
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
