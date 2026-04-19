/* js/router.js — Hash-based SPA Router */

const routes = {};

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  // Default to '/' (landing page) — NOT /auth
  const hash = window.location.hash.replace('#', '');
  const path = (hash.split('?')[0]) || '/';
  const handler = routes[path] || routes['*'];
  if (handler) handler(path);
}

export function currentRoute() {
  const hash = window.location.hash.replace('#', '');
  return (hash.split('?')[0]) || '/';
}
