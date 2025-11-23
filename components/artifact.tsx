import type { UseChatHelpers } from "@ai-sdk/react";
import { formatDistance } from "date-fns";
import equal from "fast-deep-equal";
import { AnimatePresence } from "framer-motion";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { useDebounceCallback } from "usehooks-ts";
import { textArtifact } from "@/artifacts/text/client";
import { useArtifact } from "@/hooks/use-artifact";
import type { Document, Vote } from "@/lib/db/schema";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher } from "@/lib/utils";
import { ArtifactActions } from "./artifact-actions";
import { ArtifactMessages } from "./artifact-messages";
import { MultimodalInput } from "./multimodal-input";
import { Toolbar } from "./toolbar";
import { VersionFooter } from "./version-footer";
import type { VisibilityType } from "./visibility-selector";

export const artifactDefinitions = [
  textArtifact,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]["kind"];

export type UIArtifact = {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: "streaming" | "idle";
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};

function PureArtifact({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  sendMessage,
  messages,
  setMessages,
  regenerate,
  votes,
  isReadonly,
  selectedVisibilityType,
  selectedModelId,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  votes: Vote[] | undefined;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
}) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

  // Reset artifact when chatId changes
  useEffect(() => {
    setArtifact({
      documentId: "init",
      title: "7-Habit Todo List",
      kind: "text",
      content: "",
      status: "idle",
      isVisible: true,
      boundingBox: {
        top: 0,
        left: 0,
        width: 0,
        height: 0,
      },
    });
    // Reset metadata but preserve structure
    setMetadata({
      suggestions: [],
      completedTodos: new Set<string>(),
    });
  }, [chatId, setArtifact, setMetadata]);

  // Fetch document by chatId if documentId is "init"
  const { data: documentByChat, error: documentByChatError } = useSWR<Document>(
    artifact.documentId === "init" && chatId
      ? `/api/document/by-chat?chatId=${chatId}`
      : null,
    fetcher
  );

  // Set documentId when document is found
  useEffect(() => {
    if (documentByChat && artifact.documentId === "init") {
      // Check if content is just the default placeholder text
      const defaultContent = "记录你的待办事项，帮助你成为高效人士";
      const content = documentByChat.content ?? "";
      const isEmpty = !content || content.trim() === "" || content.trim() === defaultContent;
      
      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        documentId: documentByChat.id,
        title: documentByChat.title,
        kind: documentByChat.kind,
        content: isEmpty ? "" : content,
      }));
    } else if (documentByChatError && artifact.documentId === "init") {
      // If document not found, keep content empty to show "暂无待办事项"
      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        content: "",
      }));
    }
  }, [documentByChat, documentByChatError, artifact.documentId, setArtifact]);

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Document[]>(
    artifact.documentId !== "init" && artifact.status !== "streaming"
      ? `/api/document?id=${artifact.documentId}`
      : null,
    fetcher
  );

  const [mode, setMode] = useState<"edit" | "diff">("edit");
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);


  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);

      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        
        // Check if content is just the default placeholder text
        const defaultContent = "记录你的待办事项，帮助你成为高效人士";
        const content = mostRecentDocument.content ?? "";
        const isEmpty = !content || content.trim() === "" || content.trim() === defaultContent;
        
        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          content: isEmpty ? "" : content,
        }));
        
        // Ensure metadata is initialized when document loads
        if (!metadata || !metadata.completedTodos) {
          setMetadata({
            suggestions: metadata?.suggestions || [],
            completedTodos: new Set<string>(),
          });
        }
      }
    }
  }, [documents, setArtifact, metadata, setMetadata]);

  useEffect(() => {
    mutateDocuments();
  }, [mutateDocuments]);

  // Refresh documents when votes change (after upvote)
  useEffect(() => {
    if (artifact.documentId !== "init") {
      mutateDocuments();
    }
  }, [votes, artifact.documentId, mutateDocuments]);

  const { mutate } = useSWRConfig();
  const [isContentDirty, setIsContentDirty] = useState(false);

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!artifact) {
        return;
      }

      // Use chatId if documentId is "init", otherwise use documentId
      const apiUrl = artifact.documentId === "init" 
        ? `/api/document?chatId=${chatId}`
        : `/api/document?id=${artifact.documentId}`;
      
      const cacheKey = artifact.documentId === "init"
        ? `/api/document/by-chat?chatId=${chatId}`
        : `/api/document?id=${artifact.documentId}`;

      mutate<Document[] | Document>(
        cacheKey,
        async (currentData: Document[] | Document | undefined) => {
          // Handle both array (from /api/document?id=) and single document (from /api/document/by-chat)
          const currentDocuments = Array.isArray(currentData) ? currentData : (currentData ? [currentData] : []);
          const currentDocument = currentDocuments.at(-1);

          if (!currentDocument) {
            // If no document exists, create one
            const response = await fetch(apiUrl, {
              method: "POST",
              body: JSON.stringify({
                title: artifact.title || "7-Habit Todo List",
                content: updatedContent,
                kind: artifact.kind || "text",
              }),
            });

            if (!response.ok) {
              setIsContentDirty(false);
              return currentData;
            }

            const newDocument = await response.json();
            setIsContentDirty(false);

            // Update artifact with new documentId if it was "init"
            if (artifact.documentId === "init" && newDocument[0]?.id) {
              setArtifact((currentArtifact) => ({
                ...currentArtifact,
                documentId: newDocument[0].id,
              }));
            }

            return Array.isArray(newDocument) ? newDocument : [newDocument];
          }

          if (currentDocument.content !== updatedContent) {
            await fetch(apiUrl, {
              method: "POST",
              body: JSON.stringify({
                title: artifact.title,
                content: updatedContent,
                kind: artifact.kind,
              }),
            });

            setIsContentDirty(false);

            const newDocument = {
              ...currentDocument,
              content: updatedContent,
              createdAt: new Date(),
            };

            return [...currentDocuments, newDocument];
          }
          return currentData;
        },
        { revalidate: false }
      );
    },
    [artifact, chatId, mutate, setArtifact]
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean) => {
      if (document && updatedContent !== document.content) {
        setIsContentDirty(true);

        if (debounce) {
          debouncedHandleContentChange(updatedContent);
        } else {
          handleContentChange(updatedContent);
        }
      }
    },
    [document, debouncedHandleContentChange, handleContentChange]
  );

  function getDocumentContentById(index: number) {
    if (!documents) {
      return "";
    }
    if (!documents[index]) {
      return "";
    }
    return documents[index].content ?? "";
  }

  const handleVersionChange = (type: "next" | "prev" | "toggle" | "latest") => {
    if (!documents) {
      return;
    }

    if (type === "latest") {
      setCurrentVersionIndex(documents.length - 1);
      setMode("edit");
    }

    if (type === "toggle") {
      setMode((currentMode) => (currentMode === "edit" ? "diff" : "edit"));
    }

    if (type === "prev") {
      if (currentVersionIndex > 0) {
        setCurrentVersionIndex((index) => index - 1);
      }
    } else if (type === "next" && currentVersionIndex < documents.length - 1) {
      setCurrentVersionIndex((index) => index + 1);
    }
  };

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  /*
   * NOTE: if there are no documents, or if
   * the documents are being fetched, then
   * we mark it as the current version.
   */

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;


  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind
  );

  if (!artifactDefinition) {
    throw new Error("Artifact definition not found!");
  }

  useEffect(() => {
    if (artifact.documentId !== "init" && artifactDefinition.initialize) {
      artifactDefinition.initialize({
        documentId: artifact.documentId,
        setMetadata,
      });
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  return (
    <div
      className="hidden h-dvh w-[400px] shrink-0 flex-col border-l border-zinc-200 bg-background md:flex dark:border-zinc-700 dark:bg-muted"
      data-testid="artifact"
    >
      <div className="flex flex-row items-start justify-between p-2">
        <div className="flex flex-row items-start gap-4">
          <div className="flex flex-col">
            <div className="font-medium">{artifact.title || "7-Habit Todo List"}</div>

            {isContentDirty ? (
              <div className="text-muted-foreground text-sm">
                Saving changes...
              </div>
            ) : document ? (
              <div className="text-muted-foreground text-sm">
                {`Updated ${formatDistance(
                  new Date(document.createdAt),
                  new Date(),
                  {
                    addSuffix: true,
                  }
                )}`}
              </div>
            ) : (
              <div className="mt-2 h-3 w-32 animate-pulse rounded-md bg-muted-foreground/20" />
            )}
          </div>
        </div>

        <ArtifactActions
          artifact={artifact}
          currentVersionIndex={currentVersionIndex}
          handleVersionChange={handleVersionChange}
          isCurrentVersion={isCurrentVersion}
          metadata={metadata}
          mode={mode}
          setMetadata={setMetadata}
        />
      </div>

      <div className="flex-1 overflow-y-scroll bg-background dark:bg-muted">
        <artifactDefinition.content
          content={
            isCurrentVersion
              ? artifact.content
              : getDocumentContentById(currentVersionIndex)
          }
          currentVersionIndex={currentVersionIndex}
          getDocumentContentById={getDocumentContentById}
          isCurrentVersion={isCurrentVersion}
          isInline={false}
          isLoading={isDocumentsFetching && !artifact.content}
          metadata={metadata}
          mode={mode}
          onSaveContent={saveContent}
          setMetadata={setMetadata}
          status={artifact.status}
          suggestions={[]}
          title={artifact.title}
        />

        <AnimatePresence>
          {isCurrentVersion && (
            <Toolbar
              artifactKind={artifact.kind}
              isToolbarVisible={isToolbarVisible}
              sendMessage={sendMessage}
              setIsToolbarVisible={setIsToolbarVisible}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {!isCurrentVersion && (
          <VersionFooter
            currentVersionIndex={currentVersionIndex}
            documents={documents}
            handleVersionChange={handleVersionChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }
  if (prevProps.input !== nextProps.input) {
    return false;
  }
  if (!equal(prevProps.messages, nextProps.messages.length)) {
    return false;
  }
  if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
    return false;
  }

  return true;
});
