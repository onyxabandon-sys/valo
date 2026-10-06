/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as deviceAccess from "../deviceAccess.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as locations from "../locations.js";
import type * as receiptMetadata from "../receiptMetadata.js";
import type * as reports from "../reports.js";
import type * as seedDemoData from "../seedDemoData.js";
import type * as sessions from "../sessions.js";
import type * as tickets from "../tickets.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  deviceAccess: typeof deviceAccess;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  locations: typeof locations;
  receiptMetadata: typeof receiptMetadata;
  reports: typeof reports;
  seedDemoData: typeof seedDemoData;
  sessions: typeof sessions;
  tickets: typeof tickets;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
