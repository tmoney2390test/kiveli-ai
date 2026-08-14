import type{DialogueContext,MemoryCandidate,PostConversationProposal}from'./types';

export interface DialogueProvider{stream(context:DialogueContext):AsyncIterable<string>}
export interface MemoryExtractionProvider{extract(input:{userMessage:string;assistantMessage:string}):Promise<MemoryCandidate[]>}
export interface EmbeddingProvider{embed(texts:readonly string[]):Promise<number[][]>}
export interface ModerationProvider{moderate(text:string):Promise<{allowed:boolean;categories:string[]}>}
export interface VoiceProvider{synthesize(text:string,voiceId:string):Promise<Uint8Array>}
export interface ImageProvider{generate(prompt:string):Promise<{url:string}>}
export interface ConversationAnalysisProvider{analyze(context:DialogueContext,assistantMessage:string):Promise<PostConversationProposal>}
