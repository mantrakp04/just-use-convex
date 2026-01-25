import { useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAgentChatInstance } from "@/providers/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SendHorizontal, Loader2, Bot, User, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from "lucide-react";
import type { UIMessage } from "@ai-sdk/react";

export const Route = createFileRoute("/(protected)/chat")({
  component: ChatPage,
});

function ChatPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");

  const { messages, sendMessage, clearHistory, status, error, isConnected } = useAgentChatInstance({
    name: "chat",
    onError: (err: Error) => {
      console.error("Chat error:", err);
    },
  });

  const isLoading = status === "streaming";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput("");
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: message }],
    });
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            <h1 className="text-sm font-medium">Chat</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Connecting to agent...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          <h1 className="text-sm font-medium">Chat</h1>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearHistory}>
            Clear
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-4">
        <div ref={scrollRef} className="py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground">
              <Bot className="size-12 mb-4 opacity-50" />
              <p className="text-sm">Start a conversation</p>
            </div>
          ) : (
            (messages).map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role !== "user" && (
                  <div className="shrink-0 size-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="size-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {message.parts.map((part, i: number) => {
                    if (part.type === "text") {
                      return (
                        <p key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    }
                    if (part.type === "dynamic-tool") {
                      return <ToolCallAccordion key={i} {...part} />;
                    }
                    return null;
                  })}
                </div>
                {message.role === "user" && (
                  <div className="shrink-0 size-7 rounded-full bg-primary flex items-center justify-center">
                    <User className="size-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3">
              <div className="shrink-0 size-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="size-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="size-4 animate-spin" />
              </div>
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error.message}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizontal className="size-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}


function ToolCallAccordion(props: Extract<UIMessage['parts'][number], { type: 'dynamic-tool' }>) {
  const [isOpen, setIsOpen] = useState(false);

  const isLoading = props.state === "input-streaming" || props.state === "input-available" || props.state === "approval-requested" || props.state === "approval-responded";
  const isError = props.state === "output-error" || props.state === "output-denied";
  const isCompleted = props.state === "output-available";

  const StatusIcon = () => {
    if (isLoading) {
      return <Loader2 className="size-3.5 animate-spin text-amber-500" />;
    }
    if (isError) {
      return <AlertCircle className="size-3.5 text-destructive" />;
    }
    if (isCompleted) {
      return <CheckCircle2 className="size-3.5 text-emerald-500" />;
    }
    return null;
  };

  return (
    <div className={cn(
      "mt-2 bg-background/50 rounded text-xs font-mono",
      isError && "border border-destructive/30"
    )}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2 hover:bg-background/80 rounded transition-colors"
      >
        <div className="flex items-center gap-2">
          <StatusIcon />
          <span className="text-muted-foreground">Tool: {props.toolName}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="px-2 pb-2 space-y-2">
          {isLoading && props.input !== undefined && (
            <div>
              <span className="text-muted-foreground">Input:</span>
              <pre className="overflow-auto mt-1">
                {JSON.stringify(props.input, null, 2)}
              </pre>
            </div>
          )}
          {isError && props.errorText ? (
            <pre className="overflow-auto text-destructive">
              {String(props.errorText)}
            </pre>
          ) : props.output !== undefined ? (
            <div>
              <span className="text-muted-foreground">Output:</span>
              <pre className="overflow-auto mt-1">
                {JSON.stringify(props.output, null, 2)}
              </pre>
            </div>
          ) : !isLoading && (
            <span className="text-muted-foreground">Waiting for output...</span>
          )}
        </div>
      )}
    </div>
  );
}
