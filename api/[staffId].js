export default function handler(req, res) {
  const { staffId } = req.query;
  if (!staffId) return res.status(400).send("Missing staffId");
  res.setHeader("Location", `webcal://kcc-scheduler.vercel.app/api/calendar/${staffId}`);
  res.status(302).send("Redirecting...");
}
