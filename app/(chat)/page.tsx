"use client";

import { useEffect, useState } from "react";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";

export default function Page() {
  const { isLoaded, getCurrentChatId, getChat } = useLocalStorage();
  const [initialData, setInitialData] = useState<{
    id: string;
    messages: any[];
    model: string;
  } | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const currentChatId = getCurrentChatId();
    if (currentChatId) {
      const chat = getChat(currentChatId);
      if (chat) {
        setInitialData({
          id: currentChatId,
          messages: chat.messages,
          model: DEFAULT_CHAT_MODEL,
        });
        return;
      }
    }

    // Create new chat if no current chat found
    const newId = generateUUID();
    setInitialData({
      id: newId,
      messages: [],
      model: DEFAULT_CHAT_MODEL,
    });
  }, [isLoaded]);

  if (!initialData) {
    return null;
  }

  return (
    <>
      <Chat
        autoResume={false}
        id={initialData.id}
        initialChatModel={initialData.model}
        initialMessages={initialData.messages}
        initialVisibilityType="private"
        isReadonly={false}
        key={initialData.id}
      />
      <DataStreamHandler />
    </>
  );
}
