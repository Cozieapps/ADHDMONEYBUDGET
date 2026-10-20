import type { CoachAiBinding } from './coach';
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

declare global {
  interface Env {
    /** Owner passphrase (a Worker secret): signs in devices and approves Claude. */
    SORI_PASSPHRASE: string;
    /** Off by default. Set true only on a Workers Free account with an AI binding. */
    SORI_AI_ENABLED?: string;
    AI?: CoachAiBinding;
    /** Injected by OAuthProvider for the default handler. */
    OAUTH_PROVIDER: OAuthHelpers;
  }
}
