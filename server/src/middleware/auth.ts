import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    isPlatformOwner: boolean;
  };
}

function loadPemKey(rawValue?: string, pathValue?: string): string {
  if (rawValue && rawValue.trim()) {
    return rawValue.trim().replace(/\\n/g, '\n');
  }
  if (pathValue && pathValue.trim() && fs.existsSync(pathValue.trim())) {
    return fs.readFileSync(pathValue.trim(), 'utf8');
  }
  return '';
}

/**
 * Returns the RS256 keypair from environment variables or fails fast if missing.
 */
export function getJwtKeys(): { privateKey: string; publicKey: string } {
  const privateKey = loadPemKey(process.env.JWT_PRIVATE_KEY, process.env.JWT_PRIVATE_KEY_PATH);
  const publicKey = loadPemKey(process.env.JWT_PUBLIC_KEY, process.env.JWT_PUBLIC_KEY_PATH);

  if (!privateKey || !publicKey) {
    throw new Error(
      'FATAL: JWT_PRIVATE_KEY and JWT_PUBLIC_KEY (or *_PATH) must be configured for veyho-admin-backend.',
    );
  }

  return { privateKey, publicKey };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { publicKey } = getJwtKeys();
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload & {
      id?: string;
      email?: string;
      isPlatformOwner?: boolean;
      roles?: string[];
    };
    const isOwner = Boolean(decoded.isPlatformOwner) || (Array.isArray(decoded.roles) && decoded.roles.includes('platform_owner'));
    const userId = decoded.id || decoded.sub;
    const userEmail = decoded.email;
    if (!isOwner || !userId || !userEmail) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }
    req.user = {
      id: userId,
      email: userEmail,
      isPlatformOwner: true,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
