import { Request, Response } from 'express';
import { telemetryService } from '../services/telemetry.service';

export const recordBatch = (req: Request, res: Response): void => {
  const accepted = telemetryService.recordBatch(req.body);
  res.status(202).json({ accepted });
};
