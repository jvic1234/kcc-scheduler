export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { toEmail, toName, locName, webcalUrl } = req.body;

  console.log("📧 Sending to:", toEmail, "| API key present:", !!process.env.RESEND_API_KEY);

  if (!toEmail || !toName || !webcalUrl) {
    console.log("❌ Missing fields:", { toEmail, toName, webcalUrl });
    return res.status(400).json({ error: "Missing required fields" });
  }

  const firstName = toName.split(" ")[0];
  const subscribeUrl = webcalUrl.replace(/^https?:\/\//, "webcal://");

  console.log("🔗 Subscribe URL:", subscribeUrl);

  try {
    console.log("📤 Calling Resend API...");
    
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
        html: `<p>Hi ${firstName}, here is your calendar link: <a href="${subscribeUrl}">${subscribeUrl}</a></p>`,
      }),
    });

    const responseText = await response.text();
    console.log("📬 Resend response status:", response.status);
    console.log("📬 Resend response body:", responseText);

    if (!response.ok) {
      return res.status(500).json({ error: responseText });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("💥 Server error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
