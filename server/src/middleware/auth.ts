import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    isPlatformOwner: boolean;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'veyho_admin_portal_local_secret_key_1293847') as any;
    if (!decoded.isPlatformOwner) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }
    req.user = {
      id: decoded.id,
      email: decoded.email,
      isPlatformOwner: decoded.isPlatformOwner,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
