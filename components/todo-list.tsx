"use client";

import { useCallback, useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type TodoItem = {
  id: string;
  text: string;
  completed: boolean;
};

type TodoListProps = {
  content: string;
  completedItems?: Set<string>;
  onToggleItem?: (id: string, completed: boolean) => void;
};

export function TodoList({
  content,
  completedItems = new Set(),
  onToggleItem,
}: TodoListProps) {
  const todos = useMemo(() => {
    if (!content) return [];

    // 解析内容，提取计划项
    // 支持多种格式：
    // 1. 编号列表：1. xxx, 2. xxx
    // 2. 步骤：步骤1: xxx, 步骤2: xxx
    // 3. 中文章节号：一、xxx, 二、xxx
    // 4. 普通列表项：- xxx, * xxx

    const lines = content.split("\n");
    const items: TodoItem[] = [];
    let currentSection = "";
    let itemIndex = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 检查是否是标题或分隔符
      if (trimmed.startsWith("#") || trimmed.startsWith("---") || trimmed.startsWith("##")) {
        if (trimmed.startsWith("###")) {
          currentSection = trimmed.replace(/^###\s*/, "");
        }
        continue;
      }

      // 匹配各种列表格式
      const patterns = [
        /^(\d+)[\.、]\s*(.+)$/, // 1. xxx 或 1、xxx
        /^[一二三四五六七八九十]+[、.]\s*(.+)$/, // 一、xxx
        /^步骤\s*\d+[：:]\s*(.+)$/, // 步骤1: xxx
        /^[-*]\s*(.+)$/, // - xxx 或 * xxx
        /^(\d+)\s+(.+)$/, // 1 xxx (空格分隔)
      ];

      let matched = false;
      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const text = match[2] || match[1];
          if (text && text.length > 0) {
            const trimmedText = text.trim();
            // 使用文本内容的哈希作为 ID，确保稳定性
            const id = `${currentSection}-${trimmedText.slice(0, 50)}`;
            items.push({
              id,
              text: trimmedText,
              completed: completedItems.has(id),
            });
            itemIndex++;
            matched = true;
            break;
          }
        }
      }

      // 如果没有匹配到列表格式，但行不为空，可能是多行计划的一部分
      if (!matched && items.length > 0 && !trimmed.match(/^[-*#\d一二三四五六七八九十步骤]/)) {
        // 追加到上一个项目
        const lastItem = items[items.length - 1];
        if (lastItem) {
          lastItem.text += " " + trimmed;
        }
      }
    }

    return items;
  }, [content, completedItems]);

  const handleToggle = useCallback(
    (id: string) => {
      const item = todos.find((t) => t.id === id);
      if (item && onToggleItem) {
        onToggleItem(id, !item.completed);
      }
    },
    [todos, onToggleItem]
  );

  if (todos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暂无待办事项</p>
          <p className="mt-2 text-xs">当你点赞回答时，计划会被添加到此处</p>
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
          <div
            className={cn(
              "flex-1 text-sm",
              todo.completed && "text-muted-foreground line-through"
            )}
          >
            {todo.text}
          </div>
        </div>
      ))}
    </div>
  );
}

