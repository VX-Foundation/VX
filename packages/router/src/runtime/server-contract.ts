/** Internal incremental-render cache record. */
export interface CachedPage {
  pathname: string;
  body: string;
  status: number;
  headers: [string, string][];
  createdAt: number;
}
