import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { featureService } from '../services/feature.service';
import type { FeatureStatus } from '@demoshop/shared-types';

export class FeatureController extends BaseController {
  /**
   * Retrieves full details of all system features (System Admin endpoint).
   */
  async getFeatures(_req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      res,
      async () => {
        const features = await featureService.getAllFeatures();
        res.status(200).json({ features });
      },
      'GetFeatures'
    );
  }

  /**
   * Fast public endpoint for clients to query feature availability & maintenance status.
   */
  async getPublicFeatureStatuses(_req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      res,
      async () => {
        const summary = await featureService.getStatusSummary();
        res.status(200).json(summary);
      },
      'GetPublicFeatureStatuses'
    );
  }

  /**
   * Updates availability status or maintenance configuration of a single feature.
   */
  async updateFeatureStatus(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      res,
      async () => {
        const featureId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const { status, maintenanceMessage } = req.body;

        if (status && !['ENABLED', 'DISABLED', 'MAINTENANCE'].includes(status)) {
          res.status(400).json({
            error: "Invalid status. Must be 'ENABLED', 'DISABLED', or 'MAINTENANCE'.",
          });
          return;
        }

        const targetRoles = req.body.roles || req.body.affected_roles;
        if (!status && !Array.isArray(targetRoles)) {
          res.status(400).json({
            error: "Missing update payload. Specify 'status' or 'roles'/'affected_roles'.",
          });
          return;
        }

        const userId = (req.user as any)?.user_id || null;

        try {
          let updated = null;

          if (status) {
            updated = await featureService.updateFeatureStatus({
              featureId,
              status: status as FeatureStatus,
              maintenanceMessage,
              userId,
              req,
            });
          }

          const targetRoles = req.body.roles || req.body.affected_roles;
          if (Array.isArray(targetRoles)) {
            updated = await featureService.updateFeatureRoles({
              featureId,
              roles: targetRoles,
              userId,
              req,
            });
          }

          if (!updated) {
            res.status(400).json({
              error: "Missing update payload. Specify 'status' or 'roles'/'affected_roles'.",
            });
            return;
          }

          res.status(200).json({
            message: `Feature '${updated.name}' updated successfully.`,
            feature: updated,
          });
        } catch (err: any) {
          const statusCode = err.statusCode || 500;
          res.status(statusCode).json({
            error: err.message || 'Failed to update feature.',
          });
        }
      },
      'UpdateFeatureStatus'
    );
  }

  /**
   * Updates authorized roles for a single feature.
   */
  async updateFeatureRoles(req: Request, res: Response): Promise<void> {
    await this.handleRequest(
      res,
      async () => {
        const featureId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const targetRoles = req.body.roles || req.body.affected_roles;

        if (!Array.isArray(targetRoles)) {
          res.status(400).json({
            error: "Invalid payload. 'roles' or 'affected_roles' array is required.",
          });
          return;
        }

        const userId = (req.user as any)?.user_id || null;

        try {
          const updated = await featureService.updateFeatureRoles({
            featureId,
            roles: targetRoles,
            userId,
            req,
          });

          res.status(200).json({
            message: `Feature '${updated.name}' role access updated successfully.`,
            feature: updated,
          });
        } catch (err: any) {
          const statusCode = err.statusCode || 500;
          res.status(statusCode).json({
            error: err.message || 'Failed to update feature role access.',
          });
        }
      },
      'UpdateFeatureRoles'
    );
  }
}

export const featureController = new FeatureController();
