import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
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
const TOKEN_EXPIRY = "7d";

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
  role: string;
  userType: UserType;
}

export function generateToken(
  userId: string,
  role: string,
  userType: UserType = "owner"
): string {
  return jwt.sign({ userId, role, userType }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    // Tokens issued before member login existed carry no userType.
    return { ...payload, userType: payload.userType || "owner" };
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

  if (payload.userType === "member") {
    const member = await prisma.teamMember.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, name: true, rbacRole: true, isActive: true },
    });
    if (!member || !member.isActive || !member.username) return null;
    return {
      id: member.id,
      username: member.username,
      name: member.name,
      role: member.rbacRole,
      userType: "member" as UserType,
    };
  }

  const admin = await prisma.admin.findUnique({
    where: { id: payload.userId },
    select: { id: true, username: true, name: true, role: true },
  });
  if (!admin) return null;

  return { ...admin, userType: "owner" as UserType };
}

export async function isSetupComplete(): Promise<boolean> {
  const adminCount = await prisma.admin.count();
  return adminCount > 0;
}

export function setAuthCookie(token: string) {
  return {
    name: TOKEN_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
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
