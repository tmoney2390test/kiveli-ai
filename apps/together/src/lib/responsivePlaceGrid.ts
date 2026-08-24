export type ResponsivePlaceGrid = {
  cardWidth: number;
  columns: 1 | 2 | 3;
  gridWidth: number;
};

export function responsivePlaceGrid({
  viewportWidth,
  sidebarWidth = 0,
  outerPadding,
  innerPadding = 0,
  gap,
  maxContentWidth = 1180,
  threeColumnThreshold = 840,
}: {
  viewportWidth: number;
  sidebarWidth?: number;
  outerPadding: number;
  innerPadding?: number;
  gap: number;
  maxContentWidth?: number;
  threeColumnThreshold?: number;
}): ResponsivePlaceGrid {
  const shellWidth = Math.max(0, viewportWidth - sidebarWidth);
  const gridWidth = Math.max(240, Math.min(shellWidth, maxContentWidth) - outerPadding - innerPadding);
  const columns: 1 | 2 | 3 = gridWidth >= threeColumnThreshold ? 3 : gridWidth >= 300 ? 2 : 1;
  const cardWidth = Math.max(1, Math.floor((gridWidth - gap * (columns - 1)) / columns));
  return { cardWidth, columns, gridWidth };
}
