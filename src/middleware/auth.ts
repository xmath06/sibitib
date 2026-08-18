import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { config } from "@/config";
import { unauthorized, forbidden } from "./errors";

export type AuthUser = {
  id: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
};

const accessSchema = t.Object({
  sub: t.String(),
  role: t.Union([
    t.Literal("ADMIN"),
    t.Literal("TEACHER"),
    t.Literal("STUDENT"),
  ]),
  type: t.Literal("access"),
});

const refreshSchema = t.Object({
  sub: t.String(),
  type: t.Literal("refresh"),
});

// Plugin dasar yang menyediakan jwt ke context.
// Cookie memakai API reaktif bawaan Elysia 1.x (ctx.cookie).
export const authPlugin = new Elysia({ name: "auth:plugin" })
  .use(
    jwt({
      name: "jwt",
      secret: config.jwt.secret,
      schema: accessSchema,
    }),
  )
  .use(
    jwt({
      name: "refreshJwt",
      secret: config.jwt.secret,
      schema: refreshSchema,
    }),
  );

// Cookie options untuk HTTP-Only cookie (anti-XSS).
export const accessCookieOptions = {
  httpOnly: true,
  secure: config.jwt.cookieSecure,
  sameSite: config.jwt.cookieSameSite,
  path: "/",
  maxAge: 15 * 60, // 15 menit, sesuai JWT_ACCESS_EXPIRES
} as const;

export const refreshCookieOptions = {
  httpOnly: true,
  secure: config.jwt.cookieSecure,
  sameSite: config.jwt.cookieSameSite,
  // Hanya dikirim ke endpoint refresh
  path: "/api/v1/auth/refresh",
  maxAge: 7 * 24 * 60 * 60, // 7 hari, sesuai JWT_REFRESH_EXPIRES
} as const;

type CookieMap = Record<string, { set(options: Record<string, unknown>): void; value?: unknown }>;

// Set HTTP-only cookie lewat API reaktif bawaan Elysia 1.x.
export const setAuthCookies = (
  cookie: CookieMap,
  accessToken: string,
  refreshToken: string,
) => {
  cookie.access_token?.set({ value: accessToken, ...accessCookieOptions });
  cookie.refresh_token?.set({ value: refreshToken, ...refreshCookieOptions });
};

export const clearAuthCookies = (cookie: CookieMap) => {
  cookie.access_token?.set({ value: "", ...accessCookieOptions, maxAge: 0 });
  cookie.refresh_token?.set({ value: "", ...refreshCookieOptions, maxAge: 0 });
};

// Middleware autentikasi: memverifikasi access token dari HTTP-only cookie.
// `as: "global"` agar tipe authUser ikut ter-propagation ke route setelah .use().
// Usage: .use(authenticate())
export const authenticate = () =>
  new Elysia({ name: "auth:authenticate" })
    .use(authPlugin)
    .derive(
      { as: "global" },
      async ({ cookie: cookies, jwt: jwtRef }) => {
        const token = String(cookies.access_token?.value ?? "");
        if (!token) throw unauthorized("Missing access token cookie");

        const payload = await jwtRef.verify(token);
        if (!payload) throw unauthorized("Invalid or expired access token");

        return {
          authUser: { id: payload.sub, role: payload.role },
        } satisfies { authUser: AuthUser };
      },
    );

// RBAC guard config. Usage:
//   .use(authenticate()).guard(requireRole("ADMIN", "TEACHER"))
export const requireRole = (...roles: Array<AuthUser["role"]>) => ({
  beforeHandle: ({ authUser }: { authUser?: AuthUser }) => {
    if (!authUser || !roles.includes(authUser.role)) {
      throw forbidden("You do not have permission to access this resource");
    }
  },
});