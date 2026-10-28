import React, { useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";

export type AppleCredential = { identity_token: string; authorization_code?: string | null; full_name?: string | null };

/** Abre a folha nativa "Entrar com Apple". Devolve null se a pessoa cancelar. */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
  try {
    const c = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!c.identityToken) return null;
    // A Apple so entrega o nome no PRIMEIRO login; o servidor guarda.
    const full = [c.fullName?.givenName, c.fullName?.familyName].filter(Boolean).join(" ") || null;
    return { identity_token: c.identityToken, authorization_code: c.authorizationCode, full_name: full };
  } catch (e: any) {
    if (e?.code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
}

/** Botao oficial da Apple (as regras da loja exigem o botao padrao, com o mesmo destaque do login Google). */
export function AppleSignInButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false));
  }, []);
  if (!available) return null;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={14}
      style={{ height: 52, marginTop: 12, opacity: disabled ? 0.6 : 1 }}
      onPress={disabled ? () => {} : onPress}
    />
  );
}
