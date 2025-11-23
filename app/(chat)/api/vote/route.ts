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
        // Support multiple patterns:
        // 1. ### 1. 积极主动：\n[计划内容]
        // 2. > ### 以终为始\n> - [计划内容]
        // 3. ### 要事第一\n- [计划内容]
        console.log("[UPVOTE] Full message text:", messageText);
        
        const plans: string[] = [];
        const debugLogs: string[] = [];
        
        // Pattern 1: Split by numbered habits: ### 1. 习惯名称：
        let habitSections = messageText.split(/### \d+\. /);
        debugLogs.push(`[UPVOTE] Pattern 1 (numbered): Found ${habitSections.length - 1} sections`);
        
        // Pattern 2: Split by > ### 习惯名称 (with quote prefix)
        if (habitSections.length === 1) {
          habitSections = messageText.split(/>\s*###\s+/);
          debugLogs.push(`[UPVOTE] Pattern 2 (with >): Found ${habitSections.length - 1} sections`);
        }
        
        // Pattern 3: Split by ### 习惯名称 (without number or quote)
        if (habitSections.length === 1) {
          habitSections = messageText.split(/###\s+/);
          debugLogs.push(`[UPVOTE] Pattern 3 (simple): Found ${habitSections.length - 1} sections`);
        }

        console.log("[UPVOTE] Habit sections found:", habitSections.length - 1);
        debugLogs.push(`[UPVOTE] Total habit sections: ${habitSections.length - 1}`);

        for (let sectionIndex = 0; sectionIndex < habitSections.slice(1).length; sectionIndex++) {
          const section = habitSections[sectionIndex + 1];
          debugLogs.push(`[UPVOTE] Processing section ${sectionIndex + 1}, length: ${section.length}`);
          
          // Split by lines and find the plan part
          const lines = section.split("\n");
          let inPlanSection = false;
          let planLines: string[] = [];
          let skippedHabitName = false;
          let habitName = "";

          for (let i = 0; i < lines.length; i++) {
            const originalLine = lines[i] ?? "";
            const line = originalLine.trim();

            // Skip empty lines at the start
            if (!line) {
              if (inPlanSection) {
                // Empty line in plan section, keep it for formatting
                planLines.push("");
              }
              continue;
            }

            // Extract habit name from first non-empty line
            if (!skippedHabitName) {
              // Remove > prefix if present
              const cleanLine = line.replace(/^>\s*/, "");
              // Extract habit name (remove : or ： at end)
              habitName = cleanLine.replace(/[：:]\s*$/, "").trim();
              skippedHabitName = true;
              debugLogs.push(`[UPVOTE] Section ${sectionIndex + 1} habit name: ${habitName}`);
              continue;
            }

            // Stop if we hit 思路链 or 洞察 or 荟萃分析
            if (
              line.includes("思路链") ||
              line.includes("洞察") ||
              line.includes("荟萃分析") ||
              line.startsWith("---")
            ) {
              debugLogs.push(`[UPVOTE] Section ${sectionIndex + 1} stopped at: ${line.substring(0, 50)}`);
              break;
            }

            // Check if this looks like a plan item
            // Match patterns like: "> - xxx", "- xxx", "1. xxx", "1、xxx", "一、xxx", "步骤1: xxx"
            const cleanLine = line.replace(/^>\s*/, ""); // Remove > prefix
            const isPlanItem = /^[-*]\s+.+|^\d+[\.、]\s+.+|^[一二三四五六七八九十]+[、.]\s+.+|^步骤\s*\d+[：:]\s+.+/.test(cleanLine);

            if (isPlanItem) {
              inPlanSection = true;
              planLines.push(cleanLine);
              debugLogs.push(`[UPVOTE] Section ${sectionIndex + 1} plan item: ${cleanLine.substring(0, 50)}`);
            } else if (inPlanSection) {
              // If we're already in plan section, continue collecting (might be multi-line plan)
              // But stop if we see a markdown header or separator
              if (cleanLine.startsWith("#") || cleanLine.startsWith("---")) {
                debugLogs.push(`[UPVOTE] Section ${sectionIndex + 1} stopped at markdown header`);
                break;
              }
              // Continue collecting if it's part of the plan (not a new section)
              // Only add if it's not another habit header
              if (!cleanLine.match(/^###\s+/)) {
                planLines.push(cleanLine);
              } else {
                break;
              }
            }
          }

          if (planLines.length > 0) {
            // Add habit name as header if we have one
            let planText = planLines
              .filter((l) => l.trim().length > 0) // Remove empty lines
              .join("\n")
              .trim();
            
            if (planText) {
              // Format: ### [习惯名称]\n[计划内容]
              if (habitName) {
                planText = `### ${habitName}\n${planText}`;
              }
              plans.push(planText);
              console.log("[UPVOTE] Extracted plan:", planText.substring(0, 100));
              debugLogs.push(`[UPVOTE] Section ${sectionIndex + 1} extracted plan length: ${planText.length}`);
            }
          } else {
            debugLogs.push(`[UPVOTE] Section ${sectionIndex + 1} no plan items found`);
          }
        }

        console.log("[UPVOTE] Total plans extracted:", plans.length);
        debugLogs.push(`[UPVOTE] Total plans extracted: ${plans.length}`);
        
        if (plans.length === 0) {
          console.log("[UPVOTE] WARNING: No plans extracted from message");
          debugLogs.push("[UPVOTE] WARNING: No plans extracted from message");
          // Add debug info to help diagnose
          debugLogs.push(`[UPVOTE] Message text sample: ${messageText.substring(0, 500)}`);
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
            // If no content was extracted, append debug logs and default message
            console.log("[UPVOTE] No content extracted, appending debug logs and default message");
            const debugInfo = debugLogs.join("\n");
            contentToAppend.push(`## 调试信息\n${debugInfo}\n\n不好意思请重试`);
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
