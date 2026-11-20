const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { writePsdBuffer } = require("ag-psd");
const { zipSync, strToU8 } = require("fflate");
const { utils, write } = require("xlsx");
const UTIF = require("utif");

function samplePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 6 0 R >>",
    "1 0 0 rg 20 20 260 160 re f\n",
    "0 0 1 rg 20 20 260 160 re f\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += (i + 1) + " 0 obj\n" + (i < 4 ? obj : "<< /Length " + obj.length + " >>\nstream\n" + obj + "endstream") + "\nendobj\n";
  });
  const xref = pdf.length;
  pdf += "xref\n0 7\n0000000000 65535 f \n" + offsets.slice(1).map(n => String(n).padStart(10, "0") + " 00000 n \n").join("");
  return pdf + "trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
}

function sampleWav() {
  const length = 8000;
  const bytes = Buffer.alloc(44 + length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) bytes.writeInt16LE(Math.round(Math.sin(i / 7) * (i < 4000 ? 5000 : 20000)), 44 + 2 * i);
  return bytes;
}

function office(entries) {
  return zipSync(Object.fromEntries(Object.entries(entries).map(([name, xml]) => [name, strToU8(xml)])));
}

(async () => {
  const root = path.resolve(__dirname, "..");
  const data = await fs.mkdtemp(path.join(root, ".runtime", "preview-test-"));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    const executablePath = process.env.ARASN_PREVIEW_EXE;
    const launch = () => electron.launch({ args: executablePath ? [] : ["."], executablePath, cwd: root, env });
    app = await launch();
    let page = await app.firstWindow();
    const urls = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 600;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ec471d";
      ctx.fillRect(0, 0, 1200, 600);
      return [canvas.toDataURL(), canvas.toDataURL("image/jpeg"), canvas.toDataURL("image/webp")];
    });
    const toBytes = url => Buffer.from(url.split(",")[1], "base64");
    const assets = {
      "actual.png": toBytes(urls[0]), "photo.jpg": toBytes(urls[1]),
      "image.webp": toBytes(urls[2]),
      "old-name.dat": toBytes(urls[0]), "bad.png": Buffer.from("Invalid PNG"),
      "blocked.svg": Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12" onload="fetch(\'/preview-probe\')"><rect width="24" height="12" fill="red"/><script>fetch(\'/preview-probe\')</script></svg>'),
    };
    const rgba = new Uint8ClampedArray(80 * 40 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([240, 40, 10, 255], i);
    assets["image.tiff"] = Buffer.from(UTIF.encodeImage(rgba.buffer, 80, 40));
    assets["large-but-valid.png"] = Buffer.alloc(21 * 1024 * 1024);
    assets["actual.png"].copy(assets["large-but-valid.png"]);
    const stage = Number(process.env.ARASN_PREVIEW_STAGE || 4);
    if (stage >= 2) {
      const composite = { width: 80, height: 40, imageData: { width: 80, height: 40, data: rgba } };
      assets["design.psd"] = writePsdBuffer(composite);
      assets["big-design.psb"] = writePsdBuffer(composite, { psb: true });
      assets["clip.mp4"] = Buffer.from(await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 80;
        const ctx = canvas.getContext("2d");
        ctx.fillRect(0, 0, 160, 80);
        const stream = canvas.captureStream(20);
        const recorder = new MediaRecorder(stream, { mimeType: "video/mp4" });
        const chunks = [];
        recorder.ondataavailable = event => chunks.push(event.data);
        const stopped = new Promise(resolve => { recorder.onstop = resolve; });
        recorder.start();
        for (let i = 0; i < 24; i++) {
          ctx.fillStyle = i > 5 ? "#ff3213" : "#000";
          ctx.fillRect(0, 0, 160, 80);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        recorder.stop();
        await stopped;
        stream.getTracks().forEach(track => track.stop());
        return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
      }));
    }
    if (stage >= 3) {
      assets["sample.pdf"] = samplePdf();
      assets["readme.txt"] = "Arasn line one\nline two";
      assets["script.html"] = "<script>throw new Error('must not execute')</script>";
      assets["data.csv"] = 'Name,Comment\r\nAda,"Hello, world"';
      assets["tone.wav"] = sampleWav();
      assets["unknown.zzz"] = "unknown";
      assets["summary.docx"] = office({ "word/document.xml": '<w:document xmlns:w="urn:word"><w:p><w:r><w:t>Document content</w:t></w:r></w:p></w:document>' });
      const rel = target => '<Relationships><Relationship Id="first" Target="' + target + '"/></Relationships>';
      assets["slides.pptx"] = office({
        "ppt/presentation.xml": '<p:presentation xmlns:p="urn:ppt" xmlns:r="urn:rels"><p:sldId r:id="first"/><p:sldId r:id="second"/></p:presentation>',
        "ppt/_rels/presentation.xml.rels": rel("slides/slide2.xml"),
        "ppt/slides/slide2.xml": '<a:slide xmlns:a="urn:draw"><a:p><a:t>Opening slide</a:t></a:p></a:slide>',
      });
      assets["sheet.xlsx"] = office({
        "xl/workbook.xml": '<workbook xmlns:r="urn:rels"><sheet name="Budget" r:id="first"/></workbook>',
        "xl/_rels/workbook.xml.rels": rel("worksheets/sheet1.xml"),
        "xl/worksheets/sheet1.xml": '<worksheet><row><c r="B1" t="inlineStr"><is><t>Amount</t></is></c><c r="D1"><v>469</v></c></row></worksheet>',
      });
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, utils.aoa_to_sheet([["Legacy workbook", 980]]), "Ledger");
      assets["sheet.xls"] = write(workbook, { type: "buffer", bookType: "biff8" });
    }
    const files = await Promise.all(Object.entries(assets).map(async ([name, bytes]) => {
      const file = path.join(data, name);
      await fs.writeFile(file, bytes);
      return file;
    }));
    await app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
    }, files);
    const imported = await page.evaluate(() => window.desktop.files.choose());
    assert.equal(imported.length, files.length);
    const ids = Object.fromEntries(imported.map(item => {
      assert(item.ok, item.error);
      return [item.file.name, item.file.id];
    }));
    const receive = (name, mode, number) => page.evaluate(([id, mode, page]) => window.desktop.files.preview(id, mode, page), [ids[name], mode, number]);
    const pixel = url => page.evaluate(async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.drawImage(image, 0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    }, url);
    for (const file of ["actual.png", "photo.jpg", "old-name.dat", "blocked.svg", "image.webp", "image.tiff", "large-but-valid.png"]) {
      const preview = await receive(file);
      assert.equal(preview.kind, "image", file);
      assert.equal(preview.width / preview.height, 2);
      assert((await pixel(preview.image))[0] > 200);
    }
    assert.equal((await receive("bad.png")).kind, "unsupported");
    assert.equal(await page.evaluate(() => window.desktop.files.preview("../invalid")), null);
    console.log("PASS Electron PNG/JPEG/WebP/TIFF/SVG, PNG above the old 20 MiB limit, content signature and corrupt-image fallback");
    if (stage >= 2) {
      const psd = await receive("design.psd");
      assert.equal(psd.kind, "image");
      assert.equal(psd.width / psd.height, 2);
      assert((await pixel(psd.image))[0] > 200);
      assert.equal((await receive("big-design.psb")).kind, "image");
      const video = await receive("clip.mp4");
      assert.equal(video.kind, "video");
      assert(video.duration > 1 && video.duration < 2.5, video.duration);
      assert((await pixel(video.image))[0] > 200, "the video poster must skip the black opening");
      const detail = await receive("clip.mp4", "detail");
      assert.equal(await page.evaluate(async url => (await fetch(url, { headers: { Range: "bytes=0-31" } })).status, detail.url), 206);
      const duration = await page.evaluate(url => new Promise((resolve, reject) => {
        const player = document.createElement("video");
        player.onloadedmetadata = () => resolve(player.duration);
        player.onerror = reject;
        player.src = url;
      }), detail.url);
      assert.equal(duration, video.duration);
      console.log("PASS Electron PSD composite, MP4 poster (non-black), duration and streaming");
    }
    if (stage >= 3) {
      const cardRequestedWithPage = await receive("sample.pdf", "card", 2);
      const pdf = await receive("sample.pdf");
      assert.equal(pdf.count, 2);
      assert(pdf.image);
      assert((await pixel(pdf.image))[0] > 200, "PDF cards always display the red first page");
      const second = await receive("sample.pdf", "detail", 2);
      assert(second.image && second.image !== pdf.image);
      assert.equal(cardRequestedWithPage.image, pdf.image);
      assert.equal((await receive("summary.docx")).text, "Document content");
      const ppt = await receive("slides.pptx");
      assert.equal(ppt.text, "Opening slide");
      assert.equal(ppt.count, 2);
      assert.deepEqual((await receive("sheet.xlsx")).table[0], ["", "Amount", "", "469"]);
      assert.deepEqual((await receive("sheet.xls")).table[0], ["Legacy workbook", "980"]);
      assert.equal((await receive("readme.txt")).text, "Arasn line one\nline two");
      assert((await receive("script.html")).text.startsWith("<script>"));
      assert.equal((await receive("data.csv")).table[1][1], "Hello, world");
      const audio = await receive("tone.wav");
      assert.equal(audio.duration, 1);
      assert(Math.max(...audio.peaks.slice(0, 20)) < Math.min(...audio.peaks.slice(-20)));
      assert.equal((await receive("unknown.zzz")).kind, "unsupported");
      console.log("PASS Electron PDF pagination, DOCX/PPTX summaries, XLSX, TXT, HTML, CSV and audio waveform");
    }
    if (stage >= 4) {
      const cache = path.join(data, "previews-v1");
      const cachedFile = async name => {
        const entry = (await fs.readdir(cache)).find(entry => entry.startsWith(ids[name] + "-") && entry.endsWith("-card.json"));
        assert(entry, name + " cached");
        return path.join(cache, entry);
      };
      const cacheItem = await cachedFile("actual.png");
      await fs.writeFile(cacheItem, "broken cache entry");
      assert.equal((await receive("actual.png")).kind, "image");
      const itemTime = (await fs.stat(cacheItem)).mtimeMs;
      const itemBytes = await fs.readFile(cacheItem);
      const dataRoot = process.env.ARASN_PREVIEW_SHOTS;
      const shot = async name => {
        if (!dataRoot) return;
        await fs.mkdir(dataRoot, { recursive: true });
        await page.screenshot({ path: path.join(dataRoot, name), scale: "css", animations: "disabled" });
      };
      const window = await app.browserWindow(page);
      await window.evaluate(win => {
        win.show(); win.focus(); win.setContentSize(1440, 900);
        win.webContents.setBackgroundThrottling(false);
      });
      const button = name => page.getByRole("button", { name, exact: true });
      if (await button("打开工作区").isVisible()) await button("打开工作区").click();
      await button("我的随手页").click();
      const note = await page.evaluate(async ids => {
        const headers = { "Content-Type": "application/json", Authorization: "Bearer " + sessionStorage.getItem("arasn-token") };
        const read = await fetch("/api/board", { headers });
        const { roomId } = await read.json();
        async function create(value) {
          const id = crypto.randomUUID();
          const response = await fetch("/api/ops", {
            method: "POST", headers, body: JSON.stringify({ id, opId: crypto.randomUUID(), expected: 0, value }),
          });
          if (!response.ok) throw new Error(await response.text());
          return id;
        }
        const names = ["actual.png", "clip.mp4", "design.psd", "sample.pdf", "summary.docx", "tone.wav"];
        const categories = ["图片", "视频", "图片", "文档", "文档", "音频"];
        for (const [i, name] of names.entries()) {
          await create({ type: "free-file", roomId, contentRef: { kind: "file", id: ids[name] },
            name, category: categories[i], x: 24 + i % 3 * 295, y: 25 + Math.floor(i / 3) * 198, width: 275, height: 180, localOnly: true });
        }
        const note = await create({ type: "text", text: "文件预览测试便签\n验证附件复用", x: 24, y: 435, color: "#31415d" });
        await create({ type: "content-link", roomId, recordId: note, targetRef: { kind: "file", id: ids["clip.mp4"] } });
        return note;
      }, ids);
      await expect(page.locator(".free-file-card")).toHaveCount(6);
      await button("适配内容").click();
      const videoCard = page.locator('.free-file-card').filter({ has: button("预览 clip.mp4") });
      await expect(videoCard.locator(".file-preview-duration")).toHaveText("0:01");
      await expect(page.locator('.free-file-card [data-preview-kind="image"] img')).toHaveCount(2);
      await shot("canvas-light.png");
      await button("预览 clip.mp4").click();
      const player = page.getByRole("dialog").locator("video");
      await expect(player).toBeVisible();
      assert(await player.evaluate(video => video.paused));
      await player.evaluate(video => video.play());
      await expect.poll(() => player.evaluate(video => video.currentTime)).toBeGreaterThan(0);
      await button("关闭文件预览").click();
      await expect(page.getByRole("dialog", { name: "clip.mp4" })).toBeHidden();
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      await shot("canvas-dark.png");
      const cardHeader = videoCard.locator("header");
      const videoCache = await cachedFile("clip.mp4");
      const videoCacheTime = (await fs.stat(videoCache)).mtimeMs;
      const box = await cardHeader.boundingBox();
      await page.mouse.move(box.x + 26, box.y + 12);
      await page.mouse.down();
      await page.mouse.move(box.x + 85, box.y + 35, { steps: 12 });
      await page.mouse.up();
      const widthBeforeResize = await videoCard.evaluate(card => parseFloat(card.style.width));
      const resize = videoCard.getByRole("button", { name: "调整附件 clip.mp4 尺寸" });
      await resize.press("ArrowRight");
      await expect.poll(() => videoCard.evaluate(card => parseFloat(card.style.width))).toBe(widthBeforeResize + 10);
      const zoom = button("重置视图为100%");
      const beforeZoom = await zoom.innerText();
      await button("放大").click();
      await expect(zoom).not.toHaveText(beforeZoom);
      await zoom.click();
      await expect(zoom).toHaveText("100%");
      await button("适配内容").click();
      assert.equal((await fs.stat(videoCache)).mtimeMs, videoCacheTime);
      await expect(videoCard.locator(".file-preview-duration")).toBeVisible();
      const noteCard = page.locator('[data-note-id="' + note + '"]');
      await noteCard.getByRole("button", { name: "查看完整便签" }).click();
      const attachment = page.getByRole("region", { name: "便签附件" }).getByRole("button", { name: "预览 clip.mp4" });
      await expect(attachment.locator("img")).toBeVisible();
      await attachment.click();
      await expect(page.getByRole("dialog", { name: "clip.mp4" }).locator("video")).toBeVisible();
      await button("返回文件列表").click();
      await button("关闭便签详情").click();
      await button("文件").click();
      await button("网格视图").click();
      await expect(button("预览 sample.pdf").locator("img")).toBeVisible();
      const pdfTile = button("预览 sample.pdf");
      assert(await pdfTile.evaluate(tile => tile.querySelector(".file-content-stage").clientWidth >= tile.clientWidth - 2));
      await shot("file-center-dark.png");
      await expect(button("预览 sample.pdf")).toBeVisible();
      await button("预览 sample.pdf").click();
      await expect(page.getByRole("dialog", { name: "sample.pdf" }).locator("img")).toBeVisible();
      await button("下一页").click();
      await expect(page.getByLabel("PDF 页码")).toHaveText("2 / 2");
      await expect(page.getByRole("dialog", { name: "sample.pdf" }).locator("img")).toBeVisible();
      await window.evaluate(win => { win.setMinimumSize(350, 460); win.setContentSize(390, 750); });
      await shot("pdf-dark-narrow.png");
      assert.equal(await page.getByRole("dialog", { name: "sample.pdf" }).evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
      await button("返回文件列表").click();
      await window.evaluate(win => win.setContentSize(1440, 900));
      await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
      await button("我的随手页").click();
      await button("添加图片或附件").click();
      const picker = page.getByRole("dialog", { name: "选择附件", exact: true });
      const search = picker.getByRole("textbox", { name: "搜索附件" });
      const row = name => picker.locator(".file-picker-row").filter({ has: page.getByRole("checkbox", { name: "选择附件 " + name, exact: true }) });
      const quick = picker.getByRole("tooltip");
      for (const name of ["actual.png", "clip.mp4", "design.psd", "sample.pdf"]) {
        await row(name).scrollIntoViewIfNeeded();
        await expect(row(name).locator("img")).toBeVisible();
      }
      await expect(row("summary.docx").locator("pre")).toHaveText("Document content");
      await expect(row("data.csv").locator("table")).toBeAttached();
      await expect(row("unknown.zzz").locator(".picker-preview-placeholder")).toBeAttached();
      const unknown = row("unknown.zzz").getByRole("checkbox");
      await unknown.check();
      await expect(unknown).toBeChecked();
      await unknown.uncheck();
      await row("clip.mp4").scrollIntoViewIfNeeded();
      await search.hover();
      await row("clip.mp4").hover();
      await expect(quick.locator("img")).toBeVisible();
      await expect(quick).toContainText("0:01");
      assert((await quick.boundingBox()).x >= (await picker.boundingBox()).x + (await picker.boundingBox()).width);
      await shot("picker-list-light.png");
      await search.hover();
      await expect(quick).toHaveCount(0);
      const pdfSelection = row("sample.pdf").getByRole("checkbox");
      const pdfPreview = row("sample.pdf").getByRole("button", { name: "预览 sample.pdf" });
      await pdfSelection.check();
      await pdfSelection.focus();
      await page.keyboard.press("Tab");
      await expect(pdfPreview).toBeFocused();
      await expect(quick).toContainText("2 页");
      await pdfPreview.press("Enter");
      const detail = page.getByRole("dialog", { name: "sample.pdf", exact: true });
      await expect(detail.locator("img")).toBeVisible();
      await detail.getByRole("button", { name: "下一页" }).click();
      await expect(detail.getByLabel("PDF 页码")).toHaveText("2 / 2");
      await expect(detail.locator("img")).toBeVisible();
      await shot("picker-detail-light.png");
      await detail.getByRole("button", { name: "返回附件选择" }).click();
      await expect(pdfSelection).toBeChecked();
      await picker.getByRole("button", { name: "网格视图" }).click();
      await expect(picker.locator(".file-picker-list")).toHaveAttribute("data-layout", "grid");
      await expect(pdfSelection).toBeChecked();
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      await shot("picker-grid-dark.png");
      await picker.getByRole("button", { name: "列表视图" }).click();
      await window.evaluate(win => win.setContentSize(390, 610));
      await row("design.psd").scrollIntoViewIfNeeded();
      await search.hover();
      await row("design.psd").hover();
      await expect(quick.locator("img")).toBeVisible();
      const quickBox = await quick.boundingBox();
      const listBox = await picker.locator(".file-picker-list").boundingBox();
      assert(quickBox.x >= listBox.x && quickBox.x + quickBox.width <= listBox.x + listBox.width);
      assert(quickBox.y >= listBox.y && quickBox.y + quickBox.height <= listBox.y + listBox.height);
      await shot("picker-narrow-dark.png");
      await window.evaluate(win => win.setContentSize(1440, 900));
      const importedPaths = await Promise.all(Array.from({ length: 34 }, async (_, index) => {
        const name = "batch-" + String(index).padStart(2, "0") + (index === 33 ? "-" + "长文件名".repeat(25) : "") + ".txt";
        const file = path.join(data, name);
        await fs.writeFile(file, "批量测试 " + index);
        return file;
      }));
      await app.evaluate(({ dialog }, paths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
      }, importedPaths);
      await picker.getByRole("button", { name: "导入文件" }).click();
      await expect(picker.getByRole("button", { name: "添加所选（35）" })).toBeEnabled();
      await search.fill("batch-");
      await expect(picker.locator(".file-picker-row")).toHaveCount(25);
      await picker.locator(".file-picker-list").evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect.poll(() => picker.locator(".file-picker-list").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await picker.getByRole("button", { name: "下一页" }).click();
      await expect(picker.locator(".file-picker-row")).toHaveCount(9);
      await search.fill("batch-33");
      const fullName = path.basename(importedPaths.at(-1));
      const longName = row(fullName).locator(".file-picker-file > span");
      await expect(longName).toHaveAttribute("title", fullName);
      assert(await longName.evaluate(element => element.scrollWidth > element.clientWidth));
      await picker.getByRole("button", { name: "关闭文件选择" }).click();
      await button("添加图片或附件").click();
      await search.fill("readme.txt");
      await row("readme.txt").getByRole("checkbox").check();
      await picker.getByRole("button", { name: "添加所选（1）" }).click();
      await expect(picker).toBeHidden();
      await expect(page.locator(`[data-free-file="${ids["readme.txt"]}"]`)).toBeVisible();
      console.log("PASS Electron attachment picker thumbnails, hover and keyboard preview, PDF detail, multi-select, grid, narrow positioning, pagination, import and attach");
      for (const [name, bytes] of Object.entries(assets))
        assert.deepEqual(await fs.readFile(path.join(data, name)), Buffer.from(bytes));
      await app.close();
      app = await launch();
      page = await app.firstWindow();
      assert.equal((await receive("actual.png")).kind, "image");
      assert.equal((await fs.stat(cacheItem)).mtimeMs, itemTime);
      assert.deepEqual(await fs.readFile(cacheItem), itemBytes);
      const object = path.join(data, "objects", ids["actual.png"] + ".bin");
      await fs.writeFile(object, toBytes(urls[1]));
      assert.equal((await receive("actual.png")).extension, "jpg");
      await fs.truncate(object, 50 * 1024 * 1024);
      assert.equal((await receive("actual.png")).kind, "unsupported");
      await fs.rename(object, object + ".missing");
      assert.equal(await receive("actual.png"), null);
      await page.evaluate(() => window.desktop.files.action("clearPreviews"));
      assert(!(await fs.readdir(cache)).some(name => name.endsWith(".json")));
      console.log("PASS Electron canvas drag/fit, nested note attachment, file center, PDF detail, themes, corrupt cache, restart, changed source and missing source");
      assert(note);
    }
    for (const [name, bytes] of Object.entries(assets))
      assert.deepEqual(await fs.readFile(path.join(data, name)), Buffer.from(bytes));
  } finally {
    await app?.close();
    const resolved = await fs.realpath(data);
    assert.equal(path.dirname(resolved), await fs.realpath(path.join(root, ".runtime")));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
