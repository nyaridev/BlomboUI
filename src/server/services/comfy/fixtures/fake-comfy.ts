/**
 * A fake ComfyUI for tests: the HTTP endpoints and WebSocket events Blombo uses, with no GPU.
 * Queued prompts "run" in a few milliseconds: execution_start → progress → a binary preview →
 * executed → execution_success. Import startFakeComfy() in-process, or run this file with
 * `node fake-comfy.ts --port N [--step-ms 40] [--output-directory DIR]` to stand in for a
 * managed slot's main.py. With an output directory, each run writes a small PNG there (with the
 * prompt and extra chunks, like ComfyUI's SaveImage) so the gallery can index it.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { type WebSocket, WebSocketServer } from "ws";

export interface FakeComfy {
  url: string;
  port: number;
  /** Prompts received by POST /prompt, newest last. */
  prompts: Array<{
    prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    extra: unknown;
  }>;
  /** Make the next prompt fail validation with this node error. */
  failNext: (nodeErrors: unknown) => void;
  close: () => Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const objectInfo = fs.readFileSync(
  path.join(here, "..", "..", "workflows", "fixtures", "object_info.json"),
  "utf8",
);
// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** A small solid-color PNG with tEXt chunks, like ComfyUI's SaveImage writes. */
function pngWithText(
  width: number,
  height: number,
  rgb: [number, number, number],
  text: Record<string, string>,
): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.byteLength, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...Object.entries(text).map(([k, v]) => chunk("tEXt", Buffer.from(`${k}\0${v}`, "latin1"))),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ComfyUI's filename_prefix date tokens. */
function expandPrefix(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return prefix
    .replace(/%year%/g, String(d.getFullYear()))
    .replace(/%month%/g, pad(d.getMonth() + 1))
    .replace(/%day%/g, pad(d.getDate()));
}

