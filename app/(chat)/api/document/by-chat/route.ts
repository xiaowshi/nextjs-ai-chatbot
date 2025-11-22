import { auth } from "@/app/(auth)/auth";
import { getDocumentByChatIdAndUserId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

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
    return new ChatSDKError("unauthorized:document").toResponse();
  }

  const document = await getDocumentByChatIdAndUserId({
    chatId,
    userId: session.user.id,
  });

  if (!document) {
    return new ChatSDKError("not_found:document").toResponse();
  }

  return Response.json(document, { status: 200 });
}

