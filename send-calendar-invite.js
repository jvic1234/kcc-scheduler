// ─────────────────────────────────────────────────────────────────────────────
// File location in your project:  /api/send-calendar-invite.js
//
// This is a Vercel Serverless Function.
// It receives a POST request from the scheduler app and sends a calendar
// invite email via Resend.
//
// Setup:
//   1. npm install resend  (in your project root)
//   2. Add RESEND_API_KEY to your Vercel environment variables
//   3. Verify your domain (kcchildcare.ca) in the Resend dashboard
// ─────────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { toEmail, toName, locName, webcalUrl } = req.body;

  // Basic validation
  if (!toEmail || !toName || !webcalUrl) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const firstName = toName.split(" ")[0];

  // Convert webcal:// → https:// for the clickable link in email
  // (webcal:// is handled by the device's calendar app when tapped)
  const httpsUrl = webcalUrl.replace(/^webcal:\/\//, "https://");

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:30px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1E3A8A;padding:28px 32px;text-align:center;">
            <div style="font-size:28px;margin-bottom:6px;">🌱</div>
            <div style="color:white;font-size:22px;font-weight:900;letter-spacing:-0.3px;">Kids Connection Childcare</div>
            <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">${locName}</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1E293B;">Hi ${firstName}! 👋</p>
            <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
              Your work schedule is now available on your phone calendar.
              Follow the steps below for your device to subscribe — you only need to do this <strong>once</strong>,
              and your schedule will automatically update every time it changes.
            </p>

            <!-- Subscribe button -->
            <div style="text-align:center;margin:24px 0;">
              <a href="${webcalUrl}" style="display:inline-block;background:#1E3A8A;color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:800;letter-spacing:0.2px;">
                📅 Subscribe to My Schedule
              </a>
              <p style="margin:8px 0 0;font-size:11px;color:#94A3B8;">Tap this button on your phone</p>
            </div>

            <hr style="border:none;border-top:1.5px solid #E8F3E8;margin:28px 0;"/>

            <!-- iPhone instructions -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="background:#F8FAFF;border:1.5px solid #DBEAFE;border-radius:12px;padding:18px;">
                  <div style="font-size:15px;font-weight:800;color:#1E3A8A;margin-bottom:12px;">🍎 iPhone Instructions</div>
                  <ol style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:2;">
                    <li>Tap the <strong>"Subscribe to My Schedule"</strong> button above</li>
                    <li>Your iPhone will open <strong>Apple Calendar</strong> automatically</li>
                    <li>A popup asks <em>"Subscribe to Calendar?"</em> — tap <strong>Subscribe</strong></li>
                    <li>Tap <strong>Add</strong> to confirm</li>
                    <li>Your shifts will appear in a new <strong>"Work Schedule"</strong> calendar ✅</li>
                  </ol>
                  <p style="margin:10px 0 0;font-size:12px;color:#64748B;background:white;padding:8px 12px;border-radius:8px;border:1px solid #DBEAFE;">
                    💡 <strong>Tip:</strong> If tapping the button doesn't open Calendar, copy the link and go to
                    <em>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar</em>
                    and paste it there.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Android instructions -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:12px;padding:18px;">
                  <div style="font-size:15px;font-weight:800;color:#166534;margin-bottom:12px;">🤖 Android Instructions</div>
                  <ol style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:2;">
                    <li>Tap the <strong>"Subscribe to My Schedule"</strong> button above</li>
                    <li>Your phone will open <strong>Google Calendar</strong></li>
                    <li>Tap <strong>"Add Calendar"</strong> or <strong>"Subscribe"</strong> when prompted</li>
                    <li>Your shifts will appear in a new <strong>"Work Schedule"</strong> calendar ✅</li>
                  </ol>
                  <p style="margin:10px 0 0;font-size:12px;color:#374151;background:white;padding:8px 12px;border-radius:8px;border:1px solid #BBF7D0;">
                    💡 <strong>Alternative:</strong> Open <strong>Google Calendar</strong> on your phone →
                    tap the menu (☰) → <em>Settings → Add Calendar → From URL</em> → paste the link below.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Manual URL fallback -->
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px;margin-bottom:24px;">
              <div style="font-size:11px;font-weight:800;color:#6B7280;margin-bottom:6px;letter-spacing:0.5px;">MANUAL SUBSCRIPTION LINK (copy & paste if needed)</div>
              <div style="font-family:monospace;font-size:12px;color:#1E3A8A;word-break:break-all;background:white;padding:8px 10px;border-radius:6px;border:1px solid #DBEAFE;">${httpsUrl}</div>
            </div>

            <hr style="border:none;border-top:1.5px solid #E8F3E8;margin:0 0 20px;"/>
            <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;line-height:1.7;">
              Questions? Contact your director or email
              <a href="mailto:admin@kcchildcare.ca" style="color:#1E3A8A;">admin@kcchildcare.ca</a><br/>
              Kids Connection Childcare · ${locName}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from:    "Kids Connection Childcare <noreply@kcchildcare.ca>",
      to:      [toEmail],
      subject: `📅 Your Work Schedule — Subscribe to Your Calendar`,
      html:    htmlBody,
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, id: data.id });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
