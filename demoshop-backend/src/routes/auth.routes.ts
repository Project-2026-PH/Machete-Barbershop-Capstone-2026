import express from 'express';
import { requireSupabaseAuth } from '../middleware/auth.middleware';
import { oauthRateLimit } from '../middleware/oauth-rate-limit.middleware';
import { postgresAuthRateLimit, createPostgresAuthRateLimit } from '../middleware/auth-rate-limit.middleware';

const loginRateLimit = postgresAuthRateLimit('auth-login', 15 * 60, { ip: 15, account: 5, device: 10 });
const registerRateLimit = postgresAuthRateLimit('auth-register', 15 * 60, { ip: 10, account: 3, device: 5 });
const verifyRateLimit = postgresAuthRateLimit('auth-verify', 10 * 60, { ip: 20, account: 8, device: 10 });
const resendVerificationRateLimit = postgresAuthRateLimit('auth-resend-verification', 60 * 60, { ip: 5, account: 3, device: 5 });
const resetRequestRateLimit = postgresAuthRateLimit('auth-reset-request', 60 * 60, { ip: 10, account: 3, device: 5 });
const resetVerifyRateLimit = postgresAuthRateLimit('auth-reset-verify', 10 * 60, { ip: 20, account: 10, device: 10 });
const resetRateLimit = postgresAuthRateLimit('auth-reset', 15 * 60, { ip: 10, account: 5, device: 10 });
const refreshRateLimit = createPostgresAuthRateLimit({
  name: 'auth-session-refresh',
  windowSeconds: 5 * 60,
  limits: { ip: 30, session: 20, device: 30 },
  includeDevice: true,
  includeSession: true,
});
import {
  getMe, register, login, logout, verifyEmail, resendVerification,
  forgotPasswordRequest, forgotPasswordVerify, forgotPasswordReset,
  changePasswordRequestCode, changePassword, uploadProfilePicture,
  updateProfile, refresh,
} from '../controllers/auth.controller';
import {
  googleAuthorize, googleCallback, sessionRefresh, sessionLogout,
} from '../controllers/oauth.controller';
import { createImageUploadMiddleware } from '../utils/general/image-upload.util';

const avatarUpload = createImageUploadMiddleware('avatar');

const router = express.Router();

router.get('/me', requireSupabaseAuth, getMe);
router.get('/profile', requireSupabaseAuth, getMe);
router.put('/profile', requireSupabaseAuth, updateProfile);
router.patch('/profile', requireSupabaseAuth, updateProfile);
router.get('/google/url', oauthRateLimit, googleAuthorize);
router.get('/google/callback', oauthRateLimit, googleCallback);
router.post('/login', loginRateLimit, login);
router.post('/logout', logout);
router.post('/refresh', refreshRateLimit, refresh);
router.post('/session/refresh', refreshRateLimit, sessionRefresh);
router.post('/session/logout', sessionLogout);
router.post('/register', registerRateLimit, register);
router.post('/verify-email', verifyRateLimit, verifyEmail);
router.post('/resend-verification', resendVerificationRateLimit, resendVerification);
router.post('/forgot-password/request', resetRequestRateLimit, forgotPasswordRequest);
router.post('/forgot-password/verify', resetVerifyRateLimit, forgotPasswordVerify);
router.post('/forgot-password/reset', resetRateLimit, forgotPasswordReset);
router.post('/change-password/request-code', requireSupabaseAuth, resetRequestRateLimit, changePasswordRequestCode);
router.post('/change-password', requireSupabaseAuth, resetRateLimit, changePassword);
router.post('/profile-picture', requireSupabaseAuth, avatarUpload, uploadProfilePicture);

export default router;
