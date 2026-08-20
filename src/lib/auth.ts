type TokenPayload = {
  sub?: string;
  exp?: number;
  'x-hasura-user-id'?: string;
  metadata?: {
    'x-hasura-merchant-id'?: string;
  };
};

function decodeTokenPayload(token: string): TokenPayload | null {
  try {
    // JWT tokens have 3 parts separated by dots: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    // Add padding if needed for base64 decoding
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decodedPayload = atob(paddedPayload);
    return JSON.parse(decodedPayload) as TokenPayload;
  } catch {
    return null;
  }
}

// Utility function to decode JWT token and extract the account user ID
export function getUserIdFromToken(token: string): string | null {
  const payloadObj = decodeTokenPayload(token);
  if (!payloadObj) return null;
  return payloadObj['x-hasura-user-id'] ?? payloadObj.sub ?? null;
}

// Utility function to decode JWT token and extract the merchant ID
export function getMerchantIdFromToken(token: string): string | null {
  const payloadObj = decodeTokenPayload(token);
  if (!payloadObj) {
    return null;
  }

  // Current token format nests the merchant id in metadata.x-hasura-merchant-id
  const merchantId =
    payloadObj.metadata?.['x-hasura-merchant-id'] ??
    // Legacy token format carried the merchant id in x-hasura-user-id / sub
    payloadObj['x-hasura-user-id'] ??
    payloadObj.sub;

  return merchantId ?? null;
}

// Utility function to decode JWT token and extract the expiry timestamp (in seconds)
export function getTokenExpiry(token: string): number | null {
  const payloadObj = decodeTokenPayload(token);
  if (!payloadObj) return null;
  const exp = payloadObj.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
}

// Check whether the JWT token has expired
export function isTokenExpired(token: string): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return false;
  return exp * 1000 <= Date.now();
}

// Function to get merchant ID from request headers or cookies
export function getMerchantIdFromRequest(request: Request): string | null {
  // Try to get token from Authorization header first
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return getMerchantIdFromToken(token);
  }

  // Try to get token from cookies
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    if (cookies.authToken) {
      return getMerchantIdFromToken(cookies.authToken);
    }
  }

  return null;
}
