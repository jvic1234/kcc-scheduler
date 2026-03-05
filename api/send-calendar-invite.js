export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { toEmail, toName, locName, webcalUrl } = req.body;

  if (!toEmail || !toName || !webcalUrl) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const firstName = toName.split(" ")[0];
  const subscribeUrl = webcalUrl.replace(/^https?:\/\//, "webcal://");
  const staffId = webcalUrl.split("/").pop();
  const subscribeHttpUrl = `https://kcc-scheduler.vercel.app/api/subscribe/${staffId}`;

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
        html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#FFF9F0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:500px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header: white background with logo -->
    <div style="background:white;padding:28px 32px 20px;text-align:center;border-bottom:4px solid #F5F5F5;">
      <!-- Coloured letter blocks using table for email compatibility -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 10px;">
        <tr>
          <td style="width:44px;height:44px;background:#8DC63F;border-radius:10px;text-align:center;vertical-align:middle;font-size:22px;font-weight:900;color:white;font-family:Arial,sans-serif;padding:0 6px 0 0;">K</td>
          <td style="width:44px;height:44px;background:#F06EAA;border-radius:10px;text-align:center;vertical-align:middle;font-size:22px;font-weight:900;color:white;font-family:Arial,sans-serif;padding:0 6px 0 0;">I</td>
          <td style="width:44px;height:44px;background:#4FC3F7;border-radius:10px;text-align:center;vertical-align:middle;font-size:22px;font-weight:900;color:white;font-family:Arial,sans-serif;padding:0 6px 0 0;">D</td>
          <td style="width:44px;height:44px;background:#FFB74D;border-radius:10px;text-align:center;vertical-align:middle;font-size:22px;font-weight:900;color:white;font-family:Arial,sans-serif;">S</td>
        </tr>
      </table>
      <div style="font-size:13px;font-weight:800;color:#1E3A8A;letter-spacing:1.5px;text-transform:uppercase;">Connection Childcare</div>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <!-- Greeting -->
      <p style="font-size:22px;font-weight:800;color:#1E3A8A;margin:0 0 8px;">Hi ${firstName}! 👋</p>
      <p style="font-size:14px;color:#64748B;line-height:1.7;margin:0 0 28px;">
        Your work schedule at <strong style="color:#1E3A8A;">${locName}</strong> is ready.
        Subscribe once and your shifts will always be up to date in your phone calendar.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${subscribeHttpUrl}" style="display:inline-block;background:#8DC63F;color:white;font-weight:800;font-size:16px;padding:16px 40px;border-radius:50px;text-decoration:none;letter-spacing:0.3px;">
          📅 Subscribe to My Schedule
        </a>
      </div>

      <!-- Divider -->
      <div style="border-top:2px dashed #F0F0F0;margin:0 0 24px;"></div>

      <!-- How it works -->
      <div style="margin-bottom:24px;">
        <div style="font-size:12px;font-weight:800;color:#94A3B8;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">How it works</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding-bottom:10px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:32px;height:32px;background:#F0F9FF;border-radius:8px;text-align:center;vertical-align:middle;font-size:16px;padding-right:12px;">📱</td>
                  <td style="font-size:13px;color:#475569;line-height:1.6;vertical-align:middle;"><strong style="color:#1E293B;">iPhone:</strong> Tap the button → Safari opens → tap "Subscribe" → done!</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:10px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:32px;height:32px;background:#F0FDF4;border-radius:8px;text-align:center;vertical-align:middle;font-size:16px;padding-right:12px;">🤖</td>
                  <td style="font-size:13px;color:#475569;line-height:1.6;vertical-align:middle;"><strong style="color:#1E293B;">Android:</strong> Tap the button → Google Calendar opens → tap "Yes" → done!</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:32px;height:32px;background:#FFF9F0;border-radius:8px;text-align:center;vertical-align:middle;font-size:16px;padding-right:12px;">🔄</td>
                  <td style="font-size:13px;color:#475569;line-height:1.6;vertical-align:middle;"><strong style="color:#1E293B;">Auto-updates:</strong> Schedule changes appear in your calendar automatically.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>

      <!-- Manual link -->
      <div style="background:#F8FAFC;border-radius:12px;padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;color:#94A3B8;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;">Or copy this link manually</div>
        <div style="font-size:11px;font-family:monospace;color:#4FC3F7;word-break:break-all;">${subscribeUrl}</div>
      </div>

    </div>

    <!-- Footer -->
    <div style="background:#F8FAFC;border-top:1px solid #F0F0F0;padding:16px 32px;text-align:center;">
      <div style="font-size:11px;color:#94A3B8;">This is an automated message from Kids Connection Childcare · ${locName}</div>
      <div style="font-size:11px;color:#CBD5E1;margin-top:4px;">Questions about your schedule? Contact your manager directly.</div>
    </div>

  </div>
</body>
</html>`,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.message || "Failed to send email" });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
