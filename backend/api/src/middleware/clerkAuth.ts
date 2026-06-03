import { Request, Response, NextFunction } from 'express';
import { createClerkClient, verifyToken } from '@clerk/backend';
import logger from '../logger';

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

const MERCHANT_ORG_ID = process.env.CLERK_MERCHANT_ORG_ID!;
const ADMIN_ORG_ID    = process.env.CLERK_ADMIN_ORG_ID!;

// Extend Express Request to carry auth context
declare global {
  namespace Express {
    interface Request {
      auth: {
        userId:    string;
        tenantId:  string;
        dbRole:    'app_user' | 'app_admin';
        orgId:     string;
      };
    }
  }
}

export async function clerkAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn({ path: req.path }, 'Auth failure: missing or malformed Authorization header');
      res.status(401).json({ error: 'Unauthorized: missing token' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify the JWT with Clerk — this is the source of truth, NOT the frontend
    let payload: any;
    try {
      payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
    } catch (err) {
      logger.warn({ path: req.path, err }, 'Auth failure: invalid or expired Clerk JWT');
      res.status(401).json({ error: 'Unauthorized: invalid token' });
      return;
    }

    // Extract active organisation from the JWT
    // Clerk stores active org in `org_id` claim, or under `o.id` in the default token structure
    const orgId = (payload.org_id || payload.o?.id) as string | undefined;
    const orgSlug = (payload.org_slug || payload.o?.slg) as string | undefined;

    if (!orgId) {
      logger.warn({ userId: payload.sub, path: req.path }, 'Auth failure: no active organisation in JWT');
      res.status(401).json({ error: 'Unauthorized: no organisation context' });
      return;
    }

    // Map org → DB role + tenantId
    // NEVER trust a role from the frontend — only derive from the JWT org
    let dbRole: 'app_user' | 'app_admin';
    let tenantId: string;

    const isAdmin = 
      orgId === ADMIN_ORG_ID || 
      orgSlug === 'risk-admins-org' || 
      orgSlug?.includes('admin');

    if (isAdmin) {
      dbRole   = 'app_admin';
      tenantId = '*'; // admin sees all
    } else {
      dbRole   = 'app_user';
      
      // Determine tenant ID dynamically from simulated tenants
      const tenants = ['merchant_alpha', 'merchant_beta', 'merchant_gamma', 'merchant_delta', 'merchant_epsilon'];
      const matchedTenant = tenants.find(t => orgSlug?.replace(/[-_]/g, '').includes(t.replace(/[-_]/g, '')));
      
      if (matchedTenant) {
        tenantId = matchedTenant;
      } else if (orgId === MERCHANT_ORG_ID) {
        tenantId = 'merchant_alpha';
      } else {
        // Dynamic stable mapping based on orgId hash so any custom org works
        let hash = 0;
        for (let i = 0; i < orgId.length; i++) {
          hash = orgId.charCodeAt(i) + ((hash << 5) - hash);
        }
        tenantId = tenants[Math.abs(hash) % tenants.length];
      }
    }

    logger.debug(
      { userId: payload.sub, orgId, orgSlug, dbRole, tenantId },
      'JWT validated — auth context set'
    );

    req.auth = { userId: payload.sub, tenantId, dbRole, orgId };
    next();
  } catch (err) {
    logger.error({ err, path: req.path }, 'Unexpected error in auth middleware');
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
}
