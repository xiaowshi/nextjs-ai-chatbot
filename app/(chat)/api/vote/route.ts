import { auth } from "@/app/(auth)/auth";
import {
  getChatById,
  getDocumentByChatIdAndUserId,
  getMessagesByChatId,
  getVotesByChatId,
  saveDocument,
  voteMessage,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getTextFromMessage } from "@/lib/utils";
import { convertToUIMessages } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter chatId is required."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:vote").toResponse();
  }

  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:vote").toResponse();
  }

  const votes = await getVotesByChatId({ id: chatId });

  return Response.json(votes, { status: 200 });
}

export async function PATCH(request: Request) {
  const {
    chatId,
    messageId,
    type,
  }: { chatId: string; messageId: string; type: "up" | "down" } =
    await request.json();

  if (!chatId || !messageId || !type) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameters chatId, messageId, and type are required."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:vote").toResponse();
  }

  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return new ChatSDKError("not_found:vote").toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:vote").toResponse();
  }

  await voteMessage({
    chatId,
    messageId,
    type,
  });

  // If upvoted, extract plans from message and append to document
  if (type === "up") {
    try {
      console.log("[UPVOTE] Starting upvote process", { chatId, messageId });
      
      const messages = await getMessagesByChatId({ id: chatId });
      console.log("[UPVOTE] Fetched messages count:", messages.length);
      
      const uiMessages = convertToUIMessages(messages);
      const message = uiMessages.find((m) => m.id === messageId);
      console.log("[UPVOTE] Found message:", message ? { id: message.id, role: message.role } : "not found");

      if (message && message.role === "assistant") {
        const messageText = getTextFromMessage(message);
        console.log("[UPVOTE] Message text length:", messageText.length);
        console.log("[UPVOTE] Message text preview:", messageText.substring(0, 200));

        // Extract plans from the seven habits format
        // Pattern: ### 1. 积极主动：\n[对习惯原则在语境中的简明重述]\n[清晰、具体、可执行的计划，包含编号步骤和可衡量的结果]
        // We need to extract the plan part (the numbered steps) after the habit description
        const habitSections = messageText.split(/### \d+\. /);
        console.log("[UPVOTE] Habit sections found:", habitSections.length - 1);
        const plans: string[] = [];

        for (const section of habitSections.slice(1)) {
          // Split by lines and find the plan part
          const lines = section.split("\n");
          let inPlanSection = false;
          let planLines: string[] = [];
          let skippedHabitName = false;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]?.trim() ?? "";

            // Skip empty lines at the start
            if (!line) {
              if (inPlanSection) {
                // Empty line in plan section, keep it for formatting
                planLines.push("");
              }
              continue;
            }

            // Skip the habit name line (ends with : or ：)
            if (!skippedHabitName && (line.endsWith("：") || line.endsWith(":"))) {
              skippedHabitName = true;
              continue;
            }

            // Stop if we hit 思路链 or 洞察 or 荟萃分析
            if (
              line.includes("思路链") ||
              line.includes("洞察") ||
              line.includes("荟萃分析") ||
              line.startsWith("---")
            ) {
              break;
            }

            // Check if this looks like a plan item (starts with number, Chinese number, or step)
            // Match patterns like: "1. xxx", "1、xxx", "一、xxx", "步骤1: xxx"
            const isPlanItem = /^\d+[\.、]\s+.+|^[一二三四五六七八九十]+[、.]\s+.+|^步骤\s*\d+[：:]\s+.+/.test(line);

            if (isPlanItem) {
              inPlanSection = true;
              planLines.push(line);
            } else if (inPlanSection) {
              // If we're already in plan section, continue collecting (might be multi-line plan)
              // But stop if we see a markdown header or separator
              if (line.startsWith("#") || line.startsWith("---")) {
                break;
              }
              // Continue collecting if it's part of the plan (not a new section)
              planLines.push(line);
            }
          }

          if (planLines.length > 0) {
            const planText = planLines
              .filter((l) => l.trim().length > 0) // Remove empty lines
              .join("\n")
              .trim();
            if (planText) {
              plans.push(planText);
              console.log("[UPVOTE] Extracted plan:", planText.substring(0, 100));
            }
          }
        }

        console.log("[UPVOTE] Total plans extracted:", plans.length);
        if (plans.length === 0) {
          console.log("[UPVOTE] WARNING: No plans extracted from message");
        }

        // Get or create document
        let document = await getDocumentByChatIdAndUserId({
          chatId,
          userId: session.user.id,
        });
        console.log("[UPVOTE] Document found:", document ? "yes" : "no");

        if (!document) {
          // If document doesn't exist, create one
          console.log("[UPVOTE] Creating new document");
          const { generateUUID } = await import("@/lib/utils");
          const documentId = generateUUID();
          const { saveDocument } = await import("@/lib/db/queries");
          
          await saveDocument({
            id: documentId,
            title: "7-Habit Todo List",
            kind: "text",
            content: "记录你的待办事项，帮助你成为高效人士",
            userId: session.user.id,
          });
          
          document = await getDocumentByChatIdAndUserId({
            chatId,
            userId: session.user.id,
          });
          console.log("[UPVOTE] Document created:", document ? "yes" : "no");
        }

        if (document) {
          const existingContent = document.content && document.content.trim() 
            ? document.content.trim() 
            : "";
          console.log("[UPVOTE] Existing content length:", existingContent.length);
          
          let contentToAppend: string[] = [];

          // If plans were extracted, add them
          if (plans.length > 0) {
            // Only append new plans that don't already exist
            const newPlans = plans.filter(plan => {
              // Check if this plan (or similar) already exists in content
              const planLines = plan.split("\n").filter(l => l.trim());
              if (planLines.length === 0) return false;
              
              // Check if first line of plan already exists
              const firstLine = planLines[0]?.trim();
              if (firstLine && existingContent.includes(firstLine)) {
                console.log("[UPVOTE] Plan already exists, skipping:", firstLine.substring(0, 50));
                return false;
              }
              return true;
            });

            console.log("[UPVOTE] New plans after filtering:", newPlans.length);
            contentToAppend.push(...newPlans);
          } else {
            // If no content was extracted, append default message
            console.log("[UPVOTE] No content extracted, appending default message");
            contentToAppend.push("不好意思请重试");
          }

          if (contentToAppend.length > 0) {
            const newContent = existingContent
              ? `${existingContent}\n\n${contentToAppend.join("\n\n")}`
              : contentToAppend.join("\n\n");

            console.log("[UPVOTE] Saving document with new content length:", newContent.length);
            await saveDocument({
              id: document.id,
              title: document.title,
              kind: document.kind,
              content: newContent,
              userId: session.user.id,
            });
            console.log("[UPVOTE] Document saved successfully");
          } else {
            console.log("[UPVOTE] WARNING: No content to append");
          }
        } else {
          console.log("[UPVOTE] ERROR: Document not found after creation");
        }
      } else {
        console.log("[UPVOTE] Message not found or not assistant message");
      }
    } catch (error) {
      // Log error but don't fail the vote
      console.error("[UPVOTE] Failed to append plans to document:", error);
      if (error instanceof Error) {
        console.error("[UPVOTE] Error stack:", error.stack);
      }
    }
  }

  return new Response("Message voted", { status: 200 });
}
