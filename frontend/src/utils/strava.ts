/** Display-only selection: never mutates or deletes the imported history. */
export function latestStravaActivities<T extends { activity_id: number; date: string; start_date?: string }>(activities: readonly T[]): T[] {
 return [...activities].sort((a,b) => (Date.parse(b.start_date ?? b.date) || 0) - (Date.parse(a.start_date ?? a.date) || 0) || b.activity_id-a.activity_id).slice(0,3);
}
