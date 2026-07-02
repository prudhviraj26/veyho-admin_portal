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

app.listen(PORT, () => {
  console.log(`Veyho Admin backend listening at http://localhost:${PORT}`);
});
