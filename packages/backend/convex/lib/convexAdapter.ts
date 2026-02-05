import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";
import type { Infer } from "convex/values";
import { baseIdentity, externalFields } from "../functions";
import { api } from "../_generated/api";

// ═══════════════════════════════════════════════════════════════════
// INFERRED TYPES
// ═══════════════════════════════════════════════════════════════════

/** Identity shape inferred from baseIdentity validator */
type Identity = Infer<typeof baseIdentity>;

/** External auth fields inferred from externalFields validator */
type ExternalAuthFields = Infer<typeof externalFields>;

/** Identifier shape inferred from getUserInfo args */
type GetUserInfoArgs = FunctionArgs<typeof api.auth.getUserInfo>;
export type Identifier = GetUserInfoArgs["identifier"];

// ═══════════════════════════════════════════════════════════════════
// TOKEN TYPES
// ═══════════════════════════════════════════════════════════════════

export type JwtToken = {
  type: "jwt";
  token: string;
};

export type ExternalToken = {
  type: "ext";
  externalToken: string;
  identifier: Identifier;
};

export type TokenConfig = JwtToken | ExternalToken;

// ═══════════════════════════════════════════════════════════════════
// FUNCTION MAPPING
// ═══════════════════════════════════════════════════════════════════

/**
 * Maps a function to its external variant.
 * Convention: `get` -> `getExt`, `update` -> `updateExt`
 */
export type ToExternal<T extends string> = `${T}Ext`;

/**
 * Extracts the base function name from an external variant.
 */
export type FromExternal<T extends string> = T extends `${infer Base}Ext` ? Base : never;

// ═══════════════════════════════════════════════════════════════════
// CONVEX ADAPTER
// ═══════════════════════════════════════════════════════════════════

/**
 * A unified Convex client adapter that handles both JWT and external token auth.
 *
 * For JWT tokens, it uses the standard ConvexHttpClient with setAuth().
 * For external tokens, it fetches identity via getUserInfo and automatically
 * injects the external auth fields into function calls.
 *
 * @example
 * ```ts
 * // JWT auth (uses api.chats.index.get)
 * const adapter = await createConvexAdapter(url, { type: "jwt", token: "..." });
 * const chat = await adapter.query(api.chats.index.get, { _id: chatId });
 *
 * // External auth (uses api.chats.index.getExt with identity injected)
 * const adapter = await createConvexAdapter(url, {
 *   type: "ext",
 *   externalToken: "...",
 *   identifier: { type: "memberId", value: "..." }
 * });
 * const chat = await adapter.query(api.chats.index.getExt, { _id: chatId });
 * ```
 */
export class ConvexAdapter {
  private client: ConvexHttpClient;
  private tokenType: "jwt" | "ext";
  private externalToken: string | null = null;
  private identity: Identity | null = null;

  private constructor(url: string, tokenType: "jwt" | "ext") {
    this.client = new ConvexHttpClient(url);
    this.tokenType = tokenType;
  }

  /**
   * Create a ConvexAdapter with JWT auth.
   */
  static withJwt(url: string, token: string): ConvexAdapter {
    const adapter = new ConvexAdapter(url, "jwt");
    adapter.client.setAuth(token);
    return adapter;
  }

  /**
   * Create a ConvexAdapter with external token auth.
   * Fetches identity from getUserInfo before returning.
   */
  static async withExternal(
    url: string,
    externalToken: string,
    identifier: Identifier
  ): Promise<ConvexAdapter> {
    const adapter = new ConvexAdapter(url, "ext");
    adapter.externalToken = externalToken;

    // Fetch identity using getUserInfo
    const identity = await adapter.client.query(api.auth.getUserInfo, {
      externalToken,
      identifier,
    });
    adapter.identity = identity;

    return adapter;
  }

