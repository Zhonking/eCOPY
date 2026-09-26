// Outbound notifications: generic JSON webhook + Slack-compatible payloads.
// In-app and system notifications are handled by the frontend.
import { getSettings } from './store.js';

export async function notifyEvent(job, event, source = null) {
  const settings = await getSettings();
  const cfg = settings.notifications;
  if (!cfg || !cfg.webhookUrl) return;
  if (!cfg.events.includes(event)) return;

  const titleMap = {
    completed: 'ALL CARDS SAFE — offload complete',
    failed: 'Offload FAILED — do not format',
    safe: source ? `${source.volume} Safe to Format` : 'Safe to Format'
  };
  const text = `eCOPY · ${titleMap[event] || event}\nJob: ${job.name}${
    source ? `\nCard: ${source.volume}` : ''
  }\nOperator: ${job.operator}`;

  const isSlack =
    cfg.slackLike || /hooks\.slack\.com|slack\.com\/api\/fb\//.test(cfg.webhookUrl);
  const payload = isSlack
    ? { text }
    : {
        event,
        jobId: job.id,
        jobName: job.name,
        project: job.project,
        operator: job.operator,
        source: source ? { volume: source.volume, reel: source.reel } : null,
        at: new Date().toISOString()
      };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch {
    // Offline / endpoint down — never break the offload flow.
  } finally {
    clearTimeout(timer);
  }
}
