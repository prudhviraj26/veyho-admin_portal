import { Router, Response } from 'express';
import { PlatformNotificationPriority, Prisma } from '@prisma/client';
import prisma from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const VALID_PRIORITIES = new Set<PlatformNotificationPriority>(['INFO', 'WARNING', 'CRITICAL']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSafeActionUrl(url: string): boolean {
  return url.startsWith('/') || url.startsWith('https://') || url.startsWith('http://');
}

type NotificationWithRelations = Prisma.PlatformNotificationGetPayload<{
  include: {
    createdBy: { select: { id: true; firstName: true; lastName: true; email: true } };
    targets: {
      include: {
        school: { select: { name: true; shortName: true } };
      };
    };
    _count: { select: { reads: true } };
  };
}>;

function serializeNotification(n: NotificationWithRelations) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    priority: n.priority,
    isPinnedBanner: n.isPinnedBanner,
    actionLabel: n.actionLabel,
    actionUrl: n.actionUrl,
    expiresAt: n.expiresAt,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    createdBy: n.createdBy
      ? {
          id: n.createdBy.id,
          firstName: n.createdBy.firstName,
          lastName: n.createdBy.lastName,
          email: n.createdBy.email,
        }
      : null,
    targets: (n.targets || []).map((t) => ({
      schoolId: t.schoolId,
      schoolName: t.school?.name ?? null,
      shortName: t.school?.shortName ?? null,
    })),
    readCount: n._count?.reads ?? 0,
  };
}

// GET /v1/platform/notifications
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schoolId = typeof req.query.schoolId === 'string' ? req.query.schoolId.trim() : '';
    const limitParam = parseInt(String(req.query.limit || '50'), 10);
    const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

    if (schoolId && !UUID_REGEX.test(schoolId)) {
      return res.status(400).json({ error: 'Invalid schoolId filter' });
    }

    const notifications = await prisma.platformNotification.findMany({
      where: schoolId
        ? {
            targets: {
              some: { schoolId },
            },
          }
        : undefined,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        targets: {
          include: {
            school: {
              select: { id: true, name: true, shortName: true },
            },
          },
        },
        _count: {
          select: { reads: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return res.json(notifications.map(serializeNotification));
  } catch (error) {
    console.error('Error listing platform notifications:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/notifications
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      title,
      message,
      priority = 'INFO',
      schoolIds,
      isPinnedBanner = false,
      actionLabel,
      actionUrl,
      expiresAt,
    } = req.body ?? {};

    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanMessage = typeof message === 'string' ? message.trim() : '';
    const cleanPriority = String(priority || 'INFO').toUpperCase() as PlatformNotificationPriority;

    if (!cleanTitle || cleanTitle.length > 200) {
      return res.status(400).json({ error: 'Title is required and must be at most 200 characters.' });
    }
    if (!cleanMessage) {
      return res.status(400).json({ error: 'Message body is required.' });
    }
    if (!VALID_PRIORITIES.has(cleanPriority)) {
      return res.status(400).json({ error: 'Priority must be INFO, WARNING, or CRITICAL.' });
    }
    if (!Array.isArray(schoolIds) || schoolIds.length === 0) {
      return res.status(400).json({ error: 'At least one target school must be selected.' });
    }

    const uniqueSchoolIds = Array.from(
      new Set(schoolIds.filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id))),
    );
    if (uniqueSchoolIds.length !== new Set(schoolIds).size || uniqueSchoolIds.length === 0) {
      return res.status(400).json({ error: 'All target schoolIds must be valid UUIDs.' });
    }

    const cleanActionUrl = typeof actionUrl === 'string' && actionUrl.trim() ? actionUrl.trim() : null;
    const cleanActionLabel = typeof actionLabel === 'string' && actionLabel.trim() ? actionLabel.trim() : null;

    if (cleanActionUrl) {
      if (cleanActionUrl.length > 500 || !isSafeActionUrl(cleanActionUrl)) {
        return res.status(400).json({ error: 'Action URL must start with /, https://, or http:// (max 500 chars).' });
      }
    }
    if (cleanActionLabel && cleanActionLabel.length > 80) {
      return res.status(400).json({ error: 'Action label must be at most 80 characters.' });
    }

    let parsedExpiresAt: Date | null = null;
    if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
      const d = new Date(expiresAt);
      if (isNaN(d.getTime()) || d <= new Date()) {
        return res.status(400).json({ error: 'Expiry date must be a valid future timestamp.' });
      }
      parsedExpiresAt = d;
    }

    const existingSchools = await prisma.school.findMany({
      where: {
        id: { in: uniqueSchoolIds },
        status: { not: 'PURGED' },
      },
      select: { id: true },
    });
    if (existingSchools.length !== uniqueSchoolIds.length) {
      return res.status(400).json({ error: 'One or more selected schools do not exist or have been purged.' });
    }

    const created = await prisma.platformNotification.create({
      data: {
        title: cleanTitle,
        message: cleanMessage,
        priority: cleanPriority,
        isPinnedBanner: Boolean(isPinnedBanner),
        actionLabel: cleanActionUrl ? cleanActionLabel || 'View details' : null,
        actionUrl: cleanActionUrl,
        expiresAt: parsedExpiresAt,
        createdById: operatorId,
        targets: {
          create: uniqueSchoolIds.map((schoolId) => ({ schoolId })),
        },
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        targets: {
          include: {
            school: {
              select: { id: true, name: true, shortName: true },
            },
          },
        },
        _count: {
          select: { reads: true },
        },
      },
    });

    console.log(`[NOTIFICATIONS] Platform owner (${operatorId}) sent "${cleanTitle}" (${cleanPriority}) to ${uniqueSchoolIds.length} school(s)`);

    return res.status(201).json(serializeNotification(created));
  } catch (error) {
    console.error('Error creating platform notification:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/notifications/:id/expire
router.post('/:id/expire', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const existing = await prisma.platformNotification.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updated = await prisma.platformNotification.update({
      where: { id },
      data: { expiresAt: new Date() },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        targets: {
          include: {
            school: {
              select: { id: true, name: true, shortName: true },
            },
          },
        },
        _count: {
          select: { reads: true },
        },
      },
    });

    return res.json(serializeNotification(updated));
  } catch (error) {
    console.error('Error expiring platform notification:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
