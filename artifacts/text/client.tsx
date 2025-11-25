import { useState } from "react";
import { toast } from "sonner";
import { Artifact } from "@/components/create-artifact";
import { Celebration } from "@/components/celebration";
import { DiffView } from "@/components/diffview";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  ClockRewind,
  CopyIcon,
  RedoIcon,
  UndoIcon,
} from "@/components/icons";
import { Editor } from "@/components/text-editor";
import { TodoList } from "@/components/todo-list";
import type { Suggestion } from "@/lib/db/schema";
import { getSuggestions } from "../actions";

type TextArtifactMetadata = {
  suggestions: Suggestion[];
  completedTodos?: Set<string>;
};

export const textArtifact = new Artifact<"text", TextArtifactMetadata>({
  kind: "text",
  description: "Useful for text content, like drafting essays and emails.",
  initialize: async ({ documentId, setMetadata }) => {
    const suggestions = await getSuggestions({ documentId });

    setMetadata((current) => ({
      suggestions,
      completedTodos: current?.completedTodos || new Set<string>(),
    }));
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === "data-suggestion") {
      setMetadata((metadata) => {
        return {
          suggestions: [...metadata.suggestions, streamPart.data],
        };
      });
    }

    if (streamPart.type === "data-textDelta") {
      setArtifact((draftArtifact) => {
        return {
          ...draftArtifact,
          content: draftArtifact.content + streamPart.data,
          isVisible:
            draftArtifact.status === "streaming" &&
            draftArtifact.content.length > 400 &&
            draftArtifact.content.length < 450
              ? true
              : draftArtifact.isVisible,
          status: "streaming",
        };
      });
    }
  },
  content: ({
    mode,
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
    setMetadata,
  }) => {
    const [showCelebration, setShowCelebration] = useState(false);

    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    if (mode === "diff") {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return <DiffView newContent={newContent} oldContent={oldContent} />;
    }

    const handleToggleTodo = (id: string, completed: boolean) => {
      // When completing a todo, delete it from content instead of marking as completed
      if (completed) {
        // Find the todo item by id and remove it from content
        // Use the same parsing logic as TodoList to ensure consistency
        const lines = content.split("\n");
        const newLines: string[] = [];
        let currentHabit = "";
        let itemIndex = 0;
        let found = false;
        let skipNextLines = false; // Track if we should skip continuation lines
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          const trimmed = line.trim();
          
          // If we're skipping continuation lines, check if this is one
          if (skipNextLines) {
            // If this line matches a new format (habit, action, or empty), stop skipping
            // Same logic as TodoList: if line doesn't match /^[>#-]/, it might be continuation
            const isNewFormat = trimmed.match(/^>\s*###\s*(.+)$/) || 
                               trimmed.match(/^###\s*(.+)$/) ||
                               trimmed.match(/^>\s*-\s*(.+)$/) || 
                               trimmed.match(/^-\s*(.+)$/) ||
                               trimmed === "";
            
            if (isNewFormat) {
              skipNextLines = false;
            } else {
              // This is a continuation line (doesn't start with >, #, or -), skip it
              continue;
            }
          }
          
          // Match habit name: > ### [habit] or ### [habit]
          const habitMatch = trimmed.match(/^>\s*###\s*(.+)$/) || trimmed.match(/^###\s*(.+)$/);
          if (habitMatch) {
            currentHabit = habitMatch[1]?.trim() ?? "";
            newLines.push(line);
            continue;
          }
          
          // Match action point: > - [text] or - [text]
          const actionMatch = trimmed.match(/^>\s*-\s*(.+)$/) || trimmed.match(/^-\s*(.+)$/);
          if (actionMatch) {
            const actionText = actionMatch[1]?.trim() ?? "";
            if (actionText && actionText.length > 0) {
              // Generate the same ID as TodoList uses
              const todoId = `${currentHabit}-${itemIndex}-${actionText.slice(0, 50)}`;
              
              // If this is the todo to delete, skip it and mark to skip continuation lines
              if (todoId === id) {
                found = true;
                // Show celebration when completing
                setShowCelebration(true);
                // Don't add this line to newLines (delete it)
                // Mark to skip continuation lines that might belong to this todo
                // Continuation lines are those that don't match /^[>#-]/
                skipNextLines = true;
                itemIndex++;
                continue;
              }
              itemIndex++;
            }
            // Keep the action line if it's not the one to delete
            newLines.push(line);
            continue;
          }
          
          // If line doesn't match habit or action format, it might be a continuation line
          // But if we're not skipping, it's just a regular line, keep it
          if (!skipNextLines) {
            newLines.push(line);
          }
        }
        
        if (found) {
          const newContent = newLines.join("\n");
          onSaveContent(newContent, false);
          // toast.success("待办事项已完成");
        } else {
          toast.error("无法找到要完成的待办事项");
        }
      } else {
        // If uncompleting (shouldn't happen if we delete completed items)
        // But keep this for backward compatibility
        if (setMetadata) {
          setMetadata((current) => {
            const completedTodos = new Set(current?.completedTodos || []);
            completedTodos.delete(id);
            return {
              ...current,
              completedTodos,
            };
          });
        }
      }
    };

    const handleEditTodo = (id: string, originalText: string, newText: string) => {
      // Find the todo item in content and replace it
      // Match the same format that TodoList uses: "> - [text]" or "- [text]"
      const lines = content.split("\n");
      let found = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Match action points: "> - [text]" or "- [text]" (same as TodoList parsing)
        const actionMatch = trimmed.match(/^>\s*-\s*(.+)$/) || trimmed.match(/^-\s*(.+)$/);
        
        if (actionMatch) {
          const actionText = actionMatch[1]?.trim() ?? "";
          
          // Check if this line matches the original text
          // Use exact match or contains match for flexibility
          const textMatches = actionText === originalText.trim() || 
                             actionText.includes(originalText.trim()) ||
                             originalText.trim().includes(actionText);

          if (textMatches) {
            // Preserve the original line structure (indentation and "> " prefix)
            const indent = line.match(/^(\s*)/)?.[1] ?? "";
            const hasQuotePrefix = trimmed.startsWith("> ");
            
            // Reconstruct the line with new text, preserving format
            if (hasQuotePrefix) {
              lines[i] = `${indent}> - ${newText}`;
            } else {
              lines[i] = `${indent}- ${newText}`;
            }
            
            found = true;
            break;
          }
        }
      }

      if (found) {
        const newContent = lines.join("\n");
        onSaveContent(newContent, false);
        toast.success("待办事项已更新");
      } else {
        toast.error("无法找到要编辑的待办事项");
      }
    };

    return (
      <div className="flex h-full flex-col">
        <Celebration
          show={showCelebration}
          onComplete={() => setShowCelebration(false)}
        />
        <TodoList
          content={content}
          completedItems={metadata?.completedTodos}
          onToggleItem={handleToggleTodo}
          onEditItem={handleEditTodo}
          onCelebration={() => setShowCelebration(true)}
        />
      </div>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: "View changes",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("toggle");
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: "View Previous version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: "View Next version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: "Copy to clipboard",
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("Copied to clipboard!");
      },
    },
  ],
  toolbar: [],
});
