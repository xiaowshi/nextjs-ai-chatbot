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

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]?.trim() ?? "";

            // Skip the habit name line (ends with :)
            if (line.endsWith("：") || line.endsWith(":")) {
              continue;
            }

            // Check if we're entering the plan section (after habit description, before 思路链)
            if (line && !line.startsWith("- **思路链") && !line.startsWith("- **洞察") && !line.startsWith("---")) {
              // Check if this looks like a plan (contains numbers or steps)
              if (/^\d+\.|^[一二三四五六七八九十]+[、.]|^步骤|^计划/.test(line) || inPlanSection) {
                inPlanSection = true;
                planLines.push(line);

                // Stop if we hit 思路链 or 洞察
                if (line.includes("思路链") || line.includes("洞察")) {
                  break;
                }
              } else if (inPlanSection && line) {
                // Continue collecting if we're already in plan section
                planLines.push(line);
              }
            } else {
              // Stop if we hit 思路链 or 洞察
              if (line.includes("思路链") || line.includes("洞察")) {
                break;
              }
            }
          }

          if (planLines.length > 0) {
            const planText = planLines.join("\n").trim();
            if (planText) {
              plans.push(planText);
            }
          }
        }

        if (plans.length > 0) {
          const document = await getDocumentByChatIdAndUserId({
            chatId,
            userId: session.user.id,
          });

          if (document) {
            const newContent =
              document.content && document.content.trim()
                ? `${document.content}\n\n${plans.join("\n\n")}`
                : plans.join("\n\n");

            await saveDocument({
              id: document.id,
              title: document.title,
              kind: document.kind,
              content: newContent,
              userId: session.user.id,
            });
          }
        }
      }
    } catch (error) {
      // Log error but don't fail the vote
      console.error("Failed to append plans to document:", error);
    }
  }

  return new Response("Message voted", { status: 200 });
}
