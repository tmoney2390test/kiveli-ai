// Legacy /profile links used to open the active companion. A user-profile route
// must always resolve to user-owned account settings instead.
// Render Settings in place so a restored static entry cannot race a redirect.
export { default } from '../settings';
