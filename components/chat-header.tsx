"use client";

import Link from "next/link";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { TrashIcon, VoteIcon } from "./icons";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  onClearChat,
  onShowTodo,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  onClearChat?: () => void;
  onShowTodo?: () => void;
}) {
  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <Button
        className="order-1 h-8 px-2 md:hidden"
        onClick={onShowTodo}
        size="sm"
        variant="outline"
      >
        📋 待办
      </Button>

      <Button
        className="order-2 h-8 px-2 md:order-1 md:h-fit md:px-2"
        onClick={onClearChat}
        title="Clear conversation"
        variant="outline"
      >
        <TrashIcon />
        <span className="md:sr-only">Clear Chat</span>
      </Button>

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-3 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <Button
        asChild
        className="order-4 hidden border bg-background px-2 text-foreground hover:bg-muted md:order-3 md:ml-auto md:flex md:h-fit"
        variant="outline"
      >
        <Link
          href={"https://teko.woa.com/event/ai-agent/1691"}
          rel="noreferrer"
          target="_noblank"
        >
          <VoteIcon size={16} />
          球球了 投票支持一下吧～
        </Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.onClearChat === nextProps.onClearChat &&
    prevProps.onShowTodo === nextProps.onShowTodo
  );
});
