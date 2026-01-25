import { useState, useRef, useEffect } from "react";
import { useAgent } from "agents/react";
import { createFileRoute } from "@tanstack/react-router";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SendHorizontal, Loader2, Bot, User, ChevronDown, ChevronUp } from "lucide-react";
import { env } from "@just-use-convex/env/web";

type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool-call"; state: string; toolName: string; output: unknown };

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: MessagePart[];
};

export const Route = createFileRoute("/(protected)/chat")({
  component: ChatPage,
});

function ChatPage() {
  const agent = useAgent({
    agent: "agent",
    name: "chat",
    host: env.VITE_AGENT_URL
  });

  if (!agent) {
    return (
      <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            <h1 className="text-sm font-medium">Chat</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          {agent ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-sm text-muted-foreground">Failed to connect to agent</p>
          )}
        </div>
      </div>
    );
  }

  return <ChatContent agent={agent} />;
}

function ToolCallAccordion({ toolName, output }: { toolName: string; output: unknown }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-2 bg-background/50 rounded text-xs font-mono">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-2 hover:bg-background/80 rounded transition-colors"
      >
        <span className="text-muted-foreground">Tool: {toolName}</span>
        {isOpen ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="px-2 pb-2">
          <pre className="overflow-auto">
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ChatContent({ agent }: { agent: ReturnType<typeof useAgent<any>> }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");

  const { messages, sendMessage, clearHistory, status, error } = useAgentChat({
    agent: agent,
    credentials: 'include', // Send cookies with requests
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
            (messages as Message[]).map((message) => (
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
                  {message.parts.map((part: MessagePart, i: number) => {
                    if (part.type === "text") {
                      return (
                        <p key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    }
                    if (
                      part.type === "tool-call" &&
                      part.state === "output-available"
                    ) {
                      return (
                        <ToolCallAccordion
                          key={i}
                          toolName={part.toolName}
                          output={part.output}
                        />
                      );
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
