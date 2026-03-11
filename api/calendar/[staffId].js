import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
  const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
  return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(m)}00`;
}

function getWeekStart(date) {
  const d = new Date(date), day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDescription(staffMember, block, allStaff) {
  const lines = [staffMember.name + " \u00b7 " + block.startTime + " to " + block.endTime];
  if (block.reliefFor) {
    lines.push("Covering for: " + (block.reliefNote || "colleague"));
  }
  const reliefs = (block.reliefs || []).filter(r => r.staffId && r.startTime && r.endTime);
  if (reliefs.length > 0) {
    lines.push("Relief coverage:");
    reliefs.forEach(r => {
      const name = (allStaff || []).find(s => String(s.id) === String(r.staffId))?.name || "Unknown";
      lines.push("  \u2022 " + name + ": " + r.startTime + "\u2013" + r.endTime);
    });
  }
  return lines.join("\\n");
}

export default async function handler(req, res) {
  const { staffId } = req.query;
  if (!staffId) return res.status(400).send("Missing staffId");

  try {
    const { data: rows, error } = await supabase.from("schedule").select("id, data");
    if (error) throw error;

    let staffName = "", locName = "Kids Connection Childcare", events = "";
    const now = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

    for (const row of rows || []) {
      const appData = row.data;
      if (!appData?.locations) continue;
      for (const loc of appData.locations) {
        const staffMember = loc.staff?.find(s => String(s.id) === String(staffId));
        if (!staffMember) continue;
        staffName = staffMember.name;
        locName = loc.name;
        const allStaff = loc.staff || [];
        const schedule = loc.schedule || {};
        for (const [key, cell] of Object.entries(schedule)) {
          const parts = key.split("|");
          if (parts.length !== 3) continue;
          const [weekIso, sId, dayIdx] = parts;
          if (String(sId) !== String(staffId)) continue;
          const weekStart = getWeekStart(new Date(weekIso));
          const date = new Date(weekStart);
          date.setDate(date.getDate() + parseInt(dayIdx));
          (cell?.blocks || []).filter(b => b.room && b.startTime && b.endTime).forEach((block, bi) => {
            const uid  = staffId + "-" + weekIso + "-" + dayIdx + "-" + bi + "@kcchildcare";
            const desc = buildDescription(staffMember, block, allStaff);
            const reliefs = (block.reliefs || []).filter(r => r.staffId && r.startTime && r.endTime);
            const reliefNames = reliefs.map(r => (allStaff.find(s => String(s.id) === String(r.staffId))?.name || "").split(" ")[0]).filter(Boolean);
            const summary = reliefNames.length > 0
              ? block.room + " \u2014 covered by " + reliefNames.join(" & ")
              : block.room;
            events += "BEGIN:VEVENT\r\n";
            events += "UID:" + uid + "\r\n";
            events += "DTSTAMP:" + now + "\r\n";
            events += "DTSTART:" + toICSDate(date, block.startTime) + "\r\n";
            events += "DTEND:"   + toICSDate(date, block.endTime)   + "\r\n";
            events += "SUMMARY:" + summary + "\r\n";
            events += "DESCRIPTION:" + desc + "\r\n";
            events += "LOCATION:" + locName + "\r\n";
            events += "END:VEVENT\r\n";
          });
        }
      }
    }

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kids Connection Childcare//Staff Scheduler//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + (staffName || "Work") + " Schedule",
      "X-WR-TIMEZONE:America/Edmonton",
      "X-WR-CALDESC:Work schedule for " + staffName + " at " + locName,
      events.trimEnd(),
      "END:VCALENDAR",
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
