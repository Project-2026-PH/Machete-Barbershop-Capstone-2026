import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import authorizeRoles from '../middleware/role.middleware';
import { diagnosticsController } from '../controllers/diagnostics.controller';

const router = express.Router();

// All diagnostics endpoints are protected by Supabase JWT and restricted to System Admin & Owner
router.use(requireSupabaseAuth);
router.use(authorizeRoles('System Admin', 'Owner'));

// Inspect effective access and authorization chain for a target user
router.get('/access/:userId', (req, res) => diagnosticsController.inspectUserAccess(req, res));

router.get('/performance', (req, res) => diagnosticsController.getPerformanceSnapshot(req, res));

// Execute safe targeted referential data integrity checks
router.get('/integrity', (req, res) => diagnosticsController.runIntegrityChecks(req, res));

// Current authenticated administrator session diagnostics
router.get('/session-info', (req, res) => diagnosticsController.getSessionInfo(req, res));

// ── Demo & Testing Tools ──────────────────────────────────────────

// 1. Reservation Simulator
router.post('/reservations', (req, res) => diagnosticsController.createTestReservation(req, res));

// 2. Walk-in Generator
router.post('/walk-ins', (req, res) => diagnosticsController.insertTestWalkIns(req, res));

// 3. Queue Skip Inspection & Mutation
router.get('/queue/barber/:barberId', (req, res) => diagnosticsController.getLiveBarberQueue(req, res));
router.post('/queue/:id/skip', (req, res) => diagnosticsController.skipQueueEntry(req, res));

// 4. Barber Review Generator
router.post('/reviews', (req, res) => diagnosticsController.createTestReview(req, res));

// 5. Email Tester
router.post('/email/preview', (req, res) => diagnosticsController.previewEmail(req, res));
router.post('/email/test', (req, res) => diagnosticsController.sendTestEmail(req, res));

// 6. Test Data Management & Purge
router.get('/test-data', (req, res) => diagnosticsController.getTestDataCounts(req, res));
router.get('/test-data/review', (req, res) => diagnosticsController.getTestDataReview(req, res));
router.delete('/test-data', (req, res) => diagnosticsController.cleanupTestData(req, res));

export default router;
