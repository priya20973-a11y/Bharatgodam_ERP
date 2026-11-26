export function isTrustedRequestOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    const expectedOrigin = new URL(process.env.NEXTAUTH_URL || request.url).origin;
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}
