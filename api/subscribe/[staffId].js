export default function handler(req, res) {
  const { staffId } = req.query;
  if (!staffId) return res.status(400).send("Missing staffId");

  const httpsUrl  = `https://kcc-scheduler.vercel.app/api/calendar/${staffId}`;
  const webcalUrl = `webcal://kcc-scheduler.vercel.app/api/calendar/${staffId}`;
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsUrl)}`;

  const ua = req.headers["user-agent"] || "";
  const isAndroid = /android/i.test(ua);

  // Android: redirect straight to Google Calendar subscription page
  if (isAndroid) {
    res.setHeader("Location", googleUrl);
    return res.status(302).send("");
  }

  // iOS / desktop: serve a page that opens webcal:// and also offers Google Calendar fallback
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Subscribe to Schedule</title>
  <meta http-equiv="refresh" content="0;url=${webcalUrl}"/>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 32px 20px; max-width: 420px; margin: 0 auto; color: #1e293b; }
    h2  { font-size: 18px; margin-bottom: 8px; }
    p   { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    a.btn { display: block; text-align: center; padding: 12px 16px; border-radius: 10px;
            font-weight: 700; font-size: 14px; text-decoration: none; margin-bottom: 12px; }
    .apple  { background: #1b4332; color: white; }
    .google { background: #4285F4; color: white; }
  </style>
</head>
<body>
  <h2>📅 Subscribe to your schedule</h2>
  <p>Choose how to subscribe. Your calendar will stay automatically in sync.</p>
  <a class="btn apple"  href="${webcalUrl}">Open in Apple Calendar</a>
  <a class="btn google" href="${googleUrl}">Open in Google Calendar</a>
</body>
</html>`);
}
