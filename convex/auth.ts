import { expo } from '@better-auth/expo';
import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { twoFactor } from 'better-auth/plugins';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';
import { SESSION_MAX_AGE_SECONDS } from '../shared/sessionPolicy';
import { trustedAuthOrigins } from '../shared/trustedAuthOrigins';

export const authComponent = createClient<DataModel>(components.betterAuth);

const resolveAuthBaseURL = () => {
  return process.env.CONVEX_SITE_URL ?? process.env.BETTER_AUTH_URL;
};

const ensureExpoOriginPlugin = {
  id: "expo-origin-bridge",
  onRequest: async (request: Request) => {
    const headers = new Headers(request.headers);
    const originFromUrl = new URL(request.url).origin;
    const existingOrigin = headers.get("origin");
    const existingReferer = headers.get("referer");

    if (!existingOrigin) {
      headers.set("origin", originFromUrl);
    }
    const finalOrigin = headers.get("origin") ?? originFromUrl;
    if (!existingReferer) {
      headers.set("referer", `${finalOrigin}/`);
    }
    if (!headers.get("expo-origin")) {
      const expoOrigin = finalOrigin.startsWith("http") ? finalOrigin : "valetpos://";
      headers.set("expo-origin", expoOrigin);
    }
    if (
      request.headers.get("origin") !== headers.get("origin") ||
      request.headers.get("referer") !== headers.get("referer") ||
      request.headers.get("expo-origin") !== headers.get("expo-origin")
    ) {
      return { request: new Request(request, { headers }) };
    }
      return;
  },
};

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  baseURL: resolveAuthBaseURL(),
  trustedOrigins: trustedAuthOrigins(resolveAuthBaseURL(), process.env.ADMIN_DASHBOARD_ORIGIN),
  database: authComponent.adapter(ctx),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  disabledPaths: ['/sign-up/email'],
  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    disableSessionRefresh: true,
  },
  plugins: [
    ensureExpoOriginPlugin,
    expo(),
    twoFactor({ issuer: 'Valet POS' }),
    convex({ authConfig }),
  ],
}) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));

export async function createCredentialAccount(
  ctx: GenericCtx<DataModel>,
  values: { email: string; name: string; password: string },
) {
  const authContext = await createAuth(ctx).$context;
  const existing = await authContext.internalAdapter.findUserByEmail(values.email);
  if (existing) {
    throw new Error('AUTH_ACCOUNT_EXISTS');
  }

  const user = await authContext.internalAdapter.createUser({
    email: values.email,
    emailVerified: false,
    name: values.name,
  });

  try {
    const passwordHash = await authContext.password.hash(values.password);
    await authContext.internalAdapter.linkAccount({
      accountId: user.id,
      providerId: 'credential',
      password: passwordHash,
      userId: user.id,
    });
  } catch (error) {
    await authContext.internalAdapter.deleteUser(user.id);
    throw error;
  }

  return { id: user.id };
}

export async function setCredentialPassword(
  ctx: GenericCtx<DataModel>,
  values: { authUserId: string; password: string },
) {
  const authContext = await createAuth(ctx).$context;
  const user = await authContext.internalAdapter.findUserById(values.authUserId);
  if (!user) throw new Error('AUTH_ACCOUNT_NOT_FOUND');

  const passwordHash = await authContext.password.hash(values.password);
  const accounts = await authContext.internalAdapter.findAccounts(values.authUserId);
  if (accounts.some(account => account.providerId === 'credential')) {
    await authContext.internalAdapter.updatePassword(values.authUserId, passwordHash);
  } else {
    await authContext.internalAdapter.linkAccount({
      accountId: values.authUserId,
      providerId: 'credential',
      password: passwordHash,
      userId: values.authUserId,
    });
  }
}

export async function deleteCredentialAccount(ctx: GenericCtx<DataModel>, authUserId: string) {
  const authContext = await createAuth(ctx).$context;
  const user = await authContext.internalAdapter.findUserById(authUserId);
  if (!user) return;
  await authContext.internalAdapter.deleteUserSessions(authUserId);
  await authContext.internalAdapter.deleteUser(authUserId);
}

export async function deleteCredentialAccountByEmail(ctx: GenericCtx<DataModel>, email: string) {
  const authContext = await createAuth(ctx).$context;
  const user = await authContext.internalAdapter.findUserByEmail(email.trim().toLowerCase());
  if (!user) return;
  await authContext.internalAdapter.deleteUserSessions(user.user.id);
  await authContext.internalAdapter.deleteUser(user.user.id);
}
