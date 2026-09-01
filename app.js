const MOBILE_QUERY = "(max-width: 900px), (pointer: coarse)";
const SLOW_PLAYBACK_RATE = 0.6;

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function lessonNumber() {
  const raw = new URLSearchParams(location.search).get("lesson") || "01";
  return String(Number(raw)).padStart(2, "0");
}

function driveViewUrl(id) {
  return `https://drive.google.com/file/d/${id}/view?usp=sharing`;
}

function driveMediaUrl(id) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
}

function loadInlinePlayer(shell) {
  if (shell.querySelector("iframe")) return;
  const iframe = document.createElement("iframe");
  iframe.src = `https://drive.google.com/file/d/${shell.dataset.driveId}/preview`;
  iframe.title = shell.dataset.title;
  iframe.allow = "autoplay; encrypted-media; fullscreen";
  iframe.allowFullscreen = true;
  iframe.loading = "lazy";
  shell.replaceChildren(iframe);
}

function loadSlowPlayer(shell) {
  if (shell.querySelector("video")) return;
  const rate = Number(shell.dataset.playbackRate) || SLOW_PLAYBACK_RATE;
  const video = document.createElement("video");
  video.src = driveMediaUrl(shell.dataset.driveId);
  video.title = shell.dataset.title;
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";

  const setSlowRate = () => {
    video.defaultPlaybackRate = rate;
    if (Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate;
  };
  setSlowRate();
  ["loadedmetadata", "loadeddata", "canplay", "play", "playing", "ratechange"].forEach((eventName) =>
    video.addEventListener(eventName, setSlowRate));
  video.addEventListener("error", () => {
    const card = document.createElement("div");
    card.className = "video-fallback";
    const title = document.createElement("strong");
    title.textContent = shell.dataset.title;
    const note = document.createElement("p");
    note.textContent = "Video chưa tải được. Con tải lại trang để hệ thống tự mở lại ở tốc độ 0,6×.";
    const link = document.createElement("a");
    link.className = "video-link";
    link.href = driveViewUrl(shell.dataset.driveId);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "▶ Mở video";
    card.append(title, note, link);
    shell.replaceChildren(card);
  }, {once: true});
  shell.replaceChildren(video);
}

function renderVideo(shell) {
  if (Number(shell.dataset.playbackRate) !== 1) {
    loadSlowPlayer(shell);
    return;
  }
  const mobile = window.matchMedia(MOBILE_QUERY).matches;
  if (!mobile) {
    loadInlinePlayer(shell);
    return;
  }
  const card = document.createElement("div");
  card.className = "video-fallback";
  const title = document.createElement("strong");
  title.textContent = shell.dataset.title;
  const note = document.createElement("p");
  note.textContent = "Trên điện thoại và iPad, con mở video trực tiếp để xem ổn định hơn.";
  const link = document.createElement("a");
  link.className = "video-link";
  link.href = driveViewUrl(shell.dataset.driveId);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "▶ Mở video";
  const button = document.createElement("button");
  button.className = "inline-button";
  button.type = "button";
  button.textContent = "Thử phát ngay trong trang";
  button.addEventListener("click", () => loadInlinePlayer(shell));
  card.append(title, note, link, button);
  shell.replaceChildren(card);
}

function activateTab(name) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const active = panel.id === name;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  document.querySelector(`#${name}`)?.scrollIntoView({behavior:"smooth",block:"start"});
}

function stepCard(number, title, text, bullets, driveId, videoTitle, accent = "", playbackRate = 1) {
  return `
    <article class="lesson-card ${accent}" id="step-${number}">
      <div class="step-number">${number}</div>
      <div class="lesson-copy">
        <h3>${title}</h3>
        <p>${text}</p>
        <ul>${bullets.map((item) => `<li>${item}</li>`).join("")}</ul>
      </div>
      <div class="video-shell" data-drive-id="${escapeHTML(driveId)}" data-title="${escapeHTML(videoTitle)}" data-playback-rate="${playbackRate}"></div>
    </article>`;
}

