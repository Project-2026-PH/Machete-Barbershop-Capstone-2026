import { Response } from 'express';
import { config } from '../config/env';

class AuthSessionFacade {

    // Hides the complex environment checks from the rest of the app
    private getCookieOptions(maxAge?: number) {
        return {
            httpOnly: true,
            secure: config.runtime.isProduction || config.runtime.forceSecureCookie,
            sameSite: (config.runtime.isProduction ? 'none' : 'lax') as 'none' | 'lax',  // Cast the result strictly to the accepted literal types
            ...(maxAge && { maxAge }),
        };
    }

    // Unified method to handle a successful login/refresh/verification
    public applySessionAndRespond(res: Response, authResult: any): void {
        const cookieOpts = this.getCookieOptions(authResult.session?.maxAge);

        if (authResult.session?.token) {
            res.cookie('token', authResult.session.token, cookieOpts);
        }

        if (authResult.session?.supabaseToken) {
            res.cookie('sb-access-token', authResult.session.supabaseToken, cookieOpts);
        }

        // Format the payload (remove session token before sending)
        const { session, ...responsePayload } = authResult;

        res.json({
            ...responsePayload,
            supabaseToken: session?.supabaseToken || null,
        });
    }

    // Unified method to handle logouts
    public clearSession(res: Response): void {
        const cookieOpts = this.getCookieOptions();
        res.clearCookie('token', cookieOpts);
        res.clearCookie('sb-access-token', cookieOpts);
        res.clearCookie('sb-refresh-token', cookieOpts);
    }
}

export const authSessionFacade = new AuthSessionFacade();