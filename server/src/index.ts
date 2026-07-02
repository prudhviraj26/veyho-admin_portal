import express, { Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import prisma from './prisma';
import { requireAuth, AuthenticatedRequest } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'veyho_admin_portal_local_secret_key_1293847';

app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-support-access-school-id'],
}));

app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Auth Routes
app.post('/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailLower = email.toLowerCase();
    const platformOwner = await prisma.platformOwner.findUnique({
      where: { email: emailLower },
    });

    if (!platformOwner) {
      return res.status(401).json({ error: 'Invalid credentials or access denied' });
    }

    // Compare password
    const isPasswordValid = platformOwner.passwordHash ? await bcrypt.compare(password, platformOwner.passwordHash) : false;
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const tokenPayload = {
      id: platformOwner.id,
      email: platformOwner.email,
      isPlatformOwner: true,
    };
    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    console.log(`[AUTH] Successful login for platform owner: ${platformOwner.email}`);

    return res.json({
      accessToken,
      user: {
        id: platformOwner.id,
        firstName: platformOwner.firstName,
        lastName: platformOwner.lastName,
        email: platformOwner.email,
        role: 'platform_owner',
        roles: ['platform_owner'],
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/v1/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platformOwnerId = req.user?.id;
    const platformOwner = await prisma.platformOwner.findUnique({
      where: { id: platformOwnerId },
    });

    if (!platformOwner) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        id: platformOwner.id,
        firstName: platformOwner.firstName,
        lastName: platformOwner.lastName,
        email: platformOwner.email,
        role: 'platform_owner',
        roles: ['platform_owner'],
      }
    });
  } catch (error: any) {
    console.error('Auth check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/v1/auth/logout', (req, res) => {
  return res.json({ success: true });
});

// Platform Schools
app.get('/v1/platform/schools', requireAuth, async (req, res) => {
  try {
    const schools = await prisma.school.findMany({
      include: {
        _count: {
          select: {
            students: true,
            staffRoles: true,
            classes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = schools.map((school) => ({
      id: school.id,
      name: school.name,
      shortName: school.shortName,
      status: school.status,
      restoreDeadline: school.restoreDeadline,
      purgeStatus: school.purgeStatus,
      createdAt: school.createdAt,
      phonePrimary: school.phonePrimary,
      emailPrimary: school.emailPrimary,
      studentCount: school._count.students,
      staffCount: school._count.staffRoles,
      classCount: school._count.classes,
    }));

    return res.json(result);
  } catch (error: any) {
    console.error('Error fetching schools:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/v1/platform/schools', requireAuth, async (req, res) => {
  try {
    const dto = req.body;
    
    // Basic validation
    if (!dto.name || !dto.adminFirstName || !dto.adminLastName || !dto.adminEmail || !dto.adminMobile) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingStaff = await prisma.staff.findFirst({
      where: {
        OR: [
          { email: dto.adminEmail.toLowerCase() },
          { mobilePrimary: dto.adminMobile },
        ],
      },
    });

    if (existingStaff) {
      return res.status(400).json({
        error: 'A staff member with this admin email or mobile number already exists.',
      });
    }

    // Create Group
    const group = await prisma.group.create({
      data: {
        name: `${dto.name} Group`,
      },
    });

    // Create School
    const school = await prisma.school.create({
      data: {
        groupId: group.id,
        name: dto.name,
        phonePrimary: dto.phonePrimary || null,
        emailPrimary: dto.emailPrimary || null,
      },
    });

    // Generate Temporary Password
    const tempPassword = `Veyho@${Math.floor(100000 + Math.random() * 900000)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Create Admin Staff
    const staff = await prisma.staff.create({
      data: {
        groupId: group.id,
        firstName: dto.adminFirstName,
        lastName: dto.adminLastName,
        email: dto.adminEmail.toLowerCase(),
        mobilePrimary: dto.adminMobile,
        passwordHash,
        mustChangePassword: true,
        status: 'active',
      },
    });

    // Link Admin to School
    await prisma.staffSchoolRole.create({
      data: {
        staffId: staff.id,
        schoolId: school.id,
        role: 'school_admin',
        effectiveFrom: new Date(),
      },
    });

    console.log(`[PLATFORM] Registered new school: ${school.name}. Admin temporary password: ${tempPassword}`);

    return res.json({
      school: {
        id: school.id,
        name: school.name,
        createdAt: school.createdAt,
      },
      admin: {
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        mobilePrimary: staff.mobilePrimary,
      },
      tempPassword,
    });
  } catch (error: any) {
    console.error('Error registering school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Platform Support Access Grants
app.get('/v1/platform/support-access/active', requireAuth, async (req, res) => {
  try {
    const grants = await prisma.supportAccessGrant.findMany({
      where: {
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      include: {
        school: { select: { id: true, name: true } },
        platformOwner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return res.json(grants);
  } catch (error: any) {
    console.error('Error fetching active support grants:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/v1/platform/support-access/grant', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platformOwnerId = req.user?.id;
    if (!platformOwnerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { schoolId, reason, duration } = req.body;
    if (!schoolId || !reason || !duration) {
      return res.status(400).json({ error: 'School ID, reason, and duration are required' });
    }

    // Validate school exists
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });
    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    const expiresAt = new Date(Date.now() + Number(duration) * 60 * 60 * 1000);

    const grant = await prisma.supportAccessGrant.create({
      data: {
        schoolId,
        platformOwnerId,
        reason,
        duration: Number(duration),
        expiresAt,
      },
      include: {
        school: { select: { name: true } },
      },
    });

    console.log(`[SUPPORT] Platform owner (${platformOwnerId}) granted access to school: ${school.name}`);

    return res.json(grant);
  } catch (error: any) {
    console.error('Error creating support grant:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/v1/platform/support-access/revoke/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platformOwnerId = req.user?.id;
    if (!platformOwnerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const grant = await prisma.supportAccessGrant.findUnique({
      where: { id },
    });
    if (!grant) {
      return res.status(404).json({ error: 'Support access grant not found' });
    }

    const updatedGrant = await prisma.supportAccessGrant.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedBy: platformOwnerId,
      },
    });

    console.log(`[SUPPORT] Support grant revoked: ${id}`);

    return res.json(updatedGrant);
  } catch (error: any) {
    console.error('Error revoking support grant:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// SCHOOL LIFECYCLE MANAGEMENT ENDPOINTS
// ============================================================================

// Helper to get detailed school response
async function getSchoolResponse(schoolId: string) {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      _count: {
        select: {
          students: true,
          staffRoles: true,
          classes: true,
        },
      },
    },
  });
  if (!school) return null;
  return {
    id: school.id,
    name: school.name,
    status: school.status,
    createdAt: school.createdAt,
    phonePrimary: school.phonePrimary,
    emailPrimary: school.emailPrimary,
    studentCount: school._count.students,
    staffCount: school._count.staffRoles,
    classCount: school._count.classes,
    pausedAt: school.pausedAt,
    pausedReason: school.pausedReason,
    archivedAt: school.archivedAt,
    archivedReason: school.archivedReason,
    deletedAt: school.deletedAt,
    deletedReason: school.deletedReason,
    deletedBy: school.deletedBy,
    restoreDeadline: school.restoreDeadline,
    purgedAt: school.purgedAt,
    purgedBy: school.purgedBy,
    purgeStatus: school.purgeStatus,
    shortName: school.shortName,
  };
}

// Background cleanup worker
async function runBackgroundPurge(schoolId: string) {
  console.log(`[PURGE] Starting async database purge for school: ${schoolId}`);
  try {
    // 1. Anonymise all student PII
    const students = await prisma.student.findMany({ where: { schoolId } });
    for (const s of students) {
      await prisma.student.update({
        where: { id: s.id },
        data: {
          firstName: 'Student',
          lastName: s.id.substring(0, 8),
          dateOfBirth: new Date('1970-01-01'),
          aadhaarNumber: null,
          photoBlobPath: null,
        },
      });
    }
    console.log(`[PURGE] Anonymised PII for ${students.length} students.`);

    // 2. Delete all staff records
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (school) {
      // Set classTeacherStaffId = null in sections to prevent constraint violations
      await prisma.section.updateMany({
        where: { schoolId },
        data: { classTeacherStaffId: null },
      });

      // Delete auth sessions for these staff members
      await prisma.$executeRawUnsafe(
        'DELETE FROM auth_sessions WHERE staff_id IN (SELECT id FROM staff WHERE group_id = $1::uuid)',
        school.groupId
      );

      // Delete broadcast recipients for these staff members
      await prisma.$executeRawUnsafe(
        'DELETE FROM broadcast_recipients WHERE staff_id IN (SELECT id FROM staff WHERE group_id = $1::uuid)',
        school.groupId
      );

      // Delete staff subject assignments
      await prisma.$executeRawUnsafe(
        'DELETE FROM staff_subject_assignments WHERE staff_id IN (SELECT id FROM staff WHERE group_id = $1::uuid)',
        school.groupId
      );

      // Delete staff attendance records
      await prisma.staffAttendanceRecord.deleteMany({ where: { schoolId } });

      // Delete staff roles for this school
      await prisma.staffSchoolRole.deleteMany({ where: { schoolId } });
      
      // Delete staff records belonging to this school's group
      const staffDeleted = await prisma.staff.deleteMany({ where: { groupId: school.groupId } });
      console.log(`[PURGE] Deleted ${staffDeleted.count} staff records.`);
    }

    // 3. Delete all operational data
    // Attendance
    await prisma.studentAttendanceRecord.deleteMany({ where: { session: { schoolId } } });
    await prisma.attendanceCorrectionRequest.deleteMany({ where: { schoolId } });
    await prisma.attendanceSession.deleteMany({ where: { schoolId } });
    
    // Notices / Broadcasts
    await prisma.broadcastRecipient.deleteMany({ where: { broadcast: { schoolId } } });
    await prisma.broadcast.deleteMany({ where: { schoolId } });
    
    // Chats
    await prisma.chatMessage.deleteMany({ where: { thread: { schoolId } } });
    
    const threads = await prisma.chatThread.findMany({
      where: { schoolId },
      select: { id: true }
    });
    const threadIds = threads.map(t => t.id);
    await prisma.chatAdminAccessLog.deleteMany({
      where: { threadId: { in: threadIds } }
    });
    
    await prisma.chatThread.deleteMany({ where: { schoolId } });

    // Holidays & Promotions & Notifications
    await prisma.schoolHoliday.deleteMany({ where: { schoolId } });
    await prisma.promotionRun.deleteMany({ where: { schoolId } });
    await prisma.notificationLog.deleteMany({ where: { schoolId } });
    await prisma.notificationRule.deleteMany({ where: { schoolId } });

    // Mark purge as COMPLETED
    await prisma.school.update({
      where: { id: schoolId },
      data: { purgeStatus: 'COMPLETED' },
    });

    console.log(`[PURGE] Purge completed successfully for school ID: ${schoolId}`);
  } catch (err) {
    console.error(`[PURGE ERROR] Failed to run background purge for school ${schoolId}:`, err);
    try {
      await prisma.school.update({
        where: { id: schoolId },
        data: { purgeStatus: 'FAILED' },
      });
    } catch (dbErr) {
      console.error(`[PURGE ERROR] Failed to set status to FAILED for school ${schoolId}:`, dbErr);
    }
  }
}

// POST /v1/platform/schools/:id/pause
app.post('/v1/platform/schools/:id/pause', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'A valid audit reason of at least 10 characters is required' });
    }

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (school.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only ACTIVE schools can be paused' });
    }

    await prisma.$transaction([
      prisma.school.update({
        where: { id },
        data: {
          status: 'PAUSED',
          pausedAt: new Date(),
          pausedReason: reason,
        },
      }),
      prisma.schoolStatusHistory.create({
        data: {
          schoolId: id,
          fromStatus: 'ACTIVE',
          toStatus: 'PAUSED',
          changedBy: operatorId,
          reason,
        },
      }),
    ]);

    const updated = await getSchoolResponse(id);
    return res.json(updated);
  } catch (error: any) {
    console.error('Error pausing school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/schools/:id/unpause
app.post('/v1/platform/schools/:id/unpause', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'A valid audit reason of at least 10 characters is required' });
    }

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (school.status !== 'PAUSED') {
      return res.status(400).json({ error: 'Only PAUSED schools can be reactivated' });
    }

    await prisma.$transaction([
      prisma.school.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          pausedAt: null,
          pausedReason: null,
        },
      }),
      prisma.schoolStatusHistory.create({
        data: {
          schoolId: id,
          fromStatus: 'PAUSED',
          toStatus: 'ACTIVE',
          changedBy: operatorId,
          reason,
        },
      }),
    ]);

    const updated = await getSchoolResponse(id);
    return res.json(updated);
  } catch (error: any) {
    console.error('Error reactivating school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/schools/:id/archive
app.post('/v1/platform/schools/:id/archive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'A valid audit reason of at least 10 characters is required' });
    }

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (school.status !== 'ACTIVE' && school.status !== 'PAUSED') {
      return res.status(400).json({ error: 'Only ACTIVE or PAUSED schools can be archived' });
    }

    const originalStatus = school.status as any;

    await prisma.$transaction([
      prisma.school.update({
        where: { id },
        data: {
          status: 'ARCHIVED',
          archivedAt: new Date(),
          archivedReason: reason,
        },
      }),
      prisma.schoolStatusHistory.create({
        data: {
          schoolId: id,
          fromStatus: originalStatus,
          toStatus: 'ARCHIVED',
          changedBy: operatorId,
          reason,
        },
      }),
    ]);

    const updated = await getSchoolResponse(id);
    return res.json(updated);
  } catch (error: any) {
    console.error('Error archiving school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/schools/:id/unarchive
app.post('/v1/platform/schools/:id/unarchive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'A valid audit reason of at least 10 characters is required' });
    }

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (school.status !== 'ARCHIVED') {
      return res.status(400).json({ error: 'Only ARCHIVED schools can be unarchived' });
    }

    await prisma.$transaction([
      prisma.school.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          archivedAt: null,
          archivedReason: null,
        },
      }),
      prisma.schoolStatusHistory.create({
        data: {
          schoolId: id,
          fromStatus: 'ARCHIVED',
          toStatus: 'ACTIVE',
          changedBy: operatorId,
          reason,
        },
      }),
    ]);

    const updated = await getSchoolResponse(id);
    return res.json(updated);
  } catch (error: any) {
    console.error('Error unarchiving school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/schools/:id/delete
app.post('/v1/platform/schools/:id/delete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'A valid audit reason of at least 10 characters is required' });
    }

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (school.status === 'DELETED' || school.status === 'PURGED') {
      return res.status(400).json({ error: 'School is already deleted or purged' });
    }

    const originalStatus = school.status as any;
    const restoreDeadline = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.school.update({
        where: { id },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          deletedReason: reason,
          deletedBy: operatorId,
          restoreDeadline,
        },
      }),
      prisma.schoolStatusHistory.create({
        data: {
          schoolId: id,
          fromStatus: originalStatus,
          toStatus: 'DELETED',
          changedBy: operatorId,
          reason,
        },
      }),
    ]);

    const updated = await getSchoolResponse(id);
    return res.json(updated);
  } catch (error: any) {
    console.error('Error deleting school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/schools/:id/restore
app.post('/v1/platform/schools/:id/restore', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'A valid audit reason of at least 10 characters is required' });
    }

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (school.status !== 'DELETED') {
      return res.status(400).json({ error: 'Only DELETED schools can be restored' });
    }

    if (school.restoreDeadline && new Date() > school.restoreDeadline) {
      return res.status(400).json({ error: 'Restore window has expired. Permanent deletion is required to proceed. Contact legal before purging.' });
    }

    await prisma.$transaction([
      prisma.school.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          deletedReason: null,
          deletedBy: null,
          restoreDeadline: null,
        },
      }),
      prisma.schoolStatusHistory.create({
        data: {
          schoolId: id,
          fromStatus: 'DELETED',
          toStatus: 'ACTIVE',
          changedBy: operatorId,
          reason,
        },
      }),
    ]);

    const updated = await getSchoolResponse(id);
    return res.json(updated);
  } catch (error: any) {
    console.error('Error restoring school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/schools/:id/purge
app.post('/v1/platform/schools/:id/purge', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { reason, confirmationPhrase } = req.body;

    if (!reason || reason.trim().length < 20) {
      return res.status(400).json({ error: 'A valid audit reason of at least 20 characters is required for purging' });
    }

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    if (school.status !== 'DELETED') {
      return res.status(400).json({ error: 'Only DELETED schools can be permanently purged' });
    }

    const expectedPhrase = `PERMANENTLY DELETE ${school.shortName || school.id}`;
    if (confirmationPhrase !== expectedPhrase) {
      return res.status(400).json({ error: `Invalid confirmation phrase. Must match exactly: "${expectedPhrase}"` });
    }

    await prisma.$transaction([
      prisma.school.update({
        where: { id },
        data: {
          status: 'PURGED',
          purgedAt: new Date(),
          purgedBy: operatorId,
          purgeStatus: 'PENDING',
        },
      }),
      prisma.schoolStatusHistory.create({
        data: {
          schoolId: id,
          fromStatus: 'DELETED',
          toStatus: 'PURGED',
          changedBy: operatorId,
          reason,
        },
      }),
    ]);

    // Trigger background async cleanup job
    runBackgroundPurge(id);

    return res.json({ status: 'purge_initiated', estimatedCompletionMinutes: 5 });
  } catch (error: any) {
    console.error('Error purging school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/platform/schools/:id/history
app.get('/v1/platform/schools/:id/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const history = await prisma.schoolStatusHistory.findMany({
      where: { schoolId: id },
      include: {
        platformOwner: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { changedAt: 'desc' },
    });

    const result = history.map((h) => ({
      id: h.id,
      schoolId: h.schoolId,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reason: h.reason,
      changedAt: h.changedAt,
      metadata: h.metadata,
      operatorName: `${h.platformOwner.firstName} ${h.platformOwner.lastName}`,
    }));

    return res.json(result);
  } catch (error: any) {
    console.error('Error fetching status history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Veyho Admin backend listening at http://localhost:${PORT}`);
});
