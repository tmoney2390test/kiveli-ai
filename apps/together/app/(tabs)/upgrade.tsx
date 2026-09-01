// Keep the legacy tab URL functional without dispatching a navigation update
// while the tab navigator is mounting. Render-time redirects here could loop
// between the static entry route and the restored authenticated route on web.
export { default } from '../subscription';
