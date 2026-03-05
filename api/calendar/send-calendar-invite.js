export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { toEmail, toName, locName, webcalUrl } = req.body;

  if (!toEmail || !toName || !webcalUrl) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const firstName = toName.split(" ")[0];

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Kids Connection Childcare <noreply@team.kcchildcare.ca>",
        to: toEmail,
        subject: `Your Work Schedule — ${locName}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0a0e1a,#1a2744);padding:28px 32px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">🌱</div>
      <div style="color:white;font-weight:800;font-size:20px;">Kids Connection Childcare</div>
      <div style="color:rgba(255,255,255,0.65);font-size:13px;margin-top:4px;">${locName}</div>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="font-size:16px;font-weight:700;color:#1E293B;margin:0 0 12px;">Hi ${firstName}! 👋</p>
      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">
        Your manager has shared your work schedule with you. Tap the button below to subscribe —
        your shifts will appear automatically in your phone calendar and stay up to date whenever the schedule changes.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${webcalUrl.replace(/^https?:\/\//, \"webcal://\")}" style="display:inline-block;background:linear-gradient(135deg,#1E3A8A,#2D4FA0);color:white;font-weight:800;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
          📅 Subscribe to My Schedule
        </a>
      </div>

      <!-- How it works -->
      <div style="background:#F0F7F4;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-weight:800;font-size:13px;color:#1B4332;margin-bottom:12px;">How it works:</div>
        <div style="font-size:13px;color:#374151;line-height:1.8;">
          📱 <strong>iPhone:</strong> Tap the button → Safari opens → tap "Subscribe" → done!<br/>
          🤖 <strong>Android:</strong> Tap the button → Google Calendar opens → tap "Yes" → done!<br/>
          🔄 <strong>Auto-updates:</strong> Any schedule changes appear in your calendar automatically.
        </div>
      </div>

      <!-- URL fallback -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#94A3B8;letter-spacing:0.5px;margin-bottom:6px;text-transform:uppercase;">Or copy this link manually</div>
        <div style="font-size:11px;font-family:monospace;color:#6366F1;word-break:break-all;">${webcalUrl.replace(/^https?:\/\//, "webcal://")}</div>
      </div>

      <p style="font-size:12px;color:#94A3B8;line-height:1.6;margin:0;">
        This is an automated message from Kids Connection Childcare's scheduling system.
        If you have any questions about your schedule, please contact your manager directly.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:16px 32px;text-align:center;">
      <div style="font-size:11px;color:#94A3B8;">Kids Connection Childcare · ${locName}</div>
    </div>

  </div>
</body>
</html>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("Resend error:", err);
      return res.status(500).json({ error: err.message || "Failed to send email" });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: err.message });
  }
}
