import { Router } from 'express';

const router = Router();

router.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'graphnode-file-service' });
});

export default router;
