// Versao para Android e web: "Entrar com Apple" so existe no iOS (veja apple-signin.ios.tsx).
export type AppleCredential = { identity_token: string; authorization_code?: string | null; full_name?: string | null };

export async function requestAppleCredential(): Promise<AppleCredential | null> {
  return null;
}

export function AppleSignInButton(_props: { onPress: () => void; disabled?: boolean }) {
  return null;
}
