export function profileAge(profile: { birth_date?: string; age_years?: number; age_recorded_on?: string }) {
 const now = new Date();
 if (profile.age_years !== undefined && profile.age_recorded_on) {
  const recorded = new Date(profile.age_recorded_on + "T12:00:00");
  const elapsed = now.getFullYear()-recorded.getFullYear()-Number(now.getMonth()<recorded.getMonth() || now.getMonth()===recorded.getMonth()&&now.getDate()<recorded.getDate());
  return profile.age_years + Math.max(0, elapsed);
 }
 if (!profile.birth_date) return undefined;
 const b = new Date(profile.birth_date + "T12:00:00");
 return now.getFullYear()-b.getFullYear()-Number(now.getMonth()<b.getMonth() || now.getMonth()===b.getMonth()&&now.getDate()<b.getDate());
}
