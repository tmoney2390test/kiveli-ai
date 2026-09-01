// The Auth screen defaults to account creation when no explicit sign-in mode
// is present. Rendering it directly avoids competing auth-gate redirects for
// this legacy public URL.
export { default } from './auth';
