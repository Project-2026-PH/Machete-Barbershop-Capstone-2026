import { User as DemoShopUser } from '@demoshop/shared-types';

declare global {
  namespace Express {
    interface User extends Partial<DemoShopUser> {}
    
    interface Request {
      file?: any;
      user?: User;
      guestSession?: {
        guestProfileId: number;
        branchId: number;
      };
    }
  }
}
