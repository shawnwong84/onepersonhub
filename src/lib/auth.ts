import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prismaUnscoped } from "@/lib/prisma";
import { cookies } from "next/headers";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV !== "test") {
    throw new Error(
      "JWT_SECRET environment variable is required. Set it before starting the application."
    );
  }
  return secret || "test-only-fallback-secret";
}

const JWT_SECRET = getJwtSecret();
const TOKEN_NAME = "owly-token";

function getSessionLifetimeDays(): number {
  const parsed = Number(process.env.SESSION_LIFETIME_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

const SESSION_LIFETIME_DAYS = getSessionLifetimeDays();
// Seconds, not a "7d"-style string: jsonwebtoken types expiresIn strings as a
// closed literal union, which a computed/env-driven value can't satisfy.
const TOKEN_EXPIRY_SECONDS = SESSION_LIFETIME_DAYS * 24 * 60 * 60;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type UserType = "owner" | "member";

export interface TokenPayload {
  userId: string;
  companyId: string;
  role: string;
  userType: UserType;
  tokenVersion: number;
}

export function generateToken(
  userId: string,
  companyId: string,
  role: string,
  userType: UserType = "owner",
  tokenVersion = 0
): string {
  return jwt.sign({ userId, companyId, role, userType, tokenVersion }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY_SECONDS });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    // Tokens issued before member login/tokenVersion existed carry neither field.
    return { ...payload, userType: payload.userType || "owner", tokenVersion: payload.tokenVersion ?? 0 };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  // Not tenant-scoped: we don't know the company until we resolve this
  // token's own userId, and the row itself carries companyId - this is
  // exactly the bootstrap lookup prismaUnscoped exists for.
  if (payload.userType === "member") {
    const member = await prismaUnscoped.teamMember.findUnique({
      where: { id: payload.userId },
      select: { id: true, companyId: true, username: true, name: true, rbacRole: true, isActive: true, tokenVersion: true },
    });
    if (!member || !member.isActive || !member.username) return null;
    if (member.tokenVersion !== payload.tokenVersion) return null; // password changed since this session was issued
    if (member.companyId !== payload.companyId) return null; // moved company / stale token

    return {
      id: member.id,
      companyId: member.companyId,
      username: member.username,
      name: member.name,
      role: member.rbacRole,
      userType: "member" as UserType,
    };
  }

  const admin = await prismaUnscoped.admin.findUnique({
    where: { id: payload.userId },
    select: { id: true, companyId: true, username: true, name: true, role: true, tokenVersion: true },
  });
  if (!admin) return null;
  if (admin.tokenVersion !== payload.tokenVersion) return null; // password changed since this session was issued
  if (admin.companyId !== payload.companyId) return null; // moved company / stale token

  return {
    id: admin.id,
    companyId: admin.companyId,
    username: admin.username,
    name: admin.name,
    role: admin.role,
    userType: "owner" as UserType,
  };
}

export function setAuthCookie(token: string) {
  return {
    name: TOKEN_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * SESSION_LIFETIME_DAYS,
    path: "/",
  };
}

export function clearAuthCookie() {
  return {
    name: TOKEN_NAME,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/",
  };
}
