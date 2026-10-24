import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const app = express();
export const prisma = new PrismaClient();

app.use(express.json());

const uploadDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const receiptUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing from .env');
}

const otpStore = new Map<
  string,
  { otp: string; expiresAt: number }
>();

const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{9,14}$/, 'Enter a valid phone number');


type AuthRequest = Request & {
  userId?: string;
};

function auth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.header('authorization');

  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : undefined;

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  try {
    const payload = jwt.verify(
      token,
      JWT_SECRET!,
    ) as { userId: string };

    req.userId = payload.userId;
    next();
  } 
  catch {
    return res.status(401).json({
      error: 'Invalid or expired token',
    });
  }
}


app.post('/loans', auth, async (req: AuthRequest, res: Response) => {
  const parsed = z.object({
    friendName: z.string().trim().min(1).max(80),
    amount: z.coerce.number().positive().max(100000000),
    dueDate: z.iso.datetime().or(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    ),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid loan details',
    });
  }

  const dueDate = new Date(parsed.data.dueDate);

  if (Number.isNaN(dueDate.getTime())) {
    return res.status(400).json({ error: 'Invalid due date' });
  }

  try {
    const loan = await prisma.loan.create({
      data: {
        friendName: parsed.data.friendName,
        amount: parsed.data.amount,
        dueDate,
        userId: req.userId!,
      },
    });

    return res.status(201).json({
      ...loan,
      amount: Number(loan.amount),
      isOverdue: !loan.repaidAt && loan.dueDate < new Date(),
    });
  } catch (error) {
    console.error('Create loan failed:', error);
    return res.status(500).json({ error: 'Could not create loan' });
  }
});


app.get('/loans', auth, async (req: AuthRequest, res: Response) => {
  try {
    const loans = await prisma.loan.findMany({
      where: { userId: req.userId },
      orderBy: [
        { repaidAt: 'asc' },
        { dueDate: 'asc' },
      ],
    });

    const now = new Date();

    return res.json(
      loans.map((loan) => ({
        ...loan,
        amount: Number(loan.amount),
        isOverdue: !loan.repaidAt && loan.dueDate < now,
      })),
    );
  } catch (error) {
    console.error('Fetch loans failed:', error);
    return res.status(500).json({ error: 'Could not fetch loans' });
  }
});


app.patch('/loans/:id/repay',auth,async (req: AuthRequest, res: Response) => {
    try {
      const loan = await prisma.loan.findFirst({
        where: {
          id: req.params.id as string,
          userId: req.userId,
        },
      });

      if (!loan) {
        return res.status(404).json({ error: 'Loan not found' });
      }

      if (loan.repaidAt) {
        return res.status(409).json({
          error: 'Loan is already marked as repaid',
        });
      }

      const updated = await prisma.loan.update({
        where: { id: loan.id },
        data: { repaidAt: new Date() },
      });

      return res.json({
        ...updated,
        amount: Number(updated.amount),
        isOverdue: false,
      });
    } catch (error) {
      console.error('Repay loan failed:', error);
      return res.status(500).json({
        error: 'Could not mark loan as repaid',
      });
    }
  },
);

app.post(
  '/loans/:id/receipt',
  auth,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    receiptUpload.single('receipt')(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          error: error.message || 'Receipt upload failed',
        });
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Choose a receipt image' });
    }

    try {
      const loan = await prisma.loan.findFirst({
        where: { id: req.params.id as string, userId: req.userId },
      });

      if (!loan) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Loan not found' });
      }

      const receiptPath = `/uploads/${req.file.filename}`;

      const updated = await prisma.loan.update({
        where: { id: loan.id },
        data: { receiptPath },
      });

      return res.json({
        message: 'Receipt uploaded successfully',
        receiptPath: updated.receiptPath,
      });
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error('Receipt upload failed:', error);
      return res.status(500).json({ error: 'Could not save receipt' });
    }
  },
);


app.get('/summary', auth, async (req: AuthRequest, res: Response) => {
  try {
    const loans = await prisma.loan.findMany({
      where: { userId: req.userId },
      select: {
        amount: true,
        dueDate: true,
        repaidAt: true,
      },
    });

    const now = new Date();

    const summary = loans.reduce(
      (acc, loan) => {
        const amount = Number(loan.amount);

        acc.totalLent += amount;

        if (loan.repaidAt) {
          acc.totalRepaid += amount;
        } else if (loan.dueDate < now) {
          acc.overdueAmount += amount;
        }

        return acc;
      },
      {
        totalLent: 0,
        totalRepaid: 0,
        overdueAmount: 0,
      },
    );

    return res.json({
      totalLent: Number(summary.totalLent.toFixed(2)),
      totalRepaid: Number(summary.totalRepaid.toFixed(2)),
      overdueAmount: Number(summary.overdueAmount.toFixed(2)),
    });
  } catch (error) {
    console.error('Fetch summary failed:', error);
    return res.status(500).json({
      error: 'Could not fetch summary',
    });
  }
});


app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error(error);
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.post('/auth/request-otp', (req: Request, res: Response) => {
  const parsed = z
    .object({ phone: phoneSchema })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message,
    });
  }

  const { phone } = parsed.data;
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  otpStore.set(phone, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  console.log(`[MiniLedger DEMO OTP] ${phone}: ${otp}`);

  return res.json({
    message: 'OTP generated. Check the backend terminal.',
  });
});

app.post('/auth/verify-otp', async (req: Request, res: Response) => {
  const parsed = z
    .object({
      phone: phoneSchema,
      otp: z.string().regex(/^\d{6}$/, 'OTP must contain six digits'),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message,
    });
  }

  const { phone, otp } = parsed.data;
  const stored = otpStore.get(phone);

  if (!stored || stored.expiresAt < Date.now() || stored.otp !== otp) {
    return res.status(401).json({ error: 'Incorrect or expired OTP' });
  }

  // make the OTP single-use
  otpStore.delete(phone);
  
  //find or create the user using prisma and generate a JWT token for the user
  try {
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });

    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: '7d' },
    );

    return res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('OTP verification failed:', error);
    return res.status(500).json({ error: 'Could not complete login' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MiniLedger server running on port ${PORT}`);
  });
}
