import { Request, Response } from 'express';
import { qzTrayService } from '../services/qz-tray.service';

const allowedStaffRoles = new Set(['cashier', 'admin', 'shopadmin', 'owner', 'system admin']);

const isAllowedStaff = (req: Request): boolean => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  return allowedStaffRoles.has(role);
};

export const getCertificate = (req: Request, res: Response): void => {
  if (!isAllowedStaff(req)) {
    res.status(403).json({ error: 'QZ Tray signing is restricted to authorized staff.' });
    return;
  }

  const certificate = qzTrayService.getCertificate();
  if (!certificate) {
    res.status(503).json({ error: 'QZ Tray signing is not configured for this deployment.' });
    return;
  }

  res.json({ certificate });
};

export const sign = (req: Request, res: Response): void => {
  if (!isAllowedStaff(req)) {
    res.status(403).json({ error: 'QZ Tray signing is restricted to authorized staff.' });
    return;
  }

  const toSign = typeof req.body?.toSign === 'string' ? req.body.toSign : '';
  if (!toSign || toSign.length > 4096) {
    res.status(400).json({ error: 'A valid QZ Tray signing payload is required.' });
    return;
  }

  try {
    res.json({ signature: qzTrayService.sign(toSign) });
  } catch {
    res.status(503).json({ error: 'QZ Tray signing is not configured for this deployment.' });
  }
};
