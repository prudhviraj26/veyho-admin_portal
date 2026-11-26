import express, { Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { requireAuth, AuthenticatedRequest, getJwtKeys } from './middleware/auth';
import platformNotificationsRouter from './routes/notifications';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const { privateKey: JWT_PRIVATE_KEY } = getJwtKeys();

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttemptsByIp = new Map<string, { count: number; resetAt: number }>();

function rateLimitLogin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttemptsByIp.get(ip);

  if (!entry || entry.resetAt <= now) {
    loginAttemptsByIp.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return next();
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  entry.count += 1;
  return next();
}

const redisUrl = process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl) : null;
if (redis) {
  console.log('[Redis] Connected to Redis for Cache Invalidation');
} else {
  console.log('[Redis] REDIS_URL not configured. Cache invalidation is disabled.');
}

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

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
app.post('/v1/auth/login', rateLimitLogin, async (req, res) => {
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

    // Generate RS256 JWT (compatible with both admin portal and school_web_app)
    const tokenPayload = {
      id: platformOwner.id,
      sub: platformOwner.id,
      email: platformOwner.email,
      isPlatformOwner: true,
      roles: ['platform_owner'],
      role: 'platform_owner',
      type: 'access',
    };
    const accessToken = jwt.sign(tokenPayload, JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '24h',
    });

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
  } catch (error) {
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
  } catch (error) {
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
        staffRoles: {
          where: {
            role: 'school_admin',
          },
          include: {
            staff: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                mobilePrimary: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = schools.map((school) => {
      const adminRole = school.staffRoles[0];
      const adminStaff = adminRole?.staff;
      return {
        id: school.id,
        name: school.name,
        shortName: school.shortName,
        status: school.status,
        restoreDeadline: school.restoreDeadline,
        purgeStatus: school.purgeStatus,
        createdAt: school.createdAt,
        phonePrimary: school.phonePrimary,
        emailPrimary: school.emailPrimary,
        maxStudents: school.maxStudents,
        studentCount: school._count.students,
        staffCount: school._count.staffRoles,
        classCount: school._count.classes,
        admin: adminStaff ? {
          firstName: adminStaff.firstName,
          lastName: adminStaff.lastName,
          email: adminStaff.email,
          mobilePrimary: adminStaff.mobilePrimary,
        } : null,
      };
    });

    return res.json(result);
  } catch (error) {
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

    const parsedMaxStudents = dto.maxStudents !== undefined && dto.maxStudents !== null && dto.maxStudents !== ''
      ? parseInt(String(dto.maxStudents), 10)
      : null;

    // Generate Temporary Password before transaction so hashing does not hold DB locks
    const tempPassword = `Veyho@${Math.floor(100000 + Math.random() * 900000)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const normalizedAdminEmail = dto.adminEmail.toLowerCase();

    const { school, staff } = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: `${dto.name} Group`,
        },
      });

      const createdSchool = await tx.school.create({
        data: {
          groupId: group.id,
          name: dto.name,
          phonePrimary: dto.phonePrimary || null,
          emailPrimary: dto.emailPrimary || null,
          maxStudents: isNaN(parsedMaxStudents as number) ? null : parsedMaxStudents,
        },
      });

      await tx.schoolModuleEntitlement.createMany({
        data: ['admissions', 'attendance', 'fees', 'communication', 'reports', 'certificates'].map((moduleKey) => ({
          schoolId: createdSchool.id,
          moduleKey,
          isEnabled: true,
        })),
      });

      const createdStaff = await tx.staff.create({
        data: {
          groupId: group.id,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          email: normalizedAdminEmail,
          mobilePrimary: dto.adminMobile,
          passwordHash,
          mustChangePassword: true,
          status: 'active',
        },
      });

      await tx.staffSchoolRole.create({
        data: {
          staffId: createdStaff.id,
          schoolId: createdSchool.id,
          role: 'school_admin',
          effectiveFrom: new Date(),
        },
      });

      return { school: createdSchool, staff: createdStaff };
    });

    console.log(`[PLATFORM] Registered new school: ${school.name}.`);

    return res.json({
      school: {
        id: school.id,
        name: school.name,
        maxStudents: school.maxStudents,
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
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(400).json({
        error: 'A staff member with this admin email or mobile number already exists.',
      });
    }
    console.error('Error registering school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Student Cap for a School
app.patch('/v1/platform/schools/:id/student-cap', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { maxStudents } = req.body;

    const parsedMax = maxStudents !== undefined && maxStudents !== null && maxStudents !== ''
      ? parseInt(String(maxStudents), 10)
      : null;

    if (parsedMax !== null && (isNaN(parsedMax) || parsedMax < 0)) {
      return res.status(400).json({ error: 'Student cap must be a non-negative integer or null for unlimited.' });
    }

    const school = await prisma.school.update({
      where: { id },
      data: { maxStudents: parsedMax },
    });

    return res.json({
      success: true,
      schoolId: school.id,
      maxStudents: school.maxStudents,
    });
  } catch (error) {
    console.error('Error updating student cap:', error);
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
    await prisma.$transaction(
      async (tx) => {
        // Identify staff members who belong exclusively to this school
        const schoolRoles = await tx.staffSchoolRole.findMany({
          where: { schoolId },
          select: { staffId: true },
        });
        const schoolStaffIds = Array.from(new Set(schoolRoles.map((r) => r.staffId)));
        let exclusiveStaffIds: string[] = [];
        if (schoolStaffIds.length > 0) {
          const otherSchoolRoles = await tx.staffSchoolRole.findMany({
            where: {
              staffId: { in: schoolStaffIds },
              schoolId: { not: schoolId },
            },
            select: { staffId: true },
          });
          const sharedStaffIds = new Set(otherSchoolRoles.map((r) => r.staffId));
          exclusiveStaffIds = schoolStaffIds.filter((id) => !sharedStaffIds.has(id));
        }

        // 1. Anonymise all student PII while preserving anonymized relational anchors
        const anonymisedStudents = await tx.student.updateMany({
          where: { schoolId },
          data: {
            firstName: 'Purged',
            middleName: null,
            lastName: 'Student',
            dateOfBirth: new Date('1970-01-01'),
            aadhaarNumber: null,
            udiseStudentId: null,
            apaarId: null,
            penNumber: null,
            photoBlobPath: null,
            bloodGroup: null,
            religion: null,
            caste: null,
            category: null,
            motherTongue: null,
            dateOfBirthInWords: null,
            birthCity: null,
            birthTehsil: null,
            birthDistrict: null,
            birthState: null,
            addressLine: null,
            city: null,
            state: null,
            pincode: null,
          },
        });
        console.log(`[PURGE] Anonymised PII for ${anonymisedStudents.count} students.`);

        // 2. Delete operational, financial, and PII records in FK-safe order
        await tx.chatMessage.deleteMany({ where: { thread: { schoolId } } });
        const threads = await tx.chatThread.findMany({
          where: { schoolId },
          select: { id: true },
        });
        const threadIds = threads.map((t) => t.id);
        if (threadIds.length > 0) {
          await tx.chatAdminAccessLog.deleteMany({
            where: { threadId: { in: threadIds } },
          });
        }
        await tx.chatThread.deleteMany({ where: { schoolId } });

        await tx.broadcastRecipient.deleteMany({ where: { broadcast: { schoolId } } });
        await tx.broadcast.deleteMany({ where: { schoolId } });
        await tx.notificationLog.deleteMany({ where: { schoolId } });
        await tx.notificationRule.deleteMany({ where: { schoolId } });

        await tx.schoolEventTarget.deleteMany({ where: { event: { schoolId } } });
        await tx.schoolEvent.deleteMany({ where: { schoolId } });

        await tx.studentAttendanceRecord.deleteMany({ where: { session: { schoolId } } });
        await tx.attendanceCorrectionRequest.deleteMany({ where: { schoolId } });
        await tx.attendanceSession.deleteMany({ where: { schoolId } });
        await tx.schoolHoliday.deleteMany({ where: { schoolId } });

        await tx.admissionDocument.deleteMany({ where: { admission: { schoolId } } });
        await tx.admissionStatusHistory.deleteMany({ where: { admission: { schoolId } } });
        await tx.admission.deleteMany({ where: { schoolId } });
        await tx.certificate.deleteMany({ where: { schoolId } });

        await tx.feePaymentAllocation.deleteMany({ where: { payment: { schoolId } } });
        await tx.feePayment.deleteMany({ where: { schoolId } });
        await tx.feeReceipt.deleteMany({ where: { schoolId } });
        await tx.studentLateFee.deleteMany({ where: { account: { schoolId } } });
        await tx.studentFeeConcession.deleteMany({ where: { account: { schoolId } } });
        await tx.studentFeeInstallment.deleteMany({ where: { account: { schoolId } } });
        await tx.studentFeeAccount.deleteMany({ where: { schoolId } });

        await tx.studentMedicalInfo.deleteMany({ where: { student: { schoolId } } });
        await tx.studentParentContact.deleteMany({ where: { student: { schoolId } } });
        await tx.clickwrapConsentLog.deleteMany({ where: { schoolId } });
        await tx.deviceToken.deleteMany({ where: { schoolId } });
        await tx.authSession.deleteMany({ where: { parentContact: { schoolId } } });
        await tx.parentContact.deleteMany({ where: { schoolId } });
        await tx.familyGroup.deleteMany({ where: { schoolId } });

        await tx.promotionRun.deleteMany({ where: { schoolId } });
        await tx.appFeedback.deleteMany({ where: { schoolId } });
        await tx.platformNotificationTarget.deleteMany({ where: { schoolId } });

        // 3. Detach and delete school-scoped staff records
        await tx.section.updateMany({
          where: { schoolId },
          data: { classTeacherStaffId: null },
        });
        await tx.staffAttendanceRecord.deleteMany({ where: { schoolId } });
        await tx.staffSchoolRole.deleteMany({ where: { schoolId } });

        if (exclusiveStaffIds.length > 0) {
          await tx.authSession.deleteMany({
            where: { staffId: { in: exclusiveStaffIds } },
          });
          await tx.broadcastRecipient.deleteMany({
            where: { staffId: { in: exclusiveStaffIds } },
          });
          await tx.staffSubjectAssignment.deleteMany({
            where: { staffId: { in: exclusiveStaffIds } },
          });
          await tx.deviceToken.deleteMany({
            where: { staffId: { in: exclusiveStaffIds } },
          });
          await tx.platformNotificationRead.deleteMany({
            where: { staffId: { in: exclusiveStaffIds } },
          });
          const staffDeleted = await tx.staff.deleteMany({
            where: { id: { in: exclusiveStaffIds } },
          });
          console.log(`[PURGE] Deleted ${staffDeleted.count} exclusive staff records.`);
        }

        await tx.school.update({
          where: { id: schoolId },
          data: { purgeStatus: 'COMPLETED' },
        });
      },
      { maxWait: 15000, timeout: 120000 },
    );

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
  } catch (error) {
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
  } catch (error) {
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

    const originalStatus = school.status;

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
  } catch (error) {
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
  } catch (error) {
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

    const originalStatus = school.status;
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    console.error('Error purging school:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/schools/:id/retry-purge
app.post('/v1/platform/schools/:id/retry-purge', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

    if (school.status !== 'PURGED' || school.purgeStatus !== 'FAILED') {
      return res.status(400).json({ error: 'Purge status is not FAILED' });
    }

    await prisma.school.update({
      where: { id },
      data: {
        purgeStatus: 'PENDING',
      },
    });

    // Trigger background async cleanup job again
    runBackgroundPurge(id);

    return res.json({ status: 'purge_initiated', estimatedCompletionMinutes: 5 });
  } catch (error) {
    console.error('Error retrying purge:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/platform/schools/:id/reset-admin-password
app.post('/v1/platform/schools/:id/reset-admin-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    // Find the School Admin staff record for this school
    const schoolAdminRole = await prisma.staffSchoolRole.findFirst({
      where: {
        schoolId: id,
        role: 'school_admin',
      },
      include: {
        staff: true,
      },
    });

    if (!schoolAdminRole || !schoolAdminRole.staff) {
      return res.status(404).json({ error: 'School admin not found for this school' });
    }

    const staffId = schoolAdminRole.staffId;

    // Generate secure random 12-character temporary password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#%';
    let temporaryPassword = '';
    for (let i = 0; i < 12; i++) {
      temporaryPassword += chars.charAt(crypto.randomInt(0, chars.length));
    }

    // Hash it and update the staff record
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await prisma.staff.update({
      where: { id: staffId },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    console.log(`[PLATFORM] Reset password for staff ${staffId} (school admin of school ${id})`);

    return res.json({ temporaryPassword });
  } catch (error) {
    console.error('Error resetting admin password:', error);
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
  } catch (error) {
    console.error('Error fetching status history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/platform/schools/:id/modules
app.get('/v1/platform/schools/:id/modules', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    const school = await prisma.school.findUnique({ where: { id } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const entitlements = await prisma.schoolModuleEntitlement.findMany({
      where: { schoolId: id },
    });

    const controllableKeys = ['admissions', 'attendance', 'fees', 'communication', 'reports', 'certificates'];
    const coreKeys = ['dashboard', 'staff', 'students', 'settings'];

    const getModuleName = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

    const controllableModules = controllableKeys.map(key => {
      const ent = entitlements.find(e => e.moduleKey === key);
      return {
        moduleKey: key,
        moduleName: getModuleName(key),
        isEnabled: ent ? ent.isEnabled : true,
        disabledAt: ent ? ent.disabledAt : null,
        disabledReason: ent ? ent.disabledReason : null,
      };
    });

    const coreModules = coreKeys.map(key => ({
      moduleKey: key,
      moduleName: getModuleName(key),
      isEnabled: true,
      disabledAt: null,
      disabledReason: null,
      isCore: true,
    }));

    return res.json([...controllableModules, ...coreModules]);
  } catch (error) {
    console.error('Error fetching modules:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /v1/platform/schools/:id/modules/:moduleKey
app.patch('/v1/platform/schools/:id/modules/:moduleKey', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const operatorId = req.user?.id;
    if (!operatorId) return res.status(401).json({ error: 'Unauthorized' });

    const { id, moduleKey } = req.params;
    const { isEnabled, reason } = req.body;

    const controllableKeys = ['admissions', 'attendance', 'fees', 'communication', 'reports', 'certificates'];
    if (!controllableKeys.includes(moduleKey)) {
      return res.status(400).json({ error: 'Invalid module key. Only admissions, attendance, fees, communication, reports, and certificates can be toggled.' });
    }

    if (isEnabled === undefined || typeof isEnabled !== 'boolean') {
      return res.status(400).json({ error: 'isEnabled must be a boolean' });
    }

    if (!isEnabled) {
      if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        return res.status(400).json({ error: 'A disable reason of at least 10 characters is required' });
      }
    }

    const now = new Date();
    await prisma.schoolModuleEntitlement.upsert({
      where: {
        schoolId_moduleKey: {
          schoolId: id,
          moduleKey,
        },
      },
      update: {
        isEnabled,
        enabledAt: isEnabled ? now : undefined,
        disabledAt: !isEnabled ? now : undefined,
        disabledReason: !isEnabled ? reason.trim() : null,
        changedBy: operatorId,
      },
      create: {
        schoolId: id,
        moduleKey,
        isEnabled,
        enabledAt: isEnabled ? now : null,
        disabledAt: !isEnabled ? now : null,
        disabledReason: !isEnabled ? reason.trim() : null,
        changedBy: operatorId,
      },
    });

    // Invalidate Redis cache synchronously
    if (redis) {
      const cacheKey = `module_entitlements:${id}`;
      try {
        await redis.del(cacheKey);
        console.log(`[Redis] Synchronously invalidated cache key: ${cacheKey}`);
      } catch (err) {
        console.error(`[Redis] Failed to delete cache key ${cacheKey}:`, err);
      }
    }

    // Return updated module list
    const entitlements = await prisma.schoolModuleEntitlement.findMany({
      where: { schoolId: id },
    });

    const coreKeys = ['dashboard', 'staff', 'students', 'settings'];
    const getModuleName = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

    const controllableModules = controllableKeys.map(key => {
      const ent = entitlements.find(e => e.moduleKey === key);
      return {
        moduleKey: key,
        moduleName: getModuleName(key),
        isEnabled: ent ? ent.isEnabled : true,
        disabledAt: ent ? ent.disabledAt : null,
        disabledReason: ent ? ent.disabledReason : null,
      };
    });

    const coreModules = coreKeys.map(key => ({
      moduleKey: key,
      moduleName: getModuleName(key),
      isEnabled: true,
      disabledAt: null,
      disabledReason: null,
      isCore: true,
    }));

    return res.json([...controllableModules, ...coreModules]);
  } catch (error) {
    console.error('Error updating module:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Platform-to-School Notifications
app.use('/v1/platform/notifications', platformNotificationsRouter);

app.listen(PORT, () => {
  console.log(`Veyho Admin backend listening at http://localhost:${PORT}`);
});
