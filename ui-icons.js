// ui-icons.js: inline SVG icons for the menus (no image files, no emoji: those render differently on every OS).
// icon(name, cls) -> SVG markup. Sized by CSS (default 1em, colour = currentColor unless the icon has its own palette).
// In HTML, <i data-icon="gear"></i> is filled at boot by fillIcons().

const P = {
  // ---- Track biomes ----
  pine: `<path d="M12 2 L18 10 H15 L20 16 H16 L21 21 H3 L8 16 H4 L9 10 H6 Z" fill="#3fae4f" stroke="#1d5e2a" stroke-width="1.2" stroke-linejoin="round"/>
    <rect x="10.5" y="20" width="3" height="3" rx="0.6" fill="#7a4a24"/>`,
  cactus: `<path d="M10 22 V5 a2 2 0 0 1 4 0 V22 Z M5 14 V9 a1.6 1.6 0 0 1 3.2 0 V12.5 H10 V15.5 H6.5 A1.5 1.5 0 0 1 5 14 Z
    M19 11 V7 a1.6 1.6 0 0 0 -3.2 0 V9.5 H14 V12.5 H17.5 A1.5 1.5 0 0 0 19 11 Z" fill="#4caf50" stroke="#24692b" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M7 22.5 H17" stroke="#c9884a" stroke-width="2" stroke-linecap="round"/>`,
  snowflake: `<g stroke="#7fd0ff" stroke-width="2" stroke-linecap="round" fill="none">
    <path d="M12 2 V22 M3.3 7 L20.7 17 M3.3 17 L20.7 7"/>
    <path d="M9.5 3.8 L12 6 L14.5 3.8 M9.5 20.2 L12 18 L14.5 20.2 M3.6 10 L6.8 9.3 L5.8 6.2 M20.4 14 L17.2 14.7 L18.2 17.8 M3.6 14 L6.8 14.7 L5.8 17.8 M20.4 10 L17.2 9.3 L18.2 6.2"/></g>`,

  // ---- Lobby / settings (currentColor) ----
  joystick: `<rect x="3" y="15" width="18" height="6" rx="2.5" fill="currentColor" opacity="0.85"/>
    <rect x="10.8" y="8" width="2.4" height="8" rx="1" fill="currentColor"/>
    <circle cx="12" cy="6.5" r="4" fill="#e8322f" stroke="currentColor" stroke-width="1"/>
    <circle cx="17.5" cy="18" r="1.3" fill="#ffe14a"/>`,
  arrows: `<path d="M10 5 L2 12 L10 19 Z M14 5 L22 12 L14 19 Z" fill="currentColor"/>`,
  speaker: `<path d="M3 9 H7 L12 4.5 V19.5 L7 15 H3 Z" fill="currentColor"/>
    <path d="M15.5 8.5 A5 5 0 0 1 15.5 15.5 M18 6 A8.5 8.5 0 0 1 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  muted: `<path d="M3 9 H7 L12 4.5 V19.5 L7 15 H3 Z" fill="currentColor"/>
    <path d="M15.5 9 L21.5 15 M21.5 9 L15.5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  gear: `<path fill="currentColor" fill-rule="evenodd" d="M10.3 2 h3.4 l.5 2.6 a7.6 7.6 0 0 1 1.9 1.1 l2.5-.9 1.7 2.9 -2 1.7 a7.6 7.6 0 0 1 0 2.2 l2 1.7 -1.7 2.9 -2.5-.9 a7.6 7.6 0 0 1 -1.9 1.1 l-.5 2.6 h-3.4 l-.5-2.6 a7.6 7.6 0 0 1 -1.9-1.1 l-2.5.9 -1.7-2.9 2-1.7 a7.6 7.6 0 0 1 0-2.2 l-2-1.7 1.7-2.9 2.5.9 a7.6 7.6 0 0 1 1.9-1.1 Z M12 8.6 a3.4 3.4 0 1 0 0 6.8 a3.4 3.4 0 1 0 0-6.8 Z"/>`,
  pencil: `<path d="M4 20 L5 15.5 L15.5 5 L19 8.5 L8.5 19 Z" fill="currentColor"/>
    <path d="M14 6.5 L17.5 10" stroke="#1b1f3a" stroke-width="1.3"/>
    <path d="M4 20 L5 15.5 L8.5 19 Z" fill="#ffd9a0"/>`,

  // ---- Items (in-race item button; the shells and the bullet are drawn in CSS) ----
  mushroom: `<path d="M2.5 13 C2.5 6.5 7 3 12 3 C17 3 21.5 6.5 21.5 13 Z" fill="#e8322f" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="12" cy="7" r="2.3" fill="#fff"/><circle cx="6.3" cy="10.3" r="1.7" fill="#fff"/><circle cx="17.7" cy="10.3" r="1.7" fill="#fff"/>
    <path d="M7.5 13 H16.5 V18 A3 3 0 0 1 13.5 21 H10.5 A3 3 0 0 1 7.5 18 Z" fill="#fff1d6" stroke="#fff" stroke-width="1"/>
    <circle cx="10.3" cy="16.2" r="0.9" fill="#2a2b33"/><circle cx="13.7" cy="16.2" r="0.9" fill="#2a2b33"/>`,
  banana: `<path d="M5 6 C4 13 8 19.5 15.5 20 C18.5 20.2 20.8 19 21.5 17.8 C18 18.4 13.5 17.5 10.5 14 C8.3 11.5 7.3 8.6 7.2 5.8 Z"
    fill="#ffd93a" stroke="#c99a00" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M9 9.5 C9.6 12.5 12 15.6 16 17.2" fill="none" stroke="#fff6b0" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M5 6 L4.6 3.6 L7.3 3.4 L7.2 5.8" fill="#7a5a1a"/>`,
  shield: `<path d="M12 2.5 L20 5.5 V11.5 C20 16.5 16.5 20 12 21.5 C7.5 20 4 16.5 4 11.5 V5.5 Z" fill="#5cc8ff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12 5 L17.5 7.2 V11.5 C17.5 15 15.3 17.6 12 18.9 Z" fill="#2f8fe0"/>
    <path d="M7 7.5 C7.5 6.8 8.4 6.4 9.2 6.1" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`,
  star: `<path d="M12 2 L14.9 8.3 L21.8 9 L16.6 13.6 L18.1 20.4 L12 16.9 L5.9 20.4 L7.4 13.6 L2.2 9 L9.1 8.3 Z"
    fill="#ffd23a" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>
    <rect x="9.6" y="10" width="1.4" height="3" rx="0.7" fill="#2a2b33"/><rect x="13" y="10" width="1.4" height="3" rx="0.7" fill="#2a2b33"/>`,

  // ---- Driver roles (AI personalities; not shown on the player's driver: a pick is looks only) ----
  'all-rounder': `<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M12 6.5 L13.6 10.4 L17.6 10.6 L14.5 13.2 L15.5 17.2 L12 15 L8.5 17.2 L9.5 13.2 L6.4 10.6 L10.4 10.4 Z" fill="currentColor"/>`,
  ace: `<path d="M3 8 L7.5 12 L12 5 L16.5 12 L21 8 L19 18 H5 Z" fill="currentColor"/><rect x="5" y="19" width="14" height="2.2" rx="1" fill="currentColor"/>`,
  defender: `<path d="M12 2.5 L20 5.5 V11.5 C20 16.5 16.5 20 12 21.5 C7.5 20 4 16.5 4 11.5 V5.5 Z" fill="currentColor"/>
    <path d="M12 5.5 V18.5" stroke="#1b1f3a" stroke-width="1.4" opacity="0.5"/>`,
  wild: `<path d="M13.5 2 L5 13.5 H11 L9.5 22 L19 9.5 H13 Z" fill="currentColor"/>`,
  bully: `<circle cx="11" cy="14" r="7" fill="currentColor"/><path d="M15 8.5 L17.5 6" stroke="currentColor" stroke-width="2.2"/>
    <path d="M17.5 6 L19 4.5 M19.5 7 L21.5 6.5 M18.5 3 L18.8 1.5" stroke="#ffa21f" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="8.5" cy="11.5" r="1.6" fill="#1b1f3a" opacity="0.35"/>`,
  steady: `<path d="M6 2.5 H18 M6 21.5 H18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M7.5 3 C7.5 8 11 9.5 11 12 C11 14.5 7.5 16 7.5 21 H16.5 C16.5 16 13 14.5 13 12 C13 9.5 16.5 8 16.5 3 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M9 19.5 C9 17.5 12 16 12 16 C12 16 15 17.5 15 19.5 Z" fill="currentColor"/>`,
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

/** Fills every <i data-icon="name"> under root with its SVG. */
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
}
