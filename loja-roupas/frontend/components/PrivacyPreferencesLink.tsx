'use client';

export function PrivacyPreferencesLink() {
  return <button className="privacy-preferences-link" type="button" onClick={() => window.dispatchEvent(new Event('agape:open-privacy-preferences'))}>preferências de privacidade</button>;
}
