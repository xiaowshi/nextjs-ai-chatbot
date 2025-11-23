import { auth } from "@/app/(auth)/auth";
import type { ArtifactKind } from "@/components/artifact";
import {
  deleteDocumentsByIdAfterTimestamp,
  getDocumentByChatIdAndUserId,
  getDocumentsById,
  saveDocument,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter id is missing"
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:document").toResponse();
  }

  const documents = await getDocumentsById({ id });

  const [document] = documents;

  if (!document) {
    return new ChatSDKError("not_found:document").toResponse();
  }

  if (document.userId !== session.user.id) {
    return new ChatSDKError("forbidden:document").toResponse();
  }

  return Response.json(documents, { status: 200 });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const chatId = searchParams.get("chatId");

  // Support both id (documentId) and chatId
  if (!id && !chatId) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter id or chatId is required."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("not_found:document").toResponse();
  }

  const {
    content,
    title,
    kind,
  }: { content: string; title: string; kind: ArtifactKind } =
    await request.json();

  let documentId = id;

  // If chatId is provided, get or create document by chatId
  if (chatId && !id) {
    let document = await getDocumentByChatIdAndUserId({
      chatId,
      userId: session.user.id,
    });

    if (!document) {
      // Create new document if it doesn't exist
      documentId = generateUUID();
      await saveDocument({
        id: documentId,
        title: title || "7-Habit Todo List",
        kind: kind || "text",
        content: content || "记录你的待办事项，帮助你成为高效人士",
        userId: session.user.id,
      });
    } else {
      documentId = document.id;
    }
  }

  if (!documentId) {
    return new ChatSDKError(
      "bad_request:api",
      "Failed to determine document id."
    ).toResponse();
  }

  const documents = await getDocumentsById({ id: documentId });

  if (documents.length > 0) {
    const [doc] = documents;

    if (doc.userId !== session.user.id) {
      return new ChatSDKError("forbidden:document").toResponse();
    }
  }

  const document = await saveDocument({
    id: documentId,
    content,
    title,
    kind,
    userId: session.user.id,
  });

  return Response.json(document, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const timestamp = searchParams.get("timestamp");

  if (!id) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter id is required."
    ).toResponse();
  }

  if (!timestamp) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter timestamp is required."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:document").toResponse();
  }

  const documents = await getDocumentsById({ id });

  const [document] = documents;

  if (document.userId !== session.user.id) {
    return new ChatSDKError("forbidden:document").toResponse();
  }

  const documentsDeleted = await deleteDocumentsByIdAfterTimestamp({
    id,
    timestamp: new Date(timestamp),
  });

  return Response.json(documentsDeleted, { status: 200 });
}
