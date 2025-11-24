export const DEFAULT_CHAT_MODEL: string = "deepseek-v3";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    description:
      "Advanced multimodal model with text capabilities",
  },
];
