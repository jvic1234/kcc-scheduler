import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // needs service role to bypass RLS
);

function pad(n) { return String(n).padStart(2, "0"); }

function timeToComponents(timeStr) {
  const [time, ap] = timeStr.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return { h, m };
}

function toICSDate(date, timeStr) {
  const { h, m } = timeToComponents(timeStr);
  const y = date.getFullYear();
  const mo = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(m)}00`;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function handler(req, res) {
  const { staffId } = req.query;

  if (!staffId) {
    return res.status(400).send("Missing staffId");
  }

  try {
    // Fetch all rows from schedule table that contain this staff member's shifts
    // Rows are keyed as "{userId}:kcc-v1"
    const { data: rows, error } = await supabase
      .from("schedule")
      .select("id, data");

    if (error) throw error;

    let staffName = "";
    let locName = "Kids Connection Childcare";
    let events = "";
    const now = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

    for (const row of rows || []) {
      const appData = row.data;
      if (!appData?.locations) continue;

      for (const loc of appData.locations) {
        // Find this staff member
        const staffMember = loc.staff?.find(s => String(s.id) === String(staffId));
        if (!staffMember) continue;

        staffName = staffMember.name;
        locName = loc.name;

        // Iterate all schedule keys for this staff member
        const schedule = loc.schedule || {};
        for (const [key, cell] of Object.entries(schedule)) {
          // Key format: "{weekIso}|{staffId}|{dayIndex}"
          const parts = key.split("|");
          if (parts.length !== 3) continue;
          const [weekIso, sId, dayIdx] = parts;
          if (String(sId) !== String(staffId)) continue;

          const weekStart = getWeekStart(new Date(weekIso));
          const date = new Date(weekStart);
          date.setDate(date.getDate() + parseInt(dayIdx));

          const blocks = cell?.blocks || [];
          blocks.filter(b => b.room && b.startTime && b.endTime).forEach((block, bi) => {
            const dtstart = toICSDate(date, block.startTime);
            const dtend   = toICSDate(date, block.endTime);
            const uid     = `${staffId}-${weekIso}-${dayIdx}-${bi}@kcchildcare`;

            events += `BEGIN:VEVENT\r\n`;
            events += `UID:${uid}\r\n`;
            events += `DTSTAMP:${now}\r\n`;
            events += `DTSTART:${dtstart}\r\n`;
            events += `DTEND:${dtend}\r\n`;
            events += `SUMMARY:${block.room} — ${locName}\r\n`;
            events += `DESCRIPTION:${staffMember.name} · ${block.startTime} to ${block.endTime}\r\n`;
            events += `LOCATION:${locName}\r\n`;
            events += `END:VEVENT\r\n`;
          });
        }
      }
    }

    const ics = [
      `BEGIN:VCALENDAR`,
      `VERSION:2.0`,
      `PRODID:-//Kids Connection Childcare//Staff Scheduler//EN`,
      `CALSCALE:GREGORIAN`,
      `METHOD:PUBLISH`,
      `X-WR-CALNAME:${staffName || "Work"} Schedule`,
      `X-WR-TIMEZONE:America/Edmonton`,
      `X-WR-CALDESC:Work schedule for ${staffName} at ${locName}`,
      events.trimEnd(),
      `END:VCALENDAR`,
    ].join("\r\n");

    res.setHeader("Content-Type", "text/calendar;charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${staffName.replace(/\s+/g, "-")}-schedule.ics"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.status(200).send(ics);

  } catch (err) {
    console.error("Calendar feed error:", err);
    return res.status(500).send("Failed to generate calendar");
  }
}
