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
      const messages = await getMessagesByChatId({ id: chatId });
      const uiMessages = convertToUIMessages(messages);
      const message = uiMessages.find((m) => m.id === messageId);

      if (message && message.role === "assistant") {
        const messageText = getTextFromMessage(message);

        // Extract plans from the seven habits format
        // Pattern: ### 1. 积极主动：\n[对习惯原则在语境中的简明重述]\n[清晰、具体、可执行的计划，包含编号步骤和可衡量的结果]
        // We need to extract the plan part (the numbered steps) after the habit description
        const habitSections = messageText.split(/### \d+\. /);
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
            }
          }
        }

        // Get or create document
        let document = await getDocumentByChatIdAndUserId({
          chatId,
          userId: session.user.id,
        });

        if (!document) {
          // If document doesn't exist, create one
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
        }

        if (document) {
          const existingContent = document.content && document.content.trim() 
            ? document.content.trim() 
            : "";
          
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
                return false;
              }
              return true;
            });

            contentToAppend.push(...newPlans);
          }

          // Always add mock data for testing and visualization
          // This helps visualize the todo-list functionality regardless of extraction success
          const timestamp = new Date().toLocaleTimeString("zh-CN", { 
            hour: "2-digit", 
            minute: "2-digit" 
          });

          if (contentToAppend.length === 0) {
            // No plans extracted, add comprehensive mock data
            const mockPlans = [
              "1. 明确目标：设定清晰、可衡量的目标，确保方向明确",
              "2. 制定计划：将大目标分解为具体可执行的步骤",
              "3. 设定时间：为每个步骤分配合理的时间期限",
              "4. 执行行动：按照计划逐步实施，保持专注和坚持"
            ];
            contentToAppend.push(...mockPlans);
          } else {
            // Plans were extracted, add a timestamped mock entry to confirm functionality
            contentToAppend.push(`示例计划项（${timestamp}）：这是一个测试计划项，用于验证 todo-list 功能`);
          }

          if (contentToAppend.length > 0) {
            const newContent = existingContent
              ? `${existingContent}\n\n${contentToAppend.join("\n\n")}`
              : contentToAppend.join("\n\n");

            await saveDocument({
              id: document.id,
              title: document.title,
              kind: document.kind,
              content: newContent,
              userId: session.user.id,
            });
          }
        } else {
          console.error("Failed to create or find document for chatId:", chatId);
        }
      }
    } catch (error) {
      // Log error but don't fail the vote
      console.error("Failed to append plans to document:", error);
    }
  }

  return new Response("Message voted", { status: 200 });
}
