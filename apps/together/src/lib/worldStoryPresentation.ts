export function storyReturnDate(value: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a return date as YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month! - 1 || date.getDate() !== day) throw new Error('Choose a real calendar date.');
  if (date.getTime() <= now.getTime()) throw new Error('Choose a return date in the future.');
  return date.toISOString();
}

export function storyStatusLabel(status: string) {
  return ({ active: 'In progress', paused: 'Paused', completed: 'Completed', unstarted: 'New story' } as Record<string, string>)[status] ?? 'Story';
}