  /**
   * Execute a query function.
   * For external tokens, injects auth fields automatically.
   */
  async query<F extends FunctionReference<"query", "public">>(
    fn: F,
    args: FunctionArgs<F>
  ): Promise<FunctionReturnType<F>> {
    const enrichedArgs = this.enrichArgs(args);
    return this.client.query(fn, enrichedArgs as FunctionArgs<F>);
  }

  /**
   * Execute a mutation function.
   * For external tokens, injects auth fields automatically.
   */
  async mutation<F extends FunctionReference<"mutation", "public">>(
    fn: F,
    args: FunctionArgs<F>
  ): Promise<FunctionReturnType<F>> {
    const enrichedArgs = this.enrichArgs(args);
    return this.client.mutation(fn, enrichedArgs as FunctionArgs<F>);
  }

  /**
   * Execute an action function.
   * For external tokens, injects auth fields automatically.
   */
  async action<F extends FunctionReference<"action", "public">>(
    fn: F,
    args: FunctionArgs<F>
  ): Promise<FunctionReturnType<F>> {
    const enrichedArgs = this.enrichArgs(args);
    return this.client.action(fn, enrichedArgs as FunctionArgs<F>);
  }

  /**
   * Get the current identity (for external tokens) or null (for JWT).
   * Useful when you need to access the identity without a function call.
   */
  getIdentity(): Identity | null {
    return this.identity;
  }

  /**
   * Get the token type.
   */
  getTokenType(): "jwt" | "ext" {
    return this.tokenType;
  }

  /**
   * Get the underlying ConvexHttpClient for advanced use cases.
   */
  getClient(): ConvexHttpClient {
    return this.client;
  }

  /**
   * Enrich args with external auth fields if using external token.
   */
  private enrichArgs<T extends Record<string, unknown>>(args: T): T {
    if (this.tokenType === "ext" && this.identity && this.externalToken) {
      return {
        ...args,
        externalToken: this.externalToken,
        ...this.identity,
      };
    }
    return args;
  }
}

/**
 * Factory function to create a ConvexAdapter.
 * Returns a Promise for external tokens (needs to fetch identity).
 */
export async function createConvexAdapter(
  url: string,
  tokenConfig: TokenConfig
): Promise<ConvexAdapter> {
  if (tokenConfig.type === "jwt") {
    return ConvexAdapter.withJwt(url, tokenConfig.token);
  }
  return ConvexAdapter.withExternal(
    url,
    tokenConfig.externalToken,
    tokenConfig.identifier
  );
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: TOKEN PARSING
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse token config from URL search params.
 * Supports both JWT tokens and external tokens with identifier.
 *
 * For JWT: `?token=<jwt>` or `?token=<jwt>&tokenType=jwt`
 * For External: `?token=<ext_token>&tokenType=ext&userId=...` or `?token=<ext_token>&tokenType=ext&memberId=...`
 */
export function parseTokenFromUrl(url: URL): TokenConfig | null {
  const token = url.searchParams.get("token");
  const tokenType = url.searchParams.get("tokenType") ?? "jwt";

  if (!token) return null;

  if (tokenType === "ext") {
    const userId = url.searchParams.get("userId");
    const memberId = url.searchParams.get("memberId");

    if (!userId && !memberId) {
      throw new Error("External token requires either userId or memberId");
    }

    const identifier: Identifier = memberId
      ? { type: "memberId", value: memberId }
      : { type: "userId", value: userId! };

    return {
      type: "ext",
      externalToken: token,
      identifier,
    };
  }

  return {
    type: "jwt",
    token,
  };
}

// ═══════════════════════════════════════════════════════════════════
// TYPE HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Helper type to strip external auth fields from args.
 * Use this when defining function args that should work with both auth types.
 */
export type StripExternalAuth<T> = Omit<T, keyof ExternalAuthFields>;

/**
 * Helper type to add external auth fields to args.
 */
export type WithExternalAuth<T> = T & ExternalAuthFields;
