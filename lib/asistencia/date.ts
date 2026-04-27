// Bogotá date as YYYY-MM-DD. Server runs UTC; teachers don't.
// en-CA gives ISO order out of the box ("YYYY-MM-DD").
export function bogotaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