export function startFakeComfy(
  port = 0,
  stepDelayMs = 5,
  outputDir: string | null = null,
): Promise<FakeComfy> {
  let counter = 0;
  const sockets = new Map<string, WebSocket>();
  const prompts: FakeComfy["prompts"] = [];
  const history: Record<string, unknown> = {};
  let failure: unknown = null;
  let interrupted = false;

  const send = (clientId: string, type: string, data: unknown) =>
    sockets.get(clientId)?.send(JSON.stringify({ type, data }));
  const sendPreview = (clientId: string, promptId: string) => {
    const meta = Buffer.from(
      JSON.stringify({ prompt_id: promptId, node_id: "3", image_type: "image/png" }),
    );
    const head = Buffer.alloc(8);
    head.writeUInt32BE(4, 0);
    head.writeUInt32BE(meta.byteLength, 4);
    sockets.get(clientId)?.send(Buffer.concat([head, meta, PNG]));
  };

  const run = async (
    clientId: string,
    promptId: string,
    steps: number,
    job: { prompt: FakeComfy["prompts"][number]["prompt"]; extra: unknown },
  ) => {
    const wait = () => new Promise((r) => setTimeout(r, stepDelayMs));
    interrupted = false;
    send(clientId, "execution_start", { prompt_id: promptId });
    for (let i = 1; i <= steps; i++) {
      await wait();
      if (interrupted) {
        send(clientId, "execution_interrupted", { prompt_id: promptId, node_id: "3" });
        return;
      }
      send(clientId, "progress", { value: i, max: steps, prompt_id: promptId, node: "3" });
      if (i === 1) sendPreview(clientId, promptId);
    }
    let images = [
      { filename: `ComfyUI_${promptId.slice(0, 5)}_00001_.png`, subfolder: "", type: "output" },
    ];
    if (outputDir) {
      const save = Object.values(job.prompt).find((n) => "filename_prefix" in n.inputs);
      const prefix = expandPrefix(String(save?.inputs.filename_prefix ?? "ComfyUI")).replace(
        /\\/g,
        "/",
      );
      const subfolder = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
      const base = prefix.split("/").pop() || "ComfyUI";
      const dir = path.join(outputDir, ...subfolder.split("/").filter(Boolean));
      fs.mkdirSync(dir, { recursive: true });
      // Like ComfyUI: the next number that isn't taken in that folder.
      let filename = "";
      do {
        counter++;
        filename = `${base}_${String(counter).padStart(5, "0")}_.png`;
      } while (fs.existsSync(path.join(dir, filename)));
      const latent = Object.values(job.prompt).find(
        (n) => "width" in n.inputs && "height" in n.inputs,
      );
      const w = Math.max(8, Math.min(1024, Number(latent?.inputs.width ?? 64) / 8));
      const h = Math.max(8, Math.min(1024, Number(latent?.inputs.height ?? 64) / 8));
      const text: Record<string, string> = { prompt: JSON.stringify(job.prompt) };
      const extra = (job.extra as { extra_pnginfo?: Record<string, unknown> } | null)
        ?.extra_pnginfo;
      for (const [k, v] of Object.entries(extra ?? {})) text[k] = JSON.stringify(v);
      const hue = (counter * 47) % 255;
      fs.writeFileSync(path.join(dir, filename), pngWithText(w, h, [hue, 120, 255 - hue], text));
      images = [{ filename, subfolder, type: "output" }];
    }
    history[promptId] = {
      outputs: { "9": { images } },
      status: { status_str: "success", completed: true },
    };
    send(clientId, "executed", { node: "9", output: { images }, prompt_id: promptId });
    send(clientId, "execution_success", { prompt_id: promptId });
  };

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let body = "";
    req.on("data", (c: Buffer) => {
      body += c.toString();
    });
    req.on("end", () => {
      const p = url.pathname;
      if (p === "/system_stats")
        return json(res, 200, {
          system: { comfyui_version: "0.0.0-fake" },
          devices: [
            {
              name: "cuda:0 Fake GPU : cudaMallocAsync",
              type: "cuda",
              vram_total: 16 * 1024 ** 3,
              vram_free: 12 * 1024 ** 3,
            },
          ],
        });
      if (p === "/object_info") return json(res, 200, objectInfo);
      if (p.startsWith("/models/"))
        return json(res, 200, p.endsWith("/checkpoints") ? ["sd15/dreamshaper_8.safetensors"] : []);
      if (p === "/prompt" && req.method === "POST") {
        const parsed = JSON.parse(body) as {
          prompt: FakeComfy["prompts"][number]["prompt"];
          client_id: string;
          extra_data: unknown;
        };
        if (failure) {
          const node_errors = failure;
          failure = null;
          return json(res, 400, {
            error: {
              type: "prompt_outputs_failed_validation",
              message: "Prompt outputs failed validation",
            },
            node_errors,
          });
        }
        prompts.push({ prompt: parsed.prompt, extra: parsed.extra_data });
        const promptId = randomUUID();
        json(res, 200, { prompt_id: promptId, number: prompts.length, node_errors: {} });
        const sampler = Object.values(parsed.prompt).find((n) => "steps" in n.inputs);
        void run(parsed.client_id, promptId, Number(sampler?.inputs.steps ?? 3), {
          prompt: parsed.prompt,
          extra: parsed.extra_data,
        });
        return;
      }
      if (p.startsWith("/history/")) {
        const id = decodeURIComponent(p.slice("/history/".length));
        return json(res, 200, history[id] ? { [id]: history[id] } : {});
      }
      if (p === "/interrupt") {
        interrupted = true;
        return json(res, 200, {});
      }
      if (p === "/free") return json(res, 200, {});
      if (p === "/view") {
        res.writeHead(200, { "content-type": "image/png" });
        return res.end(PNG);
      }
      if (p === "/internal/logs/raw")
        return json(res, 200, { entries: [{ t: "now", m: "fake log line\n" }] });
      if (p === "/internal/logs/subscribe") return json(res, 200, {});
      json(res, 404, { error: "not found" });
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws") return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      const id = url.searchParams.get("clientId") ?? randomUUID();
      sockets.set(id, ws);
      ws.send(
        JSON.stringify({
          type: "status",
          data: { status: { exec_info: { queue_remaining: 0 } }, sid: id },
        }),
      );
      ws.on("close", () => sockets.delete(id));
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actual = (server.address() as { port: number }).port;
      resolve({
        url: `http://127.0.0.1:${actual}`,
        port: actual,
        prompts,
        failNext: (e) => {
          failure = e;
        },
        close: () =>
          new Promise<void>((done) => {
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

// Run as a stand-in for ComfyUI's main.py: node fake-comfy.ts [--port N] [--step-ms N]
// [--output-directory DIR] (other flags ignored).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name: string) => {
    const at = process.argv.indexOf(name);
    return at > 0 ? process.argv[at + 1] : undefined;
  };
  console.log("Total VRAM 16384 MB (fake)");
  const fake = await startFakeComfy(
    Number(arg("--port") ?? 8188),
    Number(arg("--step-ms") ?? 5),
    arg("--output-directory") ?? null,
  );
  console.log(`To see the GUI go to: ${fake.url}`);
}
