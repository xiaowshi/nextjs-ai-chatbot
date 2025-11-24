import { useEffect, useState } from "react";

interface LocalStorageChat {
  id: string;
  messages: any[];
  title: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "chat_local_history";
const CURRENT_CHAT_KEY = "current_local_chat_id";

export function useLocalStorage() {
  const [isLoaded, setIsLoaded] = useState(false);

  // 获取所有本地存储的对话
  const getAllChats = (): LocalStorageChat[] => {
    if (typeof window === "undefined") return [];
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  };

  // 获取当前对话 ID
  const getCurrentChatId = (): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(CURRENT_CHAT_KEY);
    } catch {
      return null;
    }
  };

  // 设置当前对话 ID
  const setCurrentChatId = (chatId: string) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(CURRENT_CHAT_KEY, chatId);
    } catch {
      // Fail silently
    }
  };

  // 获取特定对话
  const getChat = (chatId: string): LocalStorageChat | null => {
    const chats = getAllChats();
    return chats.find((c) => c.id === chatId) || null;
  };

  // 保存对话
  const saveChat = (chatId: string, messages: any[], title = "New Chat") => {
    if (typeof window === "undefined") return;
    try {
      const chats = getAllChats();
      const existingIndex = chats.findIndex((c) => c.id === chatId);
      const now = Date.now();

      if (existingIndex >= 0) {
        chats[existingIndex] = {
          ...chats[existingIndex],
          messages,
          title,
          updatedAt: now,
        };
      } else {
        chats.push({
          id: chatId,
          messages,
          title,
          createdAt: now,
          updatedAt: now,
        });
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch {
      // Fail silently
    }
  };

  // 删除对话
  const deleteChat = (chatId: string) => {
    if (typeof window === "undefined") return;
    try {
      const chats = getAllChats();
      const filtered = chats.filter((c) => c.id !== chatId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch {
      // Fail silently
    }
  };

  // 清空所有对话
  const clearAll = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CURRENT_CHAT_KEY);
    } catch {
      // Fail silently
    }
  };

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return {
    isLoaded,
    getAllChats,
    getCurrentChatId,
    setCurrentChatId,
    getChat,
    saveChat,
    deleteChat,
    clearAll,
  };
}
