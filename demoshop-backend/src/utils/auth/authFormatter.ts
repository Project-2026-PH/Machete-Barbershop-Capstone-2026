import { User, SessionData } from "@demoshop/shared-types";

export interface AuthResponse {
  success: true;
  message: string;
  user: {
    id: number;
    email: string;
    role: string;
    username?: string | null;
    profile_picture?: string | null;
    branch_id?: number | null;
    barber_id?: number | null;
  };
  session: SessionData;
  meta?: any;
}

export const formatAuthResponse = (
  user: Partial<User>,
  session: SessionData,
  message: string = "Success",
  meta: any = null
): AuthResponse => {
  const userId = user.user_id || (user as any).id;
  
  return {
    success: true,
    message,
    user: {
      id: userId,
      email: user.email!,
      role: user.role!,
      username: user.username,
      profile_picture: user.profile_picture,
      branch_id: user.branch_id,
      barber_id: (user as any).barber_id ?? null,
    },
    session,
    meta,
  };
};

export const formatMeResponse = (user: Partial<User>, supabaseToken: string | null) => {
  const userId = user.user_id || (user as any).id;
  
  return {
    success: true,
    user: {
      id: userId,
      email: user.email,
      role: user.role,
      username: user.username,
      profile_picture: user.profile_picture,
      branch_id: user.branch_id,
      barber_id: (user as any).barber_id ?? null,
    },
    supabaseToken,
  };
};
