/**
 * 모듈: DI 컨테이너 (File Service)
 *
 * GraphNode BE `bootstrap/container.ts`와 같이
 * 서비스·어댑터 인스턴스를 한 곳에서 조립합니다.
 */
import { ImportJobService } from '../core/services/ImportJobService';
import { ImportProcessingService } from '../core/services/ImportProcessingService';
import { PresignService } from '../core/services/PresignService';
import { S3Adapter } from '../infra/aws/S3Adapter';
import { SqsPublisher } from '../infra/aws/SqsPublisher';
import { ImportJobRepositoryPrisma } from '../infra/repositories/ImportJobRepositoryPrisma';

let singleton: AppContainer | null = null;

export class AppContainer {
  readonly storage = new S3Adapter();
  readonly queue = new SqsPublisher();
  readonly importJobRepo = new ImportJobRepositoryPrisma();

  readonly importJobService = new ImportJobService(this.importJobRepo, this.storage, this.queue);
  readonly importProcessingService = new ImportProcessingService(this.importJobRepo, this.storage);
  readonly presignService = new PresignService(this.importJobRepo, this.storage);
}

export function getContainer(): AppContainer {
  if (!singleton) singleton = new AppContainer();
  return singleton;
}
