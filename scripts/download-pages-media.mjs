import {open, readFile, stat} from "node:fs/promises";
import vm from "node:vm";

const sourceRoot = new URL("../", import.meta.url);
const mediaRoot = new URL("../../peppa-media/", import.meta.url);
const requested = new Set(process.argv.slice(2).map((value) => String(Number(value)).padStart(2, "0")));

async function lessons() {
  const source = await readFile(new URL("peppa-data.js", sourceRoot), "utf8");
  const context = {window: {}};
  vm.runInNewContext(source, context);
  return context.window.PEPPA_LESSONS.filter((lesson) => !requested.size || requested.has(lesson.number));
}

async function mobileStreamUrl(driveId) {
  const response = await fetch(`https://drive.google.com/get_video_info?docid=${encodeURIComponent(driveId)}`);
  if (!response.ok) throw new Error(`Drive metadata ${response.status}`);
  const params = new URLSearchParams(await response.text());
  const map = params.get("fmt_stream_map");
  if (!map) throw new Error(`Drive không trả bản H.264: ${params.get("reason") || params.get("status")}`);
  const streams = new Map(map.split(",").map((item) => {
    const separator = item.indexOf("|");
    return [item.slice(0, separator), item.slice(separator + 1)];
  }));
  if (!streams.has("18")) throw new Error("Không tìm thấy bản H.264 360p.");
  return streams.get("18");
}

async function download(url, destination) {
  const file = await open(destination, "w");
  const chunkSize = 8 * 1024 * 1024;
  let start = 0;
  let total = Infinity;
  try {
    while (start < total) {
      const response = await fetch(url, {headers: {Range: `bytes=${start}-${start + chunkSize - 1}`}});
      if (response.status !== 206 && response.status !== 200) throw new Error(`Tải video thất bại: ${response.status}`);
      const contentRange = response.headers.get("content-range");
      if (contentRange) total = Number(contentRange.split("/").pop());
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error("Google Drive trả về đoạn video rỗng.");
      await file.write(bytes, 0, bytes.length, start);
      start += bytes.length;
      if (response.status === 200) total = start;
    }
  } finally {
    await file.close();
  }
}

async function compatible(path) {
  try {
    const file = await stat(path);
    if (!file.size) return false;
    const bytes = await readFile(path);
    const sample = bytes.subarray(0, Math.min(bytes.length, 8 * 1024 * 1024));
    return sample.indexOf(Buffer.from("avc1")) >= 0 && sample.indexOf(Buffer.from("mp4a")) >= 0;
  } catch {
    return false;
  }
}

for (const lesson of await lessons()) {
  const destination = new URL(`peppa-${lesson.number}.mp4`, mediaRoot);
  if (await compatible(destination)) {
    console.log(`${lesson.number}: đã có sẵn`);
    continue;
  }
  console.log(`${lesson.number}: đang tải bản H.264 dành cho điện thoại`);
  await download(await mobileStreamUrl(lesson.videos[0]), destination);
  if (!(await compatible(destination))) throw new Error(`${lesson.number}: file tải về không tương thích mobile.`);
  console.log(`${lesson.number}: hoàn tất ${((await stat(destination)).size / 1024 / 1024).toFixed(1)} MB`);
}
