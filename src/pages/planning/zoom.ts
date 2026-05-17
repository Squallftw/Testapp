export type ZoomLevel = 'day' | 'week' | 'month';

export const ZOOM_PX: Record<ZoomLevel, number> = {
  day: 32,
  week: 8,
  month: 2,
};

export const ZOOM_LABEL: Record<ZoomLevel, string> = {
  day: 'Jour',
  week: 'Semaine',
  month: 'Mois',
};
