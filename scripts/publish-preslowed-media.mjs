import {execFileSync, spawn} from "node:child_process";
import {readFile, rm, stat, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const OWNER = "mstrangtrieueducation-droid";
const REPO = "peppa-slow-media";
const SOURCE_ROOT = new URL("../../peppa-media/", import.meta.url);
const WORK_ROOT = new URL("../.media-work/", import.meta.url);
const MANIFEST_URL = new URL("preslow-blobs.json", WORK_ROOT);
const FFMPEG = fileURLToPath(new URL("../.tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe", import.meta.url));
const GIT = "C:/Users/Ms Trang Trieu/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe";
const WORKERS = 4;

const credentials = Object.fromEntries(execFileSync(GIT, ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
}).trim().split(/\r?\n/).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1)];
}));
const token = credentials.password || credentials.credential;
if (!token) throw new Error("Không tìm thấy thông tin đăng nhập GitHub.");

async function api(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    let response;
    try {
      response = await fetch(`https://api.github.com${path}`, {
        ...options,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...options.headers,
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      continue;
    }
    if (response.ok) return response.status === 204 ? null : response.json();
    const body = await response.text();
    lastError = new Error(`GitHub ${response.status}: ${body}`);
    if (![502, 503, 504].includes(response.status) || attempt === 5) throw lastError;
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  throw lastError;
}

async function ensureRepo() {
  const check = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
    headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json"},
  });
  if (check.ok) return;
  if (check.status !== 404) throw new Error(`GitHub ${check.status}: ${await check.text()}`);
  await api("/user/repos", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      name: REPO,
      description: "Pre-slowed mobile video files for Peppa English lessons.",
      private: false,
      auto_init: true,
      has_issues: false,
      has_projects: false,
      has_wiki: false,
    }),
  });
  console.log("Đã tạo repository peppa-slow-media.");
}

async function loadLessons() {
  const source = await readFile(new URL("../peppa-data.js", import.meta.url), "utf8");
  const context = {window: {}};
  vm.runInNewContext(source, context);
  return context.window.PEPPA_LESSONS;
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_URL, "utf8"));
  } catch {
    return {blobs: {}};
  }
}

let manifestWrite = Promise.resolve();
function saveManifest(manifest) {
  manifestWrite = manifestWrite.then(() => writeFile(MANIFEST_URL, JSON.stringify(manifest, null, 2)));
  return manifestWrite;
}

function encodeSlow(source, destination) {
  return new Promise((resolve, reject) => {
    const process = spawn(FFMPEG, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", fileURLToPath(source),
      "-filter_complex", "[0:v]setpts=PTS/0.6[v];[0:a]atempo=0.6[a]",
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "27",
      "-pix_fmt", "yuv420p", "-threads", "4",
      "-c:a", "aac", "-b:a", "96k",
      "-movflags", "+faststart",
      fileURLToPath(destination),
    ], {stdio: ["ignore", "ignore", "pipe"]});
    let errorText = "";
    process.stderr.on("data", (chunk) => { errorText += chunk; });
    process.on("error", reject);
    process.on("exit", (code) => code === 0 ? resolve() : reject(new Error(errorText || `ffmpeg exit ${code}`)));
  });
}

async function uploadBlob(fileUrl) {
  const bytes = await readFile(fileUrl);
  return api(`/repos/${OWNER}/${REPO}/git/blobs`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({content: bytes.toString("base64"), encoding: "base64"}),
  });
}

async function uploadTextBlob(text) {
  return api(`/repos/${OWNER}/${REPO}/git/blobs`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({content: Buffer.from(text).toString("base64"), encoding: "base64"}),
  });
}

await ensureRepo();
const manifest = await loadManifest();
const lessons = await loadLessons();
let cursor = 0;

async function worker() {
  while (cursor < lessons.length) {
    const lesson = lessons[cursor++];
    const assetName = `peppa-${lesson.number}.mp4`;
    if (manifest.blobs[assetName]) {
      console.log(`${lesson.number}: đã có blob`);
      continue;
    }
    const source = new URL(assetName, SOURCE_ROOT);
    const output = new URL(`preslow-${assetName}`, WORK_ROOT);
    try {
      await stat(output);
      console.log(`${lesson.number}: dùng lại bản chậm đã tạo`);
    } catch {
      console.log(`${lesson.number}: đang tạo bản chậm vật lý 0,6×`);
      await encodeSlow(source, output);
    }
    const size = (await stat(output)).size;
    const blob = await uploadBlob(output);
    manifest.blobs[assetName] = blob.sha;
    await saveManifest(manifest);
    await rm(output, {force: true});
    console.log(`${lesson.number}: đã tải lên ${(size / 1024 / 1024).toFixed(1)} MB`);
  }
}

await Promise.all(Array.from({length: WORKERS}, () => worker()));
await manifestWrite;

const ref = await api(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
const baseCommit = await api(`/repos/${OWNER}/${REPO}/git/commits/${ref.object.sha}`);
const noJekyll = await uploadTextBlob("");
const index = await uploadTextBlob(`<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Peppa slow media</title></head><body><p>Pre-slowed media for Peppa lessons.</p></body></html>\n`);
const tree = await api(`/repos/${OWNER}/${REPO}/git/trees`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    base_tree: baseCommit.tree.sha,
    tree: [
      {path: ".nojekyll", mode: "100644", type: "blob", sha: noJekyll.sha},
      {path: "index.html", mode: "100644", type: "blob", sha: index.sha},
      ...Object.entries(manifest.blobs).map(([path, sha]) => ({path, mode: "100644", type: "blob", sha})),
    ],
  }),
});
const commit = await api(`/repos/${OWNER}/${REPO}/git/commits`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({message: "Add pre-slowed Peppa mobile videos", tree: tree.sha, parents: [ref.object.sha]}),
});
await api(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, {
  method: "PATCH",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({sha: commit.sha, force: false}),
});

const pagesCheck = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pages`, {
  headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json"},
});
if (pagesCheck.status === 404) {
  await api(`/repos/${OWNER}/${REPO}/pages`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({source: {branch: "main", path: "/"}}),
  });
}
console.log(`Hoàn tất commit ${commit.sha}`);
