export type { ChatMessage, AssistantOptions } from "./assistant";
export { sendMessage } from "./assistant";
export type { EntityType, EmbeddingMatch } from "./embeddings";
export { generateEmbedding, upsertEmbedding, indexProduct, semanticSearch } from "./embeddings";
export { useErpAssistant } from "./hooks";
