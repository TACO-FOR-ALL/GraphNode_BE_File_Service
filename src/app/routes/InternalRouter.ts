/**
 * 모듈: InternalRouter
 *
 * BFF 전용 라우트 (/internal).
 */
import { Router } from 'express';

import { getContainer } from '../../bootstrap/container';
import { ImportController } from '../controllers/ImportController';
import { httpLog } from '../middlewares/http-log';
import { internalAuth } from '../middlewares/internal-auth';
import { asyncHandler } from '../utils/asyncHandler';

export function createInternalRouter(): Router {
  const c = getContainer();
  const controller = new ImportController(c.importJobService, c.presignService);
  const router = Router();

  router.use(internalAuth);
  router.use(httpLog);

  router.get('/import-providers', asyncHandler(controller.listProviders));
  router.post('/imports/init', asyncHandler(controller.initUpload));
  router.post('/imports/:jobId/start', asyncHandler(controller.startImport));
  router.get('/imports/:jobId', asyncHandler(controller.getJob));
  router.get('/imports/:jobId/result', asyncHandler(controller.getResult));
  router.get('/imports/:jobId/result-ref', asyncHandler(controller.getResultRef));
  router.post('/imports/:jobId/finalize/claim', asyncHandler(controller.claimFinalize));
  router.post('/imports/:jobId/finalize/complete', asyncHandler(controller.completeFinalize));
  router.post('/imports/:jobId/finalize/fail', asyncHandler(controller.failFinalize));
  router.delete('/imports/:jobId', asyncHandler(controller.cancelJob));
  router.get('/files/:fileId/presign', asyncHandler(controller.presignFile));

  return router;
}
