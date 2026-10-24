// eCOPY floating progress window logic.
// Lives in its own file — the window CSP is script-src 'self', which blocks
// inline <script> (the reason every floating-window button was dead before).
const apiBase = 'http://localhost:5218';
const $ = (id) => document.getElementById(id);
let timer = null;

function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}
function fmtEta(sec) {
  if (sec == null || !isFinite(sec) || sec <= 0) return '—';
  if (sec < 60) return '约 ' + Math.ceil(sec) + ' 秒';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m < 60) return '约 ' + m + ' 分 ' + s + ' 秒';
  const h = Math.floor(m / 60), mm = m % 60;
  return '约 ' + h + ' 时 ' + mm + ' 分';
}

async function tick() {
  try {
    const r = await fetch(apiBase + '/api/aggregate');
    if (!r.ok) throw new Error('bad status');
    const d = await r.json();
    if (d.running > 0) {
      $('idle').style.display = 'none';
      $('active').style.display = 'flex';
      $('jobLabel').textContent = d.running + ' 个任务运行中';
      $('pct').textContent = d.pct.toFixed(1);
      $('barFill').style.width = d.pct.toFixed(1) + '%';
      $('speed').textContent = fmtBytes(d.speedBps) + '/s';
      $('eta').textContent = fmtEta(d.remain);
    } else {
      $('idle').style.display = 'block';
      $('active').style.display = 'none';
      $('idle').textContent = '所有任务已完成';
    }
  } catch {
    $('idle').style.display = 'block';
    $('active').style.display = 'none';
    $('idle').textContent = '连接中…';
  }
}

$('btnRestore').addEventListener('click', () => { window.ecopy && window.ecopy.restoreMain(); });
$('btnMin').addEventListener('click', () => { window.ecopy && window.ecopy.hideFloating(); });
$('btnQuit').addEventListener('click', () => {
  if (confirm('确定退出 eCOPY？运行中的拷卡任务将被停止。')) {
    window.ecopy && window.ecopy.quitNow();
  }
});

tick();
timer = setInterval(tick, 800);
