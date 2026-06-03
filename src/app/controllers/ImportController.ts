/**
 * 모듈: ImportController
 *
 * BFF가 프록시하는 /internal/* HTTP 핸들러.
 */
import type { Request, Response } from 'express';

import type { ImportJobService } from '../../core/services/ImportJobService';
import type { PresignService } from '../../core/services/PresignService';
import { ValidationError } from '../../shared/errors/domain';

type AuthedRequest = Request & { internalUserId: string };

export class ImportController {
  constructor(
    private readonly importJobService: ImportJobService,
    private readonly presignService: PresignService
  ) {}

  listProviders = async (_req: Request, res: Response): Promise<void> => {
    res.json({ providers: this.importJobService.listProviders() });
  };

  initUpload = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const provider = String(req.body?.provider ?? '');
    const originalName = String(req.body?.originalName ?? 'export.zip');
    const sizeBytes = Number(req.body?.sizeBytes);
    if (!provider) throw new ValidationError('provider is required');
    if (!Number.isFinite(sizeBytes)) throw new ValidationError('sizeBytes is required');

    const result = await this.importJobService.initUpload(userId, provider, originalName, sizeBytes);
    res.status(201).json(result);
  };

  startImport = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const jobId = String(req.params.jobId);
    const result = await this.importJobService.startImport(userId, jobId);
    res.status(202).json(result);
  };

  getJob = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const jobId = String(req.params.jobId);
    const job = await this.importJobService.getJob(userId, jobId);
    res.json(job);
  };

  getResult = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const jobId = String(req.params.jobId);
    const result = await this.importJobService.getResult(userId, jobId);
    res.json(result);
  };

  getResultRef = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const jobId = String(req.params.jobId);
    const ref = await this.importJobService.getResultRef(userId, jobId);
    res.json(ref);
  };

  claimFinalize = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const jobId = String(req.params.jobId);
    const claim = await this.importJobService.claimFinalize(userId, jobId);
    res.json(claim);
  };

  completeFinalize = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const jobId = String(req.params.jobId);
    const conversationIds = Array.isArray(req.body?.conversationIds)
      ? (req.body.conversationIds as string[])
      : [];
    await this.importJobService.completeFinalize(userId, jobId, conversationIds);
    res.status(204).send();
  };

  failFinalize = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const jobId = String(req.params.jobId);
    const error = String(req.body?.error ?? 'Import finalize failed');
    await this.importJobService.failFinalize(userId, jobId, error);
    res.status(204).send();
  };

  cancelJob = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const jobId = String(req.params.jobId);
    await this.importJobService.cancelJob(userId, jobId);
    res.status(204).send();
  };

  presignFile = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).internalUserId;
    const fileId = String(req.params.fileId);
    const disposition = req.query.disposition as 'inline' | 'attachment' | undefined;
    const out = await this.presignService.presignFileAccess(userId, fileId, { disposition });
    res.json(out);
  };
}
