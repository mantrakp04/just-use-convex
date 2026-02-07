import { useCallback, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useAction } from "convex/react";
import { toast } from "sonner";

type ChatSshSession = FunctionReturnType<typeof api.sandboxes.nodeFunctions.createChatSshAccess>;

export function useChatSandbox(chatId: Id<"chats">) {
  const createChatSshAccess = useAction(api.sandboxes.nodeFunctions.createChatSshAccess);
  const createChatPreviewAccess = useAction(api.sandboxes.nodeFunctions.createChatPreviewAccess);
  const [isOpen, setIsOpen] = useState(false);
  const [sshSession, setSshSession] = useState<ChatSshSession | null>(null);
  const [previewPort, setPreviewPort] = useState<number | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);

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

  const reconnectSsh = useCallback(async () => {
    await createSshAccess();
  }, [createSshAccess]);

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
    setIsOpen(false);
    setSshSession(null);
    setPreviewPort(undefined);
    setPreviewUrl(undefined);
  }, [chatId]);

  return {
    isOpen,
    open,
    close,
    toggle,
    sshSession,
    previewPort,
    previewUrl,
    setPreviewPort,
    createPreviewAccess,
    copySshCommand,
    openInEditor,
    reconnectSsh,
    isConnectingSsh: createSshMutation.isPending,
    isConnectingPreview: createPreviewMutation.isPending,
  };
}

export type ChatSshSessionState = ReturnType<typeof useChatSandbox>["sshSession"];
