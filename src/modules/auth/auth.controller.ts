import { Elysia, t } from "elysia";
import { authPlugin, authenticate, setAuthCookies, clearAuthCookies } from "@/middleware/auth";
import { authService, toSafeUser } from "./auth.service";

export const authController = new Elysia({ prefix: "/auth", tags: ["Auth"] })
  .use(authPlugin)

  .post(
    "/login",
    async ({ body, cookie, jwt, refreshJwt }) => {
      const user = await authService.login(body.username, body.password);

      // access token: 15 menit
      const accessToken = await jwt.sign({
        sub: user.id,
        role: user.role,
        type: "access",
      });

      // refresh token: 7 hari
      const refreshToken = await refreshJwt.sign({
        sub: user.id,
        type: "refresh",
      });

      setAuthCookies(cookie, accessToken, refreshToken);

      return {
        success: true,
        data: {
          user: toSafeUser(user),
        },
      };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
        password: t.String({ minLength: 6 }),
      }),
      detail: { summary: "Login & set HTTP-only cookie JWT" },
    },
  )

  .post(
    "/refresh",
    async ({ cookie, jwt, refreshJwt, set }) => {
      const refreshToken = String(cookie.refresh_token?.value ?? "");
      if (!refreshToken) {
        set.status = 401;
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Missing refresh token cookie" },
        };
      }

      const payload = await refreshJwt.verify(refreshToken);
      if (!payload) {
        set.status = 401;
        return {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid refresh token" },
        };
      }

      const user = await authService.getUserById(payload.sub);

      // Rotasi token: terbitkan ulang access (dan refresh baru utk keamanan)
      const newAccessToken = await jwt.sign({
        sub: user.id,
        role: user.role,
        type: "access",
      });
      const newRefreshToken = await refreshJwt.sign({
        sub: user.id,
        type: "refresh",
      });

      setAuthCookies(cookie, newAccessToken, newRefreshToken);

      return {
        success: true,
        data: { user: toSafeUser(user) },
      };
    },
    { detail: { summary: "Refresh access token via HTTP-only cookie" } },
  )

  .post(
    "/logout",
    ({ cookie }) => {
      // Kosongkan cookie (expire di masa lalu)
      clearAuthCookies(cookie);
      return { success: true };
    },
    { detail: { summary: "Logout & hapus cookie" } },
  )

  .use(authenticate())
  .get(
    "/me",
    async ({ authUser }) => {
      const user = await authService.getUserById(authUser.id);
      return { success: true, data: { user: toSafeUser(user) } };
    },
    { detail: { summary: "Get current authenticated user" } },
  )

  .post(
    "/change-password",
    async ({ authUser, body }) => {
      await authService.changePassword(
        authUser.id,
        body.currentPassword,
        body.newPassword,
      );
      return { success: true };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 6 }),
        newPassword: t.String({ minLength: 8 }),
      }),
      detail: { summary: "Change own password" },
    },
  );