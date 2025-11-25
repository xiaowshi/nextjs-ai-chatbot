"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type TodoItem = {
  id: string;
  text: string;
  completed: boolean;
  originalLine?: string;
  tag?: string; // 习惯名称作为tag
};

type TodoListProps = {
  content: string;
  completedItems?: Set<string>;
  onToggleItem?: (id: string, completed: boolean) => void;
  onEditItem?: (id: string, originalText: string, newText: string) => void;
  onCelebration?: () => void;
};

export function TodoList({
  content,
  completedItems = new Set(),
  onToggleItem,
  onEditItem,
  onCelebration,
}: TodoListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const todos = useMemo(() => {
    if (!content) return [];

    // 清理markdown格式符号的函数
    const cleanMarkdown = (text: string): string => {
      return text
        .replace(/\*\*/g, "") // 去掉加粗符号 **
        .replace(/\*/g, "") // 去掉斜体符号 *
        .replace(/`/g, "") // 去掉代码符号 `
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 去掉链接格式，只保留文本
        .trim();
    };

    // 解析内容，提取计划项
    // 新格式支持：
    // > ### [习惯名称]
    // > - [具体行动点]

    const lines = content.split("\n");
    const items: TodoItem[] = [];
    let currentHabit = ""; // 当前习惯名称
    let itemIndex = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 匹配习惯名称：> ### [习惯名称] 或 ### [习惯名称]
      const habitMatch = trimmed.match(/^>\s*###\s*(.+)$/) || trimmed.match(/^###\s*(.+)$/);
      if (habitMatch) {
        // 提取习惯名称，去掉符号和markdown格式，只保留文字
        currentHabit = cleanMarkdown(habitMatch[1]);
        continue;
      }

      // 匹配行动点：> - [具体行动点] 或 - [具体行动点]
      const actionMatch = trimmed.match(/^>\s*-\s*(.+)$/) || trimmed.match(/^-\s*(.+)$/);
      if (actionMatch) {
        // 提取行动点文字，去掉符号和markdown格式
        const actionText = cleanMarkdown(actionMatch[1]);
        if (actionText && actionText.length > 0) {
          // 使用文本内容和行号作为 ID，确保稳定性
          const id = `${currentHabit}-${itemIndex}-${actionText.slice(0, 50)}`;
          const isCompleted = completedItems.has(id);
          
          // Debug log
          if (isCompleted) {
            console.log("[TODO] Found completed item:", { id, text: actionText.substring(0, 30) });
          }
          
          items.push({
            id,
            text: actionText,
            completed: isCompleted,
            originalLine: trimmed, // 保存原始行用于编辑
            tag: currentHabit || undefined, // 添加习惯名称作为tag
          });
          itemIndex++;
        }
        continue;
      }

      // 如果没有匹配到行动点格式，但行不为空，可能是多行行动点的一部分
      if (items.length > 0 && !trimmed.match(/^[>#-]/)) {
        // 追加到上一个项目，清理markdown格式
        const lastItem = items[items.length - 1];
        if (lastItem) {
          lastItem.text += " " + cleanMarkdown(trimmed);
        }
      }
    }

    console.log("[TODO] Parsed todos:", { 
      total: items.length, 
      completed: items.filter(i => i.completed).length,
      completedItemsSize: completedItems.size 
    });

    return items;
  }, [content, completedItems]);

  const handleToggle = useCallback(
    (id: string) => {
      const item = todos.find((t) => t.id === id);
      if (item && onToggleItem) {
        const newCompleted = !item.completed;
        onToggleItem(id, newCompleted);
        
        // Trigger celebration when completing a todo
        if (newCompleted && onCelebration) {
          onCelebration();
        }
      }
    },
    [todos, onToggleItem, onCelebration]
  );

  const handleStartEdit = useCallback(
    (id: string, currentText: string) => {
      setEditingId(id);
      setEditText(currentText);
    },
    []
  );

  const handleSaveEdit = useCallback(
    (id: string) => {
      const item = todos.find((t) => t.id === id);
      if (onEditItem && editText.trim() && item) {
        onEditItem(id, item.text, editText.trim());
      }
      setEditingId(null);
      setEditText("");
    },
    [editText, onEditItem, todos]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
  }, []);

  if (todos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-base font-medium text-foreground">暂无内容</p>
          <p className="mt-3 text-sm text-muted-foreground">点击AI回答下方的「Do it!」可将行动点添加到此处</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {todos.map((todo) => (
        <div
          key={todo.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border p-3 transition-colors",
            todo.completed
              ? "bg-muted/50 border-muted"
              : "bg-background border-border hover:bg-muted/30"
          )}
        >
          <button
            type="button"
            onClick={() => handleToggle(todo.id)}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
              todo.completed
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30 hover:border-primary"
            )}
            aria-label={todo.completed ? "标记为未完成" : "标记为完成"}
          >
            {todo.completed && <Check className="h-3 w-3" />}
          </button>
          {editingId === todo.id ? (
            <div className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveEdit(todo.id);
                  } else if (e.key === "Escape") {
                    handleCancelEdit();
                  }
                }}
                className="flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleSaveEdit(todo.id)}
                className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded border px-2 py-1 text-xs hover:bg-muted"
              >
                取消
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <div
                  className={cn(
                    "text-sm",
                    todo.completed && "text-muted-foreground line-through"
                  )}
                >
                  {todo.text}
                </div>
                {todo.tag && (
                  <div className="mt-1">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {todo.tag}
                    </span>
                  </div>
                )}
              </div>
              {!todo.completed && onEditItem && (
                <button
                  type="button"
                  onClick={() => handleStartEdit(todo.id, todo.text)}
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="编辑"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

