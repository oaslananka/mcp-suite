export interface ForgePrincipal {
  id: string;
  scopes: string[];
  expiresAt?: number;
}

export interface ForgeAuthPolicyOptions {
  authToken?: string;
  authTokens?: Record<string, ForgePrincipal>;
}

export class ForgeAuthPolicy {
  private readonly principalsByToken = new Map<string, ForgePrincipal>();

  constructor(options: ForgeAuthPolicyOptions = {}) {
    for (const [token, principal] of Object.entries(options.authTokens ?? {})) {
      if (token) {
        this.principalsByToken.set(token, normalizePrincipal(principal));
      }
    }

    if (options.authToken && !this.principalsByToken.has(options.authToken)) {
      this.principalsByToken.set(options.authToken, {
        id: "forge-api-token",
        scopes: ["api:*", "events:*"],
      });
    }
  }

  isConfigured(): boolean {
    return this.principalsByToken.size > 0;
  }

  resolveBearer(authorization: string | undefined): ForgePrincipal | undefined {
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    const token = authorization.slice("Bearer ".length);
    if (!token) {
      return undefined;
    }
    const principal = this.principalsByToken.get(token);
    if (!principal) {
      return undefined;
    }
    if (principal.expiresAt !== undefined && principal.expiresAt <= Date.now()) {
      return undefined;
    }
    return principal;
  }

  hasScope(principal: ForgePrincipal, requiredScope: string): boolean {
    if (principal.scopes.includes("*")) {
      return true;
    }

    if (principal.scopes.includes(requiredScope)) {
      return true;
    }

    const separator = requiredScope.indexOf(":");
    if (separator === -1) {
      return false;
    }
    return principal.scopes.includes(`${requiredScope.slice(0, separator)}:*`);
  }

  hasAnyScope(principal: ForgePrincipal, requiredScopes: string[]): boolean {
    return requiredScopes.some((scope) => this.hasScope(principal, scope));
  }
}

function normalizePrincipal(principal: ForgePrincipal): ForgePrincipal {
  const id = principal.id.trim();
  if (!id) {
    throw new Error("Forge principal ID must not be empty");
  }
  if (principal.expiresAt !== undefined && !Number.isFinite(principal.expiresAt)) {
    throw new Error("Forge principal expiry must be a finite epoch timestamp");
  }
  return {
    id,
    scopes: [...new Set(principal.scopes.map((scope) => scope.trim()).filter(Boolean))],
    ...(principal.expiresAt !== undefined ? { expiresAt: principal.expiresAt } : {}),
  };
}
