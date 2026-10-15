/**
 * Regenerates the desktop app icons from src-tauri/app-icon.svg:
 *   node tools/make-icons.ts
 * Renders a 1024 px PNG with sharp, then lets the Tauri CLI produce every size and format.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const svg = path.join(root, "src-tauri", "app-icon.svg");
const png = path.join(root, "src-tauri", "app-icon.png");

await sharp(svg, { density: 512 }).resize(1024, 1024).png().toFile(png);
execSync(`npx tauri icon "${png}"`, { cwd: root, stdio: "inherit" });
console.log("✔ Icons written to src-tauri/icons/");
