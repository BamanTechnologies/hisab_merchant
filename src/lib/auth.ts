// Utility function to decode JWT token and extract user ID
export function getUserIdFromToken(token: string): string | null {
  try {
    // JWT tokens have 3 parts separated by dots: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT token format');
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    // Add padding if needed for base64 decoding
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decodedPayload = atob(paddedPayload);
    const payloadObj = JSON.parse(decodedPayload);

    // Extract user ID from the token payload
    // The user ID is typically in 'sub' field or 'x-hasura-user-id' field
    const userId = payloadObj['x-hasura-user-id'] || payloadObj.sub;
    
    if (!userId) {
      console.error('User ID not found in token payload');
      return null;
    }

    return userId;
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return null;
  }
}

// Function to get user ID from request headers or cookies
export function getUserIdFromRequest(request: Request): string | null {
  // Try to get token from Authorization header first
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return getUserIdFromToken(token);
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
      return getUserIdFromToken(cookies.authToken);
    }
  }

  return null;
}
