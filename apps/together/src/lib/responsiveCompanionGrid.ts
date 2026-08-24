export type ResponsiveCompanionGrid = {
  cardHeight: number;
  cardWidth: number;
  columns: 1 | 2 | 3;
  gridWidth: number;
};

/** Keeps portrait cards at their authored 4:5 shape while using the desktop canvas. */
export function responsiveCompanionGrid({
  viewportWidth,
  desktop,
  sidebarWidth = 0,
  gap = 12,
  maxContentWidth = 1180,
}: {
  viewportWidth: number;
  desktop: boolean;
  sidebarWidth?: number;
  gap?: number;
  maxContentWidth?: number;
}): ResponsiveCompanionGrid {
  const shellWidth = Math.max(0, viewportWidth - (desktop ? sidebarWidth : 0));
  const outerPadding = desktop ? 64 : 40;
  const gridWidth = Math.max(280, Math.min(shellWidth, maxContentWidth) - outerPadding);
  const columns: 1 | 2 | 3 = desktop && gridWidth >= 900 ? 3 : gridWidth >= 680 ? 2 : 1;
  const cardWidth = Math.max(1, Math.floor((gridWidth - gap * (columns - 1)) / columns));
  const cardHeight = Math.round(cardWidth / .8);
  return { cardHeight, cardWidth, columns, gridWidth };
}
