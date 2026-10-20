// Types for blombo-core.js, so Blombo's tests can import it. Not used by ComfyUI.

export interface BridgeParams {
  token: string;
  api: string | null;
}
export interface BridgeGraphs {
  workflow: Record<string, unknown>;
  output: Record<string, unknown>;
}
type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export function readParams(search: string): BridgeParams | null;
export function cleanUrl(href: string): string;
export function configuredApi(fetchFn: FetchFn, baseUrl: string): Promise<string | null>;
export function pickApi(fromUrl: string | null, configured: string | null): string | null;
export function createClient(
  api: string,
  fetchFn: FetchFn,
): {
  session(token: string): Promise<{ workflowId: string; name: string; graph: unknown }>;
  save(
    token: string,
    graphs: BridgeGraphs,
    mode: "overwrite" | "copy",
  ): Promise<{ workflowId: string; name: string; next: string | null; message: string }>;
  cancel(token: string): Promise<null>;
  send(graphs: BridgeGraphs, name?: string): Promise<{ workflowId: string; name: string; message: string }>;
};
export function toGraphs(result: unknown): BridgeGraphs;
