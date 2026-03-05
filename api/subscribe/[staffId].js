export default function handler(req, res) {
  const { staffId } = req.query;
  if (!staffId) return res.status(400).send("Missing staffId");
  
  // Redirect to the calendar feed with webcal:// protocol
  // The key is the underlying URL must be https which Vercel handles automatically
  const calendarUrl = `https://kcc-scheduler.vercel.app/api/calendar/${staffId}`;
  
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Subscribing to Calendar...</title>
  <meta http-equiv="refresh" content="0;url=webcal://kcc-scheduler.vercel.app/api/calendar/${staffId}"/>
</head>
<body>
  <p>Opening your calendar app...</p>
  <p>If nothing happens, <a href="webcal://kcc-scheduler.vercel.app/api/calendar/${staffId}">tap here</a>.</p>
</body>
</html>`);
}
