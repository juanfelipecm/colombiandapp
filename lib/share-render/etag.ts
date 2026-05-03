// Weak ETag for share artifacts. Includes format so PDF and PNG don't share a
// cache entry. Locked in plan-eng-review: ETag based on project.updated_at.

export function makeEtag(updatedAt: string, format: "image" | "pdf"): string {
  return `W/"${format}-${Buffer.from(updatedAt).toString("base64url")}"`;
}
