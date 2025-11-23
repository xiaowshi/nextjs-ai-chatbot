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
      console.log("[TODO] Toggle todo:", { id, completed, currentMetadata: metadata });
      
      if (setMetadata) {
        setMetadata((current) => {
          // Always create a new Set to ensure React detects the change
          const completedTodos = new Set(current?.completedTodos || []);
          const previousSize = completedTodos.size;
          
          if (completed) {
            completedTodos.add(id);
            // Show celebration when completing
            setShowCelebration(true);
          } else {
            completedTodos.delete(id);
          }
          
          const newSize = completedTodos.size;
          console.log("[TODO] Updated completedTodos:", { 
            id, 
            completed, 
            previousSize, 
            newSize,
            hasId: completedTodos.has(id)
          });
          
          // Save version when toggling todo (both complete and uncomplete)
          onSaveContent(content, false);
          
          // Return new object with new Set to ensure React re-renders
          return {
            ...current,
            completedTodos: new Set(completedTodos), // Create new Set instance
          };
        });
      } else {
        console.log("[TODO] ERROR: setMetadata is not available");
      }
    };

    const handleEditTodo = (id: string, originalText: string, newText: string) => {
      // Find the todo item in content and replace it
      const lines = content.split("\n");
      let found = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if this line contains the original text (more flexible matching)
        if (trimmed.includes(originalText) || originalText.includes(trimmed.split(/\s+/).slice(1).join(" "))) {
          // Match various list formats to extract prefix
          const patterns = [
            /^(\d+[\.、])\s*(.+)$/,
            /^([一二三四五六七八九十]+[、.])\s*(.+)$/,
            /^(步骤\s*\d+[：:])\s*(.+)$/,
            /^([-*])\s*(.+)$/,
            /^(\d+\s+)(.+)$/,
          ];

          let prefix = "";
          for (const pattern of patterns) {
            const match = trimmed.match(pattern);
            if (match) {
              prefix = match[1] ?? "";
              break;
            }
          }

          // Replace the line with new text, preserving prefix and original indentation
          const indent = line.match(/^(\s*)/)?.[1] ?? "";
          lines[i] = prefix ? `${indent}${prefix} ${newText}` : `${indent}${newText}`;
          found = true;
          break;
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
