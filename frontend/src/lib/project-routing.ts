/** Parse only positive base-10 integer project IDs used by application routes. */
export function parseProjectRouteId(raw: string | null | undefined): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const projectId = Number(raw);
  return Number.isSafeInteger(projectId) && projectId > 0 ? projectId : null;
}
