import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getUserByEmail, createUser } from '@/lib/db/sql/client';
import { hashPassword } from '@/lib/auth/password';

const registerSchema = z.object({
  // Trim before validating so surrounding whitespace (common from mobile
  // autofill) doesn't fail the email check. Canonical lowercasing happens in
  // the DB layer (normalizeEmail) so lookups always agree.
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      // Surface the first validation issue as a clean, human-readable message
      // rather than dumping the raw zod error object to the client.
      const firstIssue = parsed.error.issues[0];
      const message = firstIssue
        ? `${firstIssue.path.join('.') || 'input'}: ${firstIssue.message}`
        : 'Invalid registration details.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { email, password, name } = parsed.data;

    const existing = getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = createUser({
      id: uuidv4(),
      email,
      passwordHash,
      name: name ?? null,
      provider: 'credentials',
    });

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error registering user:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
