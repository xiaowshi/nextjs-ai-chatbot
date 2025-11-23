export const DEFAULT_CHAT_MODEL: string = "chat-model";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "chat-model",
    name: "Grok Vision",
    description: "Advanced multimodal model with text capabilities",
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    description:
      "Advanced multimodal model with text capabilities",
  },
];
