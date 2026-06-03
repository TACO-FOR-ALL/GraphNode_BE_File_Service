import type { ImportJobMessage } from '../../shared/dtos/import';

export interface QueuePort {
  publishImportJob(message: ImportJobMessage): Promise<void>;
}