function renderLesson(lesson) {
  const e = escapeHTML;
  document.title = `Peppa ${lesson.number} · ${lesson.title}`;
  document.querySelector('meta[name="description"]').content =
    `Peppa Pig English Video ${lesson.number} – ${lesson.title}.`;

  document.querySelector("#lesson-root").innerHTML = `
    <section class="hero container">
      <p class="eyebrow">Peppa Pig English · Video ${lesson.number}</p>
      <h1>${e(lesson.title)}</h1>
      <div class="lesson-code">Mã bài: <strong>${e(lesson.code)}</strong></div>
      <h2>Nghe tự nhiên, bắt chước đúng nhịp</h2>
      <p class="lead">Peppa Pig là phim hoạt hình Anh - Anh với câu thoại ngắn, gần gũi và biểu cảm rõ. Con học theo đúng thứ tự trên trang để nghe quen giọng, nói rõ âm cuối và lồng tiếng tự nhiên hơn.</p>
      <div class="goal"><strong>Mục tiêu của bài</strong><span>Hiểu câu chuyện, bắt chước ngữ điệu và nói khớp nhịp nhân vật.</span></div>
    </section>

    <nav class="lesson-tabs container" aria-label="Nội dung bài học">
      <button class="tab-button is-active" data-tab="practice" aria-selected="true"><span>01</span> Học và lồng tiếng</button>
      <button class="tab-button" data-tab="sample" aria-selected="false"><span>02</span> Mẫu và cách quay</button>
    </nav>

    <section id="practice" class="tab-panel container is-active">
      <div class="intro-card">
        <h2>Con học theo 3 bước</h2>
        <p>Mỗi video có một nhiệm vụ khác nhau. Con làm lần lượt từ Bước 1 đến Bước 3; không cần thuộc ngay sau một hoặc hai lần xem.</p>
        <div class="quick-links">
          <a href="#step-1"><b>1</b> Xem bản gốc</a>
          <a href="#step-2"><b>2</b> Luyện bản chậm</a>
          <a href="#step-3"><b>3</b> Lồng tiếng</a>
        </div>
      </div>

      ${stepCard(1,"Xem bản gốc","Con xem trọn tập để hiểu câu chuyện, giọng điệu và biểu cảm của từng nhân vật.",["Chưa cần dừng từng câu.","Quan sát khẩu hình và nét mặt.","Có thể xem lại nhiều lần."],lesson.videos[0],`Peppa ${lesson.number} - bản gốc`)}
      ${stepCard(2,"Luyện với bản chậm","Con nghe từng câu ở tốc độ 0,6×, dừng lại khi cần và nói theo đúng cách nhân vật thể hiện.",["Giữ rõ trọng âm và âm cuối.","Bắt chước nối âm, nhịp và cảm xúc.","Luyện một câu nhiều lần nếu chưa khớp."],lesson.videos[0],`Peppa ${lesson.number} - bản chậm 0,6×`,"accent-card",SLOW_PLAYBACK_RATE)}
      ${stepCard(3,"Lồng tiếng","Con bật bản đã tách giọng và nói thay nhân vật. Mục tiêu là vào câu đúng lúc, nói rõ và có biểu cảm.",["Không đọc đều như học thuộc lòng.","Nhìn hình để vào câu đúng nhịp.","Luyện ổn rồi mới quay bài."],lesson.videos[2],`Peppa ${lesson.number} - bản tách giọng`)}

      <div class="submit-card">
        <div><h2>Nộp video lồng tiếng</h2><p>Con quay rõ màn hình, để âm thanh đủ lớn và nộp đúng bài <strong>${e(lesson.code)}</strong>. Tên tiếng Anh, lớp và mã lớp cần được ghi chính xác trong biểu mẫu.</p></div>
        <a href="${e(lesson.form)}" target="_blank" rel="noopener noreferrer">Nộp bài ${e(lesson.code)} →</a>
      </div>
    </section>

    <section id="sample" class="tab-panel container" hidden>
      <div class="intro-card">
        <h2>Video mẫu để con tham khảo</h2>
        <p>Con xem cách lồng tiếng mẫu, sau đó luyện từng câu và ghép thành đoạn trước khi quay bài.</p>
      </div>
      <article class="sample-card">
        <h2>Xem cách lồng tiếng mẫu</h2>
        <div class="youtube-shell"><iframe src="${e(lesson.sample)}" title="Video mẫu lồng tiếng Peppa Pig" loading="lazy" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div>
      </article>
      <div class="method-grid">
        <article><b>1</b><h3>Nghe để hiểu</h3><p>Xem trọn đoạn và nhận biết nhân vật, tình huống.</p></article>
        <article><b>2</b><h3>Luyện từng câu</h3><p>Dừng khi cần và bắt chước đúng nhịp, cảm xúc.</p></article>
        <article><b>3</b><h3>Ghép thành đoạn</h3><p>Nói liền mạch, không đọc đều như học thuộc lòng.</p></article>
        <article><b>4</b><h3>Thử không có giọng</h3><p>Mở bản tách giọng và nói thay nhân vật.</p></article>
      </div>
      <div class="submit-card">
        <div><h2>Sẵn sàng quay bài?</h2><p>Kiểm tra âm thanh rõ, khung hình ổn định và nộp đúng mã <strong>${e(lesson.code)}</strong>.</p></div>
        <a href="${e(lesson.form)}" target="_blank" rel="noopener noreferrer">Nộp bài ${e(lesson.code)} →</a>
      </div>
    </section>`;

  document.querySelectorAll(".tab-button").forEach((button) =>
    button.addEventListener("click", () => activateTab(button.dataset.tab)));
  document.querySelectorAll(".video-shell").forEach(renderVideo);
}

const current = window.PEPPA_LESSONS.find((item) => item.number === lessonNumber());
if (current) renderLesson(current);
else document.querySelector("#lesson-root").innerHTML =
  '<section class="hero container"><h1>Không tìm thấy bài học</h1><p>Vui lòng mở lại đường dẫn trong bảng Guidelines.</p></section>';

