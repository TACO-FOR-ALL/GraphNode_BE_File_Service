/**
 * BFF ↔ File Service ↔ Worker 간 import 관련 DTO.
 * GraphNode SDK types와 필드 맞추는 작업은 BFF 연동 시 진행.
 */

export type ProviderSlug = string;

export interface ProviderDescriptor {
  slug: ProviderSlug;
  label: string;
  enabled: boolean;
  reason?: 'coming_soon' | 'disabled';
}

export interface ImportUploadInitDto {
  jobId: string;
  status: 'pending_upload';
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAt: string;
  stagingKey: string;
}

export type ImportFinalizeStatus = 'none' | 'finalizing' | 'finalized' | 'failed';

export interface ImportJobStatusDto {
  jobId: string;
  status: string;
  progress: number;
  stats?: Record<string, unknown>;
  error?: { code: string; detail?: string };
  createdAt: string;
  completedAt?: string;
  finalizeStatus?: ImportFinalizeStatus;
  finalizedAt?: string;
  finalizeConversationIds?: string[];
  finalizeError?: string;
}

export interface ImportResultRefDto {
  jobId: string;
  userId: string;
  provider: string;
  resultS3Key: string;
  stats?: Record<string, unknown>;
}

export type ImportFinalizeClaimState = 'claimed' | 'already_finalized' | 'in_progress';

export interface ImportFinalizeClaimDto {
  claim: ImportFinalizeClaimState;
  jobId: string;
  provider: string;
  resultS3Key: string;
  conversationIds?: string[];
}

export interface PresignedAccessResponse {
  url: string;
  expiresAt: string;
  fileId: string;
  mimeType: string;
  name: string;
}

export interface ImportAttachmentDto {
  id: string;
  type: 'image' | 'file';
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ImportMessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  attachments?: ImportAttachmentDto[];
}

export interface ImportConversationDto {
  id: string;
  title: string;
  messages: ImportMessageDto[];
}

export interface ImportCompleteDto {
  jobId: string;
  userId: string;
  provider: string;
  conversations: ImportConversationDto[];
  unresolvedLinks?: Array<{ providerMessageKey: string; reason: string }>;
}

export interface ImportJobMessage {
  jobId: string;
  userId: string;
  provider: string;
  stagingS3Key: string;
  attempt?: number;
}
