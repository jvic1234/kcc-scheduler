import { useState, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS      = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function generateTimes() {
  const t = [];
  for (let h = 5; h <= 18; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 5 && m < 30) continue; // start at 5:30 AM
      if (h === 18 && m > 30) break;   // end at 6:30 PM
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ap  = h < 12 ? "AM" : "PM";
      t.push(`${h12}:${m.toString().padStart(2,"0")} ${ap}`);
    }
  }
  return t;
}
const TIMES = generateTimes();

const TL_START = 330;  // 5:30 AM in minutes
const TL_END   = 1110; // 6:30 PM in minutes
const TL_RANGE = TL_END - TL_START;

const INS_START = 360; // 6:00 AM
const INS_END   = 1110; // 6:00 PM
const INS_RANGE = INS_END - INS_START;

function minsToTime(m) {
  m = Math.max(TL_START, Math.min(TL_END, Math.round(m/15)*15));
  const h24=Math.floor(m/60), min=m%60;
  const h12=h24>12?h24-12:h24===0?12:h24;
  return `${h12}:${min.toString().padStart(2,"0")} ${h24<12?"AM":"PM"}`;
}

const COLOR_PALETTE = [
  { bg:"#FFF0EB", border:"#FF8A65", text:"#D84315", dot:"#FF8A65" },
  { bg:"#E8F5F3", border:"#4DB6AC", text:"#00695C", dot:"#4DB6AC" },
  { bg:"#F3EFF9", border:"#9575CD", text:"#512DA8", dot:"#9575CD" },
  { bg:"#FDE8F2", border:"#F06292", text:"#880E4F", dot:"#F06292" },
  { bg:"#E8F2FD", border:"#64B5F6", text:"#1565C0", dot:"#64B5F6" },
  { bg:"#EDF7EE", border:"#66BB6A", text:"#2E7D32", dot:"#66BB6A" },
  { bg:"#FFF8E1", border:"#FFB300", text:"#E65100", dot:"#FFB300" },
  { bg:"#FCE4EC", border:"#E91E63", text:"#880E4F", dot:"#E91E63" },
  { bg:"#E0F7FA", border:"#00ACC1", text:"#006064", dot:"#00ACC1" },
  { bg:"#F1F8E9", border:"#8BC34A", text:"#33691E", dot:"#8BC34A" },
];

// ⚙️  UPDATE THIS after deploying to Vercel
const HOSTED_URL = "https://kcc-scheduler.vercel.app"; // e.g. https://schedule.kcchildcare.ca

// Location accent colors for tabs
const LOC_COLORS = ["#1E3A8A","#7DC52A","#E8417A","#4BBDE8","#F5A623","#6A1B9A","#00695C","#37474F"];

// Rooms that don't count toward worked hours
const HOURS_EXCLUDED_ROOMS = new Set(["Lunch / Break", "Vacation", "Sick"]);
const PROTECTED_ROOMS      = new Set(["Lunch / Break", "Sick"]); // cannot be deleted

const DEFAULT_ROOMS = () => ([
  { id: Date.now()+1, name:"Infant Room",    colorIdx:0 },
  { id: Date.now()+2, name:"Toddler Room",   colorIdx:1 },
  { id: Date.now()+3, name:"Preschool Room", colorIdx:2 },
  { id: Date.now()+4, name:"Pre-K Room",     colorIdx:3 },
  { id: Date.now()+5, name:"Floater",        colorIdx:4 },
  { id: Date.now()+6, name:"Office",         colorIdx:5 },
  { id: Date.now()+7, name:"Lunch / Break",  colorIdx:6 },
  { id: Date.now()+8, name:"Kitchen",        colorIdx:7 },
  { id: Date.now()+9, name:"Vacation",       colorIdx:8 },
  { id: Date.now()+10, name:"Sick",          colorIdx:3 },
]);

const INITIAL_LOCATIONS = [
  {
    id: 1,
    name: "Main Location",
    colorIdx: 0,
    staff: [],
    rooms: [],
    schedule:  {},
    templates: [],
  }
];

const AVATAR_COLORS = ["#74C69D","#52B788","#40916C","#2D6A4F","#1B4332","#95D5B2","#B7E4C7","#D8F3DC"];

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function getWeekStart(date) {
  const d = new Date(date), day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0,0,0,0); return d;
}
function formatDate(d)     { return d.toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function formatDateLong(d) { return d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}); }
function getWeekDates(ws)  { return DAYS.map((_,i)=>{ const d=new Date(ws); d.setDate(d.getDate()+i); return d; }); }
function getAvatarColor(idx){ return AVATAR_COLORS[idx % AVATAR_COLORS.length]; }
function initials(name)    { return name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase(); }
let _idCounter = Date.now();
function uid() { return ++_idCounter + Math.random(); }

function newBlock(s="8:00 AM",e="4:00 PM",r="") { return { id:uid(), startTime:s, endTime:e, room:r, reliefs:[] }; }
function newRelief(s="",e="") { return { id:uid(), staffId:"", startTime:s, endTime:e }; }
function timeToMins(t) {
  const [time,ap]=t.split(" "); let [h,m]=time.split(":").map(Number);
  if(ap==="PM"&&h!==12)h+=12; if(ap==="AM"&&h===12)h=0; return h*60+m;
}
function blockMins(b)  { return Math.max(0, timeToMins(b.endTime)-timeToMins(b.startTime)); }
function dayMins(blks) { return (blks||[]).filter(b=>!HOURS_EXCLUDED_ROOMS.has(b.room)).reduce((s,b)=>s+blockMins(b),0); }
function fmtHours(m)   { if(!m)return"—"; const h=Math.floor(m/60),mn=m%60; return mn?`${h}h ${mn}m`:`${h}h`; }
function sortBlocks(blks) {
  return [...blks].sort((a,b)=>{
    if(!a.startTime)return 1; if(!b.startTime)return -1;
    return timeToMins(a.startTime)-timeToMins(b.startTime);
  });
}
function hasOverlap(blocks) {
  const v=blocks.filter(b=>b.room&&b.startTime&&b.endTime);
  for(let i=0;i<v.length;i++) for(let j=i+1;j<v.length;j++){
    const [as,ae,bs,be]=[timeToMins(v[i].startTime),timeToMins(v[i].endTime),timeToMins(v[j].startTime),timeToMins(v[j].endTime)];
    if(as<be&&bs<ae)return true;
  }
  return false;
}


// ─── ICS Calendar Generation ──────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2,"0"); }
function toICSDate(date, timeStr) {
  // date is a JS Date (the day), timeStr is "8:00 AM" etc
  const [time,ap] = timeStr.split(" "); let [h,m] = time.split(":").map(Number);
  if(ap==="PM"&&h!==12)h+=12; if(ap==="AM"&&h===12)h=0;
  const y=date.getFullYear(), mo=date.getMonth()+1, d=date.getDate();
  return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(m)}00`;
}
function buildICSDescription(staffMember, block, allStaff) {
  const lines = [`${staffMember.name} \u00b7 ${block.startTime} to ${block.endTime}`];
  if (block.reliefFor) {
    lines.push(`Covering for: ${block.reliefNote || "colleague"}`);
  }
  const reliefs = (block.reliefs || []).filter(r => r.staffId && r.startTime && r.endTime);
  if (reliefs.length > 0) {
    lines.push("Relief coverage:");
    reliefs.forEach(r => {
      const name = allStaff?.find(s => String(s.id) === String(r.staffId))?.name || "Unknown";
      lines.push(`  \u2022 ${name}: ${r.startTime}\u2013${r.endTime}`);
    });
  }
  return lines.join("\\n");
}
function generateICS(staffMember, weekDates, schedule, locName, allStaff) {
  const uid_base = staffMember.id + "-" + Date.now();
  let events = "";
  weekDates.forEach((date,di) => {
    const key = Object.keys(schedule).find(k => k.includes(`|${staffMember.id}|${di}`));
    const blocks = key ? (schedule[key]?.blocks || []) : [];
    blocks.filter(b=>b.room&&b.startTime&&b.endTime).forEach((block,bi) => {
      const dtstart = toICSDate(date, block.startTime);
      const dtend   = toICSDate(date, block.endTime);
      const uid     = `${uid_base}-${di}-${bi}@kcchildcare`;
      const created = new Date().toISOString().replace(/[-:.]/g,"").slice(0,15)+"Z";
      const desc    = buildICSDescription(staffMember, block, allStaff);
      events += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${created}
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${block.room} \u2014 ${locName}
DESCRIPTION:${desc}
LOCATION:${locName}
END:VEVENT
`;
    });
  });
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Kids Connection Childcare//Staff Scheduler//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${staffMember.name} Work Schedule
X-WR-TIMEZONE:America/Edmonton
${events}END:VCALENDAR`;
}
function downloadICS(icsContent, filename) {
  const blob = new Blob([icsContent], { type:"text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function KidsConnectionScheduler({ userEmail="", onSignOut=()=>{}, remoteData=null, onRemoteDataConsumed=()=>{} }) {

  // ── Persisted state ────────────────────────────────────────────────────────
  const [loaded,           setLoaded]           = useState(false);
  const [locations,        setLocations]        = useState(INITIAL_LOCATIONS);
  const [activeLocId,      setActiveLocId]      = useState(1);
  const [weekStart,        setWeekStart]        = useState(()=>getWeekStart(new Date()));

  // ── UI state ───────────────────────────────────────────────────────────────
  const [editCell,         setEditCell]         = useState(null);
  const [editBlocks,       setEditBlocks]       = useState([]);
  const [editOrigBlocks,   setEditOrigBlocks]   = useState([]); // snapshot at open time for deletion detection
  const [clipboard,        setClipboard]        = useState(null);
  const [toast,            setToast]            = useState("");
  const [saveStatus,       setSaveStatus]       = useState("");
  const [confirmDelete,    setConfirmDelete]    = useState(null);
  const [showClearModal,   setShowClearModal]   = useState(false);
  const [copyPrevModal,    setCopyPrevModal]    = useState(null); // null | {step:'pick'} | {step:'confirm-week'} | {step:'pickDay',fromDay,toDay} | {step:'confirm-day',fromDay,toDay}
  const [showAddStaff,     setShowAddStaff]     = useState(false);
  const [showStaffInfo,    setShowStaffInfo]    = useState(null);
  const [newStaffEmail,    setNewStaffEmail]    = useState("");
  const [emailSending,     setEmailSending]     = useState(false);
  const [emailSent,        setEmailSent]        = useState({});  // {staffId: true}
  const [showManageRooms,  setShowManageRooms]  = useState(false);
  const [attendance, setAttendance] = useState({}); // { "weekIso|dayIndex|roomId": number }
  const [attendanceExcluded, setAttendanceExcluded] = useState(new Set(["Lunch / Break", "Vacation", "Kitchen"])); // room names excluded from attendance
  const [showAttendance, setShowAttendance] = useState(false);
  const [showTemplates,    setShowTemplates]    = useState(false);
  const [showManageLocs,   setShowManageLocs]   = useState(false);
  const [newTemplateName,  setNewTemplateName]  = useState("");
  const [newStaffName,     setNewStaffName]     = useState("");
  const [editingStaffId,   setEditingStaffId]   = useState(null);
  const [editingStaffName, setEditingStaffName] = useState("");
  const [editingRoomId,    setEditingRoomId]    = useState(null);
  const [editingRoomName,  setEditingRoomName]  = useState("");
  const [newRoomName,      setNewRoomName]      = useState("");
  const [newLocName,       setNewLocName]       = useState("");
  const [editingLocId,     setEditingLocId]     = useState(null);
  const [editingLocName,   setEditingLocName]   = useState("");
  const [showCalendar,     setShowCalendar]     = useState(false);
  const [calViewMonth,     setCalViewMonth]     = useState(()=>{ const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),1); });
  const [showInsights,     setShowInsights]     = useState(false);
  const [insightDayIdx,    setInsightDayIdx]    = useState(()=>{ const t=new Date(); const d=t.getDay(); return d===0?6:d-1; });
  const [insightRoomFilter,setInsightRoomFilter]= useState(null);
  const [insightRoomOrder, setInsightRoomOrder] = useState(null);
  const [sickModal,        setSickModal]        = useState(null); // {staffId, dayIdx}

  const calRef          = useRef(null);
  const isRemoteUpdate  = useRef(false);
  const tlRef           = useRef(null);
  const tlDragRef       = useRef(null);
  const insDragRef      = useRef(null);
  const insNewDragRef   = useRef(null); // for drawing new blocks on empty track space
  const insLastMouseRef = useRef({x:0,y:0});
  const insHandlerRef   = useRef({});
  const tlHandlerRef    = useRef({});
  const [tlPreview,     setTlPreview]  = useState(null);
  const [tlTooltip,     setTlTooltip]  = useState(null);
  const [insDragPreview,setInsDragPreview] = useState(null);
  const [insDragTooltip,setInsDragTooltip] = useState(null);
  const [insNewPreview, setInsNewPreview]  = useState(null); // {room, startMins, endMins}
  const [insNewPopover, setInsNewPopover]  = useState(null); // {room, dayIdx, startMins, endMins, staffId, mouseX, mouseY}
  const weekDates = getWeekDates(weekStart);
  const wiso      = weekStart.toISOString();

  // ── Active location helpers ────────────────────────────────────────────────
  const loc      = locations.find(l=>l.id===activeLocId) || locations[0];
  const locColor = LOC_COLORS[loc.colorIdx % LOC_COLORS.length];

  // Update a field on the active location
  const updateLoc = (patch) => setLocations(locs=>locs.map(l=>l.id===activeLocId?{...l,...patch}:l));

  // ── Merge incoming realtime changes from other users ──────────────────────
  useEffect(()=>{
    if(!remoteData) return;
    isRemoteUpdate.current = true;
    setLocations(current => {
      const merged = [...current];
      for(const remoteLoc of (remoteData.locations||[])) {
        const idx = merged.findIndex(l=>l.id===remoteLoc.id);
        if(idx>=0) {
          // Merge schedule cells — remote wins for any cell not being actively edited
          merged[idx] = {
            ...merged[idx],
            staff:    remoteLoc.staff    || merged[idx].staff,
            rooms:    remoteLoc.rooms    || merged[idx].rooms,
            templates:remoteLoc.templates|| merged[idx].templates,
            schedule: remoteLoc.schedule || merged[idx].schedule
          };
        } else {
          merged.push(remoteLoc);
        }
      }
      return merged;
    });
    onRemoteDataConsumed();
  }, [remoteData]);
  const staff     = loc.staff;
  const rooms     = loc.rooms;
  const schedule  = loc.schedule;
  const templates = loc.templates;
  const setStaff     = v => updateLoc({staff:    typeof v==="function"?v(staff):v});
  const setRooms     = v => updateLoc({rooms:    typeof v==="function"?v(rooms):v});
  const setSchedule  = v => updateLoc({schedule: typeof v==="function"?v(schedule):v});
  const setTemplates = v => updateLoc({templates:typeof v==="function"?v(templates):v});

  // ── Key helpers ────────────────────────────────────────────────────────────
  const cellKey   = (sId,d)    => `${wiso}|${sId}|${d}`;
  const getCellData = (sId,d)  => schedule[cellKey(sId,d)];
  const rc = (name) => { const r=rooms.find(r=>r.name===name); return r?COLOR_PALETTE[r.colorIdx%COLOR_PALETTE.length]:{bg:"#F8FAFC",border:"#CBD5E1",text:"#475569",dot:"#94A3B8"}; };

  // ── Persistence ────────────────────────────────────────────────────────────
  // dataLoadAttempted: true once we've either loaded real data OR confirmed there is none.
  // The save effect must not fire until this is true, so a failed load never overwrites
  // real Supabase data with the empty INITIAL_LOCATIONS.
  const dataLoadAttempted = useRef(false);

  useEffect(()=>{
    (async()=>{
      try {
        const r=await window.storage.get("kcc-v1");
        if(r){
          const d=JSON.parse(r.value);
          if(d.locations) setLocations(d.locations);
          if(d.activeLocId) setActiveLocId(d.activeLocId);
          if(d.attendance) setAttendance(d.attendance);
        }
      } catch(e){
        // Key not found or network error — either way we've made a load attempt;
        // existing INITIAL_LOCATIONS state is fine to keep but must not be saved
        // over real data if this was just a transient error.
        console.warn("KCC: storage load failed or key not found:", e?.message);
      }
      dataLoadAttempted.current = true;
      setLoaded(true);
    })();
  },[]);

  // ── One-time cleanup: prune orphan lunch blocks + stamp missing reliefFor ──
  const cleanupRanRef = useRef(false);
  useEffect(()=>{
    if(!loaded||cleanupRanRef.current) return;
    cleanupRanRef.current=true;
    setLocations(prev=>prev.map(loc=>{
      const cleaned={...loc.schedule};
      const keys=Object.keys(cleaned);
      // Build a set of valid staff IDs for this location so we can prune orphan keys
      const validIds=new Set((loc.staff||[]).map(s=>String(s.id)));

      // Pass 0: prune schedule keys whose staffId doesn't exist in this location's staff list
      // This removes any ghost entries that accumulated from stale/corrupt data
      keys.forEach(key=>{
        const parts=key.split('|');
        if(parts.length<3) return;
        const staffIdPart=parts[1];
        if(!validIds.has(staffIdPart)) delete cleaned[key];
      });

      const cleanedKeys=Object.keys(cleaned);

      // Pass 1: build covererMap from reliefs[] on all lunch blocks
      // covererKey → [{ownerId, startMins, endMins}] — stores time range so Pass 2
      // only stamps blocks that actually overlap the relief window, not all blocks.
      const covererMap={};
      cleanedKeys.forEach(key=>{
        const [wisoStr,ownerId,dayStr]=key.split('|');
        if(!validIds.has(String(ownerId))) return;
        (cleaned[key]?.blocks||[]).forEach(b=>{
          if(b.room!=='Lunch / Break') return;
          (b.reliefs||[]).forEach(r=>{
            if(!r.staffId||!validIds.has(String(r.staffId))||!r.startTime||!r.endTime) return;
            const cKey=`${wisoStr}|${r.staffId}|${dayStr}`;
            if(!covererMap[cKey]) covererMap[cKey]=[];
            covererMap[cKey].push({ownerId:String(ownerId),
              startMins:timeToMins(r.startTime),endMins:timeToMins(r.endTime)});
          });
        });
      });

      // Pass 2: stamp reliefFor ONLY on coverer blocks that overlap the relief window.
      // Critical: a staff member may have OTHER blocks (e.g. Dragonfly Room 11am-12pm)
      // that must NOT get reliefFor just because they cover a lunch at 12pm-1pm.
      cleanedKeys.forEach(key=>{
        if(!cleaned[key]?.blocks) return;
        const entries=covererMap[key];
        if(!entries?.length) return;
        cleaned[key]={...cleaned[key],blocks:cleaned[key].blocks.map(b=>{
          if(b.reliefFor||HOURS_EXCLUDED_ROOMS.has(b.room)||!b.room||!b.startTime||!b.endTime) return b;
          const bStart=timeToMins(b.startTime), bEnd=timeToMins(b.endTime);
          const match=entries.find(e=>bStart<e.endMins&&bEnd>e.startMins);
          if(!match) return b;
          return {...b,reliefFor:match.ownerId};
        })};
      });

      // Pass 3: prune orphan lunch blocks (empty duplicates)
      cleanedKeys.forEach(key=>{
        if(!cleaned[key]?.blocks) return;
        const allLunch=cleaned[key].blocks.filter(b=>b.room==='Lunch / Break');
        if(allLunch.length<=1) return;
        const hasPopulated=allLunch.some(b=>(b.reliefs||[]).length>0);
        if(!hasPopulated) return;
        cleaned[key]={...cleaned[key],blocks:cleaned[key].blocks.filter(b=>
          b.room!=='Lunch / Break'||(b.reliefs||[]).length>0
        )};
      });

      // Pass 4: migrate legacy __na__ sentinel → __nc__ in all relief entries
      cleanedKeys.forEach(key=>{
        if(!cleaned[key]?.blocks) return;
        const updated=cleaned[key].blocks.map(b=>{
          if(!(b.reliefs||[]).some(r=>String(r.staffId)==="__na__")) return b;
          return {...b,reliefs:b.reliefs.map(r=>String(r.staffId)==="__na__"?{...r,staffId:"__nc__"}:r)};
        });
        cleaned[key]={...cleaned[key],blocks:updated};
      });

      return {...loc,schedule:cleaned};
    }));
  },[loaded]);

  useEffect(()=>{
    if(!loaded)return;
    if(!dataLoadAttempted.current)return;
    if(isRemoteUpdate.current){ isRemoteUpdate.current=false; return; }
    // Never save if every location has zero staff — that means real data never loaded
    const hasAnyStaff=locations.some(l=>(l.staff||[]).length>0);
    if(!hasAnyStaff)return;
    setSaveStatus("saving");
    const t=setTimeout(async()=>{
      try{ await window.storage.set("kcc-v1",JSON.stringify({locations,activeLocId,attendance})); setSaveStatus("saved"); setTimeout(()=>setSaveStatus(""),2200); }
      catch(e){ setSaveStatus(""); }
    },700);
    return()=>clearTimeout(t);
  },[locations,activeLocId,attendance,loaded]);

  // ── Timeline drag handlers ─────────────────────────────────────────────────
  const tlTooltipLabel = (drag, snapped) => {
    if(!drag) return null;
    if(drag.type==='new'){ const s=Math.min(drag.anchor,snapped),ev=Math.max(drag.anchor,snapped); return ev>s?`${minsToTime(s)} → ${minsToTime(ev)}`:minsToTime(s); }
    if(drag.type==='resize-s') return `Start: ${minsToTime(Math.min(snapped,drag.origEnd-15))}`;
    if(drag.type==='resize-e') return `End: ${minsToTime(Math.max(snapped,drag.origStart+15))}`;
    if(drag.type==='move'){ const d=snapped-drag.anchor,dur=drag.origEnd-drag.origStart; let ns=drag.origStart+d,ne=drag.origEnd+d; if(ns<TL_START){ns=TL_START;ne=TL_START+dur;} if(ne>TL_END){ne=TL_END;ns=TL_END-dur;} return `${minsToTime(ns)} → ${minsToTime(ne)}`; }
  };
  const onTlMouseDown = (e) => {
    if(e.button!==0)return;
    e.preventDefault();
    const rect=tlRef.current.getBoundingClientRect();
    const x=e.clientX-rect.left;
    const snapped=Math.max(TL_START,Math.min(TL_END,Math.round((x/rect.width*TL_RANGE+TL_START)/15)*15));
    const EDGE=10;
    for(const b of editBlocks){
      if(!b.startTime||!b.endTime)continue;
      const bs=timeToMins(b.startTime),be=timeToMins(b.endTime);
      const bL=(bs-TL_START)/TL_RANGE*rect.width, bR=(be-TL_START)/TL_RANGE*rect.width;
      if(x>=bL&&x<=bR){
        const type=x<=bL+EDGE?'resize-s':x>=bR-EDGE?'resize-e':'move';
        tlDragRef.current={type,id:b.id,origStart:bs,origEnd:be,anchor:snapped};
        setTlTooltip({x,label:tlTooltipLabel(tlDragRef.current,snapped),type});
        return;
      }
    }
    const tempId=uid();
    tlDragRef.current={type:'new',anchor:snapped,tempId};
    setTlPreview({isNew:true,id:tempId,startTime:minsToTime(snapped),endTime:minsToTime(Math.min(snapped+60,TL_END))});
    setTlTooltip({x,label:minsToTime(snapped),type:'new'});
  };
  tlHandlerRef.current.move = (e) => {
    const drag=tlDragRef.current; if(!drag)return;
    const rect=tlRef.current?.getBoundingClientRect(); if(!rect)return;
    const x=Math.max(0,Math.min(rect.width,e.clientX-rect.left));
    const snapped=Math.max(TL_START,Math.min(TL_END,Math.round((x/rect.width*TL_RANGE+TL_START)/15)*15));
    setTlTooltip({x,label:tlTooltipLabel(drag,snapped),type:drag.type});
    if(drag.type==='new'){
      const s=Math.min(drag.anchor,snapped),ev=Math.max(drag.anchor,snapped);
      if(ev>s) setTlPreview({isNew:true,id:drag.tempId,startTime:minsToTime(s),endTime:minsToTime(ev)});
    } else if(drag.type==='resize-s'){
      setTlPreview({id:drag.id,startTime:minsToTime(Math.min(snapped,drag.origEnd-15)),endTime:minsToTime(drag.origEnd)});
    } else if(drag.type==='resize-e'){
      setTlPreview({id:drag.id,startTime:minsToTime(drag.origStart),endTime:minsToTime(Math.max(snapped,drag.origStart+15))});
    } else if(drag.type==='move'){
      const delta=snapped-drag.anchor, dur=drag.origEnd-drag.origStart;
      let ns=drag.origStart+delta, ne=drag.origEnd+delta;
      if(ns<TL_START){ns=TL_START;ne=TL_START+dur;} if(ne>TL_END){ne=TL_END;ns=TL_END-dur;}
      setTlPreview({id:drag.id,startTime:minsToTime(ns),endTime:minsToTime(ne)});
    }
  };
  tlHandlerRef.current.up = () => {
    const drag=tlDragRef.current;
    if(drag && tlPreview){
      if(drag.type==='new'&&tlPreview.isNew){
        const nb={...newBlock(tlPreview.startTime,tlPreview.endTime,''),id:drag.tempId};
        setEditBlocks(prev=>sortBlocks([...prev,nb]));
      } else if(drag.type!=='new'){
        setEditBlocks(prev=>sortBlocks(prev.map(b=>b.id===drag.id?{...b,startTime:tlPreview.startTime,endTime:tlPreview.endTime}:b)));
      }
    }
    tlDragRef.current=null; setTlPreview(null); setTlTooltip(null);
  };
  useEffect(()=>{
    if(!editCell)return;
    const mv=e=>tlHandlerRef.current.move?.(e);
    const up=e=>tlHandlerRef.current.up?.(e);
    document.addEventListener('mousemove',mv);
    document.addEventListener('mouseup',up);
    return()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
  },[editCell]);

  // ── Insights drag-to-edit handlers ────────────────────────────────────────
  insHandlerRef.current.move = (e) => {
    insLastMouseRef.current = {x:e.clientX, y:e.clientY};
    // Handle existing block drag
    const drag=insDragRef.current;
    if(drag){
      const {trackRect,origStart,origEnd,anchor,type}=drag;
      const x=Math.max(0,Math.min(trackRect.width,e.clientX-trackRect.left));
      const snapped=Math.max(INS_START,Math.min(INS_END,Math.round((x/trackRect.width*INS_RANGE+INS_START)/15)*15));
      const dur=origEnd-origStart;
      let ns=origStart,ne=origEnd;
      if(type==='resize-s'){ ns=Math.min(snapped,origEnd-15); ne=origEnd; }
      else if(type==='resize-e'){ ns=origStart; ne=Math.max(snapped,origStart+15); }
      else { const d=snapped-anchor; ns=origStart+d; ne=origEnd+d; if(ns<INS_START){ns=INS_START;ne=INS_START+dur;} if(ne>INS_END){ne=INS_END;ns=INS_END-dur;} }
      const pct=(ns-INS_START)/INS_RANGE*100;
      const label=type==='move'?`${minsToTime(ns)} → ${minsToTime(ne)}`:type==='resize-s'?`Start: ${minsToTime(ns)}`:`End: ${minsToTime(ne)}`;
      setInsDragPreview({staffId:drag.staffId,blockId:drag.blockId,startMins:ns,endMins:ne});
      setInsDragTooltip({pct,label});
    }
    // Handle new block drawing
    const newDrag=insNewDragRef.current;
    if(newDrag){
      const {trackRect,anchor}=newDrag;
      const x=Math.max(0,Math.min(trackRect.width,e.clientX-trackRect.left));
      const snapped=Math.max(INS_START,Math.min(INS_END,Math.round((x/trackRect.width*INS_RANGE+INS_START)/15)*15));
      const s=Math.min(anchor,snapped), en=Math.max(anchor,snapped);
      setInsNewPreview({room:newDrag.room,startMins:s,endMins:Math.max(en,s+15)});
    }
  };
  insHandlerRef.current.up = () => {
    // Handle existing block drag save
    const drag=insDragRef.current;
    if(drag&&insDragPreview&&drag.blockId===insDragPreview.blockId){
      const {staffId,dayIdx}=drag;
      const {startMins,endMins}=insDragPreview;
      const key=`${wiso}|${staffId}|${dayIdx}`;
      const ns={...schedule};
      if(ns[key]?.blocks){
        ns[key]={...ns[key],blocks:ns[key].blocks.map(b=>
          b.id===drag.blockId?{...b,startTime:minsToTime(startMins),endTime:minsToTime(endMins)}:b
        )};
        setSchedule(reconcileReliefs(ns));
      }
    }
    insDragRef.current=null; setInsDragPreview(null); setInsDragTooltip(null);
    // Handle new block — show popover for staff assignment
    const newDrag=insNewDragRef.current;
    if(newDrag){
      const preview=insNewPreview;
      const startMins=preview?.startMins??newDrag.anchor;
      const endMins=preview?.endMins??Math.min(newDrag.anchor+60,INS_END);
      setInsNewPopover({room:newDrag.room,dayIdx:newDrag.dayIdx,startMins,endMins,
        staffId:"",isRelief:false,mouseX:insLastMouseRef.current.x,mouseY:insLastMouseRef.current.y});
      insNewDragRef.current=null; setInsNewPreview(null);
    }
  };
  useEffect(()=>{
    if(!showInsights)return;
    const mv=e=>insHandlerRef.current.move?.(e);
    const up=e=>insHandlerRef.current.up?.(e);
    document.addEventListener('mousemove',mv);
    document.addEventListener('mouseup',up);
    return()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
  },[showInsights]);

  // ── Calendar click-outside ─────────────────────────────────────────────────
  useEffect(()=>{
    if(!showCalendar)return;
    const h=e=>{ if(calRef.current&&!calRef.current.contains(e.target))setShowCalendar(false); };
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[showCalendar]);

  // Reset UI when switching locations
  const switchLocation = (id) => {
    setActiveLocId(id); setEditCell(null); setClipboard(null);
    setEditingStaffId(null); setEditingRoomId(null);
  };

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(""),2800); };

  // ── Week nav ───────────────────────────────────────────────────────────────
  const goToPrev = () => { const d=new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d); };
  const goToNext = () => { const d=new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d); };

  // ── Quick-fill / Copy ─────────────────────────────────────────────────────
  // ── Shared helper: write relief blocks for all blocks in a schedule snapshot ──
  const propagateReliefs = (ns, blocks, sId, dayIdx, targetWiso) => {
    const validStaffIds=new Set(staff.map(s=>String(s.id)));
    const srcName=staff.find(s=>String(s.id)===String(sId))?.name||"";
    blocks.forEach(b=>{
      (b.reliefs||[]).forEach(r=>{
        if(!r.staffId||!r.startTime||!r.endTime)return;
        // N/C means explicitly no coverer — skip propagation (handle both __nc__ and legacy __na__)
        if(isNCSentinel(r.staffId))return;
        // Guard: only propagate to real staff members
        if(!validStaffIds.has(String(r.staffId))){
          console.warn(`KCC: propagateReliefs skipping invalid staffId=${r.staffId}`);
          return;
        }
        const rKey=`${targetWiso}|${r.staffId}|${dayIdx}`;
        const existing=(ns[rKey]?.blocks||[]).filter(rb=>String(rb.reliefBlockId)!==String(r.id));
        const rStart=timeToMins(r.startTime);
        const coveredRoom=blocks.find(sb=>
          sb.room&&!HOURS_EXCLUDED_ROOMS.has(sb.room)&&sb.room!=="Relief"&&
          timeToMins(sb.startTime)<=rStart&&timeToMins(sb.endTime)>=rStart
        )?.room||blocks.reduce((prev,sb)=>{
          if(!sb.room||HOURS_EXCLUDED_ROOMS.has(sb.room)||sb.room==="Relief")return prev;
          const e=timeToMins(sb.endTime);
          if(e<=rStart&&(!prev||e>timeToMins(prev.endTime)))return sb;
          return prev;
        },null)?.room||"";
        ns[rKey]={blocks:[...existing,{...newBlock(r.startTime,r.endTime,coveredRoom),reliefFor:sId,reliefBlockId:r.id,reliefNote:`Relief for ${srcName}`,reliefs:[]}]};
      });
    });
  };

  // ── Reconcile relief linkage — fixes order-of-entry issues bidirectionally ──
  // Scans every block with reliefFor set and ensures the source staff's lunch block
  // has a matching reliefs[] entry. Auto-creates the lunch block if missing.
  const IS_LUNCH_ROOM = r => r==="Lunch / Break";
  // Treat both __nc__ (current) and __na__ (legacy pre-rename) as the "no coverage needed" sentinel
  const isNCSentinel = id => String(id)==="__nc__"||String(id)==="__na__";
  const reconcileReliefs = (ns) => {
    // Build a fast lookup of valid staff IDs so we can reject garbage reliefFor values
    const validStaffIds=new Set(staff.map(s=>String(s.id)));

    staff.forEach(coverer => {
      for(let dayIdx=0;dayIdx<7;dayIdx++){
        const key=`${wiso}|${coverer.id}|${dayIdx}`;
        const cell=ns[key]; if(!cell?.blocks) continue;
        cell.blocks.forEach(b=>{
          if(!b.reliefFor||!b.startTime||!b.endTime) return;
          const srcId=String(b.reliefFor);
          // N/C sentinel — no real coverer, nothing to reconcile (handle both __nc__ and legacy __na__)
          if(isNCSentinel(srcId)) return;

          // Guard: reliefFor must point to a real staff member — ignore garbage values
          if(!validStaffIds.has(srcId)){
            console.warn(`KCC: block has reliefFor=${srcId} which is not a valid staff ID — skipping`);
            return;
          }

          const srcKey=`${wiso}|${srcId}|${dayIdx}`;
          const bStart=timeToMins(b.startTime), bEnd=timeToMins(b.endTime);
          if(!ns[srcKey]) ns[srcKey]={blocks:[]};
          const srcBlocks=ns[srcKey].blocks;

          // 1. Find exact match — a lunch block that fully covers this relief window
          let lunchBlock=srcBlocks.find(lb=>
            IS_LUNCH_ROOM(lb.room||'')&&lb.startTime&&lb.endTime&&
            timeToMins(lb.startTime)<=bStart&&timeToMins(lb.endTime)>=bEnd
          );

          // 2. No exact match — find any lunch block for this person this day
          if(!lunchBlock){
            lunchBlock=srcBlocks.find(lb=>IS_LUNCH_ROOM(lb.room||'')&&lb.startTime&&lb.endTime);
          }

          // 3. Still nothing — only NOW auto-create
          if(!lunchBlock){
            lunchBlock={...newBlock(b.startTime,b.endTime,'Lunch / Break'),reliefs:[]};
            ns[srcKey]={...ns[srcKey],blocks:sortBlocks([...ns[srcKey].blocks,lunchBlock])};
          }

          // Already linked — nothing to do
          const alreadyLinked=(lunchBlock.reliefs||[]).some(r=>
            String(r.staffId)===String(coverer.id)||r.id===b.reliefBlockId
          );
          if(alreadyLinked) return;

          // Assign reliefBlockId and reliefNote on the coverer's block if missing
          const reliefId=b.reliefBlockId||`r${Date.now()}${Math.random()}`;
          const srcName=staff.find(s=>String(s.id)===srcId)?.name||"colleague";
          if(!b.reliefBlockId||!b.reliefNote){
            ns[key]={...ns[key],blocks:ns[key].blocks.map(bl=>
              bl.id===b.id?{...bl,reliefBlockId:reliefId,reliefNote:`Relief for ${srcName}`}:bl
            )};
          }
          // Add relief entry to source's lunch block
          const newEntry={id:reliefId,staffId:coverer.id,startTime:b.startTime,endTime:b.endTime};
          ns[srcKey]={...ns[srcKey],blocks:ns[srcKey].blocks.map(lb=>
            lb.id===lunchBlock.id?{...lb,reliefs:[...(lb.reliefs||[]),newEntry]}:lb
          )};
        });
      }
    });

    // ── Prune orphan lunch blocks ──────────────────────────────────────────────
    // If a person has multiple Lunch/Break blocks on the same day and one has
    // reliefs assigned while another is empty, remove the empty one(s).
    staff.forEach(s=>{
      for(let dayIdx=0;dayIdx<7;dayIdx++){
        const key=`${wiso}|${s.id}|${dayIdx}`;
        if(!ns[key]?.blocks) continue;
        const allLunch=ns[key].blocks.filter(b=>IS_LUNCH_ROOM(b.room||''));
        if(allLunch.length<=1) continue; // nothing to prune
        const hasPopulated=allLunch.some(b=>(b.reliefs||[]).length>0);
        if(!hasPopulated) continue; // all empty — user entered them manually, leave alone
        // Remove lunch blocks that have no reliefs and no manually-set relief coverage
        ns[key]={...ns[key],blocks:ns[key].blocks.filter(b=>
          !IS_LUNCH_ROOM(b.room||'')||(b.reliefs||[]).length>0
        )};
      }
    });

    return ns;
  };

  const copyFromPrevWeek = () => {
    let filled=0; const ns={...schedule};
    const prevWiso=new Date(weekStart); prevWiso.setDate(prevWiso.getDate()-7);
    staff.forEach(s=>{ for(let d=0;d<7;d++){
      const from=`${prevWiso.toISOString()}|${s.id}|${d}`, to=cellKey(s.id,d);
      if(schedule[from]&&!schedule[to]){
        const newBlocks=(schedule[from].blocks||[]).map(b=>({...b,id:uid(),reliefs:(b.reliefs||[]).map(r=>({...r,id:uid()}))}));
        ns[to]={blocks:newBlocks};
        propagateReliefs(ns,newBlocks,s.id,d,wiso);
        filled++;
      }
    }});
    setSchedule(ns); showToast(filled>0?`✅ Filled ${filled} shift${filled>1?"s":""} from last week`:"⚠️ No data found in previous week");
  };

  const copyDayFromPrev = (fromDayIdx, toDayIdx) => {
    const prevWiso=new Date(weekStart); prevWiso.setDate(prevWiso.getDate()-7);
    const ns={...schedule};
    let copied=0;
    staff.forEach(s=>{
      const from=`${prevWiso.toISOString()}|${s.id}|${fromDayIdx}`;
      if(schedule[from]){
        const newBlocks=(schedule[from].blocks||[]).map(b=>({...b,id:uid(),reliefs:(b.reliefs||[]).map(r=>({...r,id:uid()}))}));
        ns[cellKey(s.id,toDayIdx)]={blocks:newBlocks};
        propagateReliefs(ns,newBlocks,s.id,toDayIdx,wiso);
        copied++;
      }
    });
    setSchedule(ns);
    showToast(copied>0?`✅ Copied ${DAYS[fromDayIdx]} → ${DAYS[toDayIdx]}`:`⚠️ No data for ${DAYS[fromDayIdx]} in previous week`);
  };

  const clearWeek = () => {
    const ns={...schedule};
    staff.forEach(s=>{ for(let d=0;d<7;d++){ delete ns[cellKey(s.id,d)]; }});
    setSchedule(ns); showToast("🗑 Week cleared");
  };
  const clearDay = (dayIdx) => {
    const ns={...schedule};
    staff.forEach(s=>{ delete ns[cellKey(s.id,dayIdx)]; });
    setSchedule(ns); showToast(`🗑 ${DAY_SHORT[dayIdx]} cleared`);
  };

  const copyDay = (sId,dayIdx,e) => {
    e.stopPropagation(); const data=getCellData(sId,dayIdx);
    if(data){setClipboard({blocks:data.blocks}); showToast("📋 Day copied — click any cell to paste");}
  };
  const pasteDay = (sId,dayIdx,e) => {
    if(e&&e.stopPropagation)e.stopPropagation(); if(!clipboard)return;
    const ns={...schedule};
    const newBlocks=clipboard.blocks.map(b=>({...b,id:uid(),reliefs:(b.reliefs||[]).map(r=>({...r,id:uid()}))}));
    ns[cellKey(sId,dayIdx)]={blocks:newBlocks};
    propagateReliefs(ns,newBlocks,sId,dayIdx,wiso);
    setSchedule(ns); setClipboard(null); showToast("✅ Shift pasted");
  };

  // ── Cell editing ───────────────────────────────────────────────────────────
  const openEdit = (sId,dayIdx) => {
    const ex=getCellData(sId,dayIdx);
    const blocks=ex?.blocks?.length?ex.blocks.map(b=>{
      let reliefs=b.reliefs||[];
      if(!reliefs.length&&b.relief?.staffId) reliefs=[{id:uid(),...b.relief}];
      return {...b,reliefs};
    }):[newBlock()];
    setEditBlocks(blocks);
    setEditOrigBlocks(blocks); // snapshot for deletion detection
    setEditCell({sId,dayIdx});
  };
  const saveEdit = () => {
    if(reliefOverlapError) return; // hard block — relief commitment can't be overridden
    const valid=editBlocks.filter(b=>b.room&&b.startTime&&b.endTime);
    const ns={...schedule},key=cellKey(editCell.sId,editCell.dayIdx);
    if(valid.length===0)delete ns[key]; else ns[key]={blocks:valid};

    // ── If this is a relief staff's own edit, sync changes back to source staff ──
    // Use original snapshot to catch blocks that were deleted (not in editBlocks anymore)
    editOrigBlocks.forEach(origB=>{
      if(!origB.reliefFor||!origB.reliefBlockId)return;
      const stillPresent=valid.some(vb=>vb.id===origB.id);
      // Find the source block in ns that owns this relief entry
      Object.keys(ns).forEach(k=>{
        if(!ns[k]?.blocks)return;
        ns[k]={...ns[k],blocks:ns[k].blocks.map(srcBlock=>{
          if(!(srcBlock.reliefs||[]).some(r=>String(r.id)===String(origB.reliefBlockId)))return srcBlock;
          if(stillPresent){
            // Update times if the block still exists
            const updatedB=valid.find(vb=>vb.id===origB.id);
            return {...srcBlock,reliefs:srcBlock.reliefs.map(r=>
              String(r.id)===String(origB.reliefBlockId)?{...r,startTime:updatedB.startTime,endTime:updatedB.endTime}:r
            )};
          } else {
            // Block was deleted — remove from source's reliefs
            return {...srcBlock,reliefs:srcBlock.reliefs.filter(r=>String(r.id)!==String(origB.reliefBlockId))};
          }
        })};
      });
    });

    // ── Write/update relief blocks into relief staff schedules ──
    const prevBlocks=getCellData(editCell.sId,editCell.dayIdx)?.blocks||[];
    const prevReliefKeys=new Set();
    prevBlocks.forEach(b=>(b.reliefs||[]).forEach(r=>{if(r.staffId&&!isNCSentinel(r.staffId)&&r.id)prevReliefKeys.add(`${r.staffId}:${r.id}`);}));
    valid.forEach(b=>(b.reliefs||[]).forEach(r=>{ if(r.staffId&&!isNCSentinel(r.staffId)&&r.id)prevReliefKeys.delete(`${r.staffId}:${r.id}`); }));
    propagateReliefs(ns,valid,editCell.sId,editCell.dayIdx,wiso);

    // Remove relief blocks for any relief assignments that were deleted
    prevReliefKeys.forEach(k=>{
      const [sId,...rest]=k.split(":");
      const rId=rest.join(":"); // safe re-join in case ID somehow contained ":"
      const rKey=cellKey(sId,editCell.dayIdx);
      if(ns[rKey]?.blocks){
        // String-coerce both sides — reliefBlockId is stored as a number (from uid())
        // but rId is always a string after split, so strict !== would never match
        const remaining=ns[rKey].blocks.filter(rb=>String(rb.reliefBlockId)!==String(rId));
        if(remaining.length===0)delete ns[rKey]; else ns[rKey]={...ns[rKey],blocks:remaining};
      }
    });

    setSchedule(reconcileReliefs(ns)); setEditCell(null);
  };
  const clearCell = () => {
    const ns={...schedule};
    const clearingBlocks=getCellData(editCell.sId,editCell.dayIdx)?.blocks||[];

    // If any of these blocks are relief assignments, remove them from the source staff's reliefs[]
    clearingBlocks.forEach(b=>{
      if(!b.reliefFor||!b.reliefBlockId)return;
      Object.keys(ns).forEach(k=>{
        if(!ns[k]?.blocks)return;
        ns[k]={...ns[k],blocks:ns[k].blocks.map(srcBlock=>{
          if(!(srcBlock.reliefs||[]).some(r=>String(r.id)===String(b.reliefBlockId)))return srcBlock;
          return {...srcBlock,reliefs:srcBlock.reliefs.filter(r=>String(r.id)!==String(b.reliefBlockId))};
        })};
      });
    });

    // Also clean any other staff whose blocks have reliefFor pointing to the staff being cleared
    // (they were covering this person's lunch — now that their cell is gone, unlink them)
    const clearedStaffId=String(editCell.sId);
    Object.keys(ns).forEach(k=>{
      if(!ns[k]?.blocks)return;
      ns[k]={...ns[k],blocks:ns[k].blocks.map(b=>{
        if(String(b.reliefFor)!==clearedStaffId)return b;
        return {...b,reliefFor:null,reliefNote:"",reliefBlockId:null};
      })};
    });

    delete ns[cellKey(editCell.sId,editCell.dayIdx)];
    setSchedule(ns); setEditCell(null);
  };
  const updateBlock       = (id,f,v)  => setEditBlocks(prev=>{ const u=prev.map(b=>b.id===id?{...b,[f]:v}:b); return f==='startTime'?sortBlocks(u):u; });
  const updateBlockFields = (id,flds) => setEditBlocks(prev=>{ const u=prev.map(b=>b.id===id?{...b,...flds}:b); return 'startTime' in flds?sortBlocks(u):u; });
  const removeBlock = id => setEditBlocks(editBlocks.filter(b=>b.id!==id));
  const addBlock = () => {
    // Find the largest gap BETWEEN existing blocks and default the new block to that window.
    // Does NOT include the gap before the first block — that would place a lunch block at 5:30am.
    // Falls back to appending after the last block if no inter-block gap exists.
    const scheduled = editBlocks.filter(b=>b.startTime&&b.endTime)
      .map(b=>({s:timeToMins(b.startTime),e:timeToMins(b.endTime)}))
      .sort((a,b)=>a.s-b.s);
    let bestStart=null, bestEnd=null, bestGap=0;
    // Only check gaps between blocks (not before the first or after the last)
    for(let i=0;i<scheduled.length-1;i++){
      const g=scheduled[i+1].s-scheduled[i].e;
      if(g>bestGap){bestGap=g;bestStart=minsToTime(scheduled[i].e);bestEnd=minsToTime(scheduled[i+1].s);}
    }
    if(bestStart&&bestEnd&&bestGap>=15){
      setEditBlocks(sortBlocks([...editBlocks,newBlock(bestStart,bestEnd,"")]));
    } else {
      const l=editBlocks[editBlocks.length-1];
      setEditBlocks(sortBlocks([...editBlocks,newBlock(l?.endTime||"8:00 AM","4:00 PM","")]));
    }
  };
  const moveBlock   = (i,dir) => { const a=[...editBlocks],sw=i+dir; if(sw<0||sw>=a.length)return; [a[i],a[sw]]=[a[sw],a[i]]; setEditBlocks(a); };

  // ── Staff ──────────────────────────────────────────────────────────────────
  const addStaff       = () => { if(!newStaffName.trim())return; setStaff([...staff,{id:Date.now(),name:newStaffName.trim(),email:newStaffEmail.trim()}]); setNewStaffName(""); setNewStaffEmail(""); setShowAddStaff(false); };
  const startEditStaff = s  => { setEditingStaffId(s.id); setEditingStaffName(s.name); };
  const saveStaffName  = () => { if(editingStaffName.trim())setStaff(staff.map(s=>s.id===editingStaffId?{...s,name:editingStaffName.trim()}:s)); setEditingStaffId(null); };
  const saveStaffEmail = (id,email) => setStaff(staff.map(s=>s.id===id?{...s,email}:s));
  const removeStaff    = id => {
    // Clean dangling relief references in other staff's blocks
    const ns={...schedule};
    Object.keys(ns).forEach(k=>{
      if(!ns[k]?.blocks)return;
      // Remove from reliefs[] arrays where this staff was a coverer
      const cleaned=ns[k].blocks.map(b=>({...b,reliefs:(b.reliefs||[]).filter(r=>String(r.staffId)!==String(id))}));
      // Also unlink reliefFor if it pointed to the removed staff
      ns[k]={...ns[k],blocks:cleaned.map(b=>
        String(b.reliefFor)===String(id)?{...b,reliefFor:null,reliefNote:"",reliefBlockId:null}:b
      )};
    });
    // Remove this staff's own schedule keys — use exact format to avoid ID substring matches
    Object.keys(ns).forEach(k=>{ const parts=k.split("|"); if(parts[1]===String(id))delete ns[k]; });
    setStaff(staff.filter(s=>s.id!==id));
    setSchedule(ns);
  };

  // ── Rooms ──────────────────────────────────────────────────────────────────
  const startEditRoom = r => { setEditingRoomId(r.id); setEditingRoomName(r.name); };
  const saveRoomName  = () => {
    const t=editingRoomName.trim(); if(!t){setEditingRoomId(null);return;}
    const old=rooms.find(r=>r.id===editingRoomId)?.name;
    if(t!==old){
      setRooms(rooms.map(r=>r.id===editingRoomId?{...r,name:t}:r));
      const ns={...schedule};
      Object.keys(ns).forEach(k=>{ if(ns[k]?.blocks)ns[k]={...ns[k],blocks:ns[k].blocks.map(b=>b.room===old?{...b,room:t}:b)}; });
      setSchedule(ns);
    }
    setEditingRoomId(null);
  };
  const addRoom    = () => {
    if(!newRoomName.trim())return;
    const used=rooms.map(r=>r.colorIdx),idx=COLOR_PALETTE.findIndex((_,i)=>!used.includes(i));
    setRooms([...rooms,{id:Date.now(),name:newRoomName.trim(),colorIdx:idx>=0?idx:rooms.length%COLOR_PALETTE.length,capacity:null,ratio:null}]);
    setNewRoomName("");
  };
  const removeRoom = id => {
    const name=rooms.find(r=>r.id===id)?.name; setRooms(rooms.filter(r=>r.id!==id));
    const ns={...schedule}; Object.keys(ns).forEach(k=>{ if(ns[k]?.blocks)ns[k]={...ns[k],blocks:ns[k].blocks.map(b=>b.room===name?{...b,room:""}:b)}; }); setSchedule(ns);
  };

  // ── Locations ──────────────────────────────────────────────────────────────
  const addLocation = () => {
    if(!newLocName.trim())return;
    const id=Date.now(), usedIdx=locations.map(l=>l.colorIdx), cidx=LOC_COLORS.findIndex((_,i)=>!usedIdx.includes(i));
    setLocations([...locations,{id,name:newLocName.trim(),colorIdx:cidx>=0?cidx:locations.length%LOC_COLORS.length,staff:[],rooms:DEFAULT_ROOMS(),schedule:{},templates:[]}]);
    setNewLocName(""); switchLocation(id); setShowManageLocs(false);
    showToast(`✅ Location "${newLocName.trim()}" created`);
  };
  const startEditLoc  = l  => { setEditingLocId(l.id); setEditingLocName(l.name); };
  const saveLocName   = () => {
    const t=editingLocName.trim(); if(t) setLocations(locations.map(l=>l.id===editingLocId?{...l,name:t}:l));
    setEditingLocId(null);
  };
  const removeLoc = id => {
    if(locations.length<=1){showToast("⚠️ You must have at least one location");return;}
    const remaining=locations.filter(l=>l.id!==id); setLocations(remaining);
    if(activeLocId===id)setActiveLocId(remaining[0].id);
  };

  // ── Templates ──────────────────────────────────────────────────────────────
  const saveTemplate = () => {
    if(!newTemplateName.trim())return;
    const data={};
    staff.forEach(s=>{ for(let d=0;d<7;d++){ const k=cellKey(s.id,d); if(schedule[k])data[`${s.id}|${d}`]=schedule[k]; }});
    setTemplates([...templates,{id:Date.now(),name:newTemplateName.trim(),saved:new Date().toLocaleDateString(),data}]);
    setNewTemplateName(""); showToast("✅ Template saved");
  };
  const loadTemplate   = tmpl => {
    const ns={...schedule};
    staff.forEach(s=>{ for(let d=0;d<7;d++){
      if(tmpl.data[`${s.id}|${d}`]){
        const newBlocks=(tmpl.data[`${s.id}|${d}`].blocks||[]).map(b=>({...b,id:uid(),reliefs:(b.reliefs||[]).map(r=>({...r,id:uid()}))}));
        ns[cellKey(s.id,d)]={blocks:newBlocks};
        propagateReliefs(ns,newBlocks,s.id,d,wiso);
      }
    }});
    setSchedule(ns); setShowTemplates(false); showToast(`✅ Template "${tmpl.name}" loaded`);
  };
  const deleteTemplate = id => setTemplates(templates.filter(t=>t.id!==id));

  // ── Hours ──────────────────────────────────────────────────────────────────
  const staffDayMins  = (sId,d) => dayMins(getCellData(sId,d)?.blocks);
  const staffWeekMins = sId     => weekDates.reduce((s,_,d)=>s+staffDayMins(sId,d),0);

  // ── Print ──────────────────────────────────────────────────────────────────
  const weekLabel = `Week of ${formatDate(weekDates[0])} – ${formatDate(weekDates[6])}`;

  const buildPrintHtml = (filteredStaff, title) => {
    const legend=rooms.map(r=>{ const c=COLOR_PALETTE[r.colorIdx%COLOR_PALETTE.length];
      return `<span style="display:inline-flex;align-items:center;gap:5px;background:${c.bg};border:1.5px solid ${c.border};border-radius:20px;padding:3px 10px;font-size:11px;color:${c.text};font-weight:700;margin:2px;"><span style="width:7px;height:7px;border-radius:50%;background:${c.dot};display:inline-block;"></span>${r.name}</span>`;
    }).join("");
    const dayHdrs=DAY_SHORT.map((ds,i)=>`<th style="background:${locColor};color:white;padding:10px 8px;font-size:12px;font-weight:800;text-align:center;min-width:90px;">${ds}<br/><span style="font-weight:500;opacity:0.8;font-size:10px;">${formatDate(weekDates[i])}</span></th>`).join("");
    const rows=filteredStaff.map(s=>{
      const cells=weekDates.map((_,di)=>{
        const blks=(getCellData(s.id,di)||{}).blocks||[];
        if(!blks.length)return`<td style="padding:6px;border:1px solid #E2E8F0;text-align:center;color:#CBD5E1;font-size:18px;">—</td>`;
        const inner=blks.map(b=>{ const c=rc(b.room); return`<div style="background:${c.bg};border:1.5px solid ${c.border};border-radius:6px;padding:4px 7px;margin-bottom:3px;"><div style="font-weight:800;font-size:11px;color:${c.text};">${b.room||"—"}</div><div style="font-size:10px;color:#475569;font-weight:600;">${b.startTime} – ${b.endTime}</div></div>`; }).join("");
        return`<td style="padding:5px;border:1px solid #E2E8F0;vertical-align:top;">${inner}<div style="font-size:9px;color:#94A3B8;font-weight:700;text-align:right;margin-top:2px;">${fmtHours(dayMins(blks))}</div></td>`;
      }).join("");
      return`<tr><td style="padding:10px 14px;border:1px solid #E2E8F0;font-weight:700;font-size:13px;white-space:nowrap;background:#FAFDF9;">${s.name}<br/><span style="font-size:10px;color:${locColor};font-weight:800;">${fmtHours(staffWeekMins(s.id))}/wk</span></td>${cells}</tr>`;
    }).join("");
    return`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Nunito',sans-serif;background:white}@media print{.no-print{display:none!important}}</style>
    </head><body>
      <div style="background:linear-gradient(135deg,#0a0e1a,#1a2744);padding:18px 28px;color:white;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:12px;"><span style="font-size:26px;">🌱</span><div>
          <div style="font-weight:900;font-size:18px;">Kids Connection Childcare</div>
          <div style="font-weight:700;font-size:14px;opacity:0.85;">${loc.name} · ${title}</div>
          <div style="font-size:12px;opacity:0.75;">${weekLabel}</div>
        </div></div>
        <button class="no-print" onclick="window.print()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:white;border-radius:9px;padding:8px 16px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">🖨️ Print</button>
      </div>
      <div style="padding:10px 28px;background:white;border-bottom:2px solid #E8F3E8;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:11px;font-weight:800;color:#6B7280;margin-right:4px;">ROOMS:</span>${legend}
      </div>
      <div style="padding:16px 28px;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;box-shadow:0 2px 12px rgba(0,0,0,0.07);">
          <thead><tr><th style="background:${locColor};color:white;padding:10px 14px;font-size:12px;font-weight:800;text-align:left;min-width:130px;">STAFF MEMBER</th>${dayHdrs}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="text-align:center;padding:14px;color:#94A3B8;font-size:11px;">Kids Connection Childcare · ${loc.name} · Generated by Staff Scheduler</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
    </body></html>`;
  };

  const handleDownloadICS = (s) => {
    const ics = generateICS(s, weekDates, schedule, loc.name, staff);
    downloadICS(ics, `${s.name.replace(/\s+/g,"-")}-schedule-${weekStart.toISOString().slice(0,10)}.ics`);
    showToast(`📅 Calendar file downloaded for ${s.name}`);
  };
  const handleSendCalendarInvite = async (s) => {
    if (!s.email) { showToast("⚠️ Please add an email address first"); return; }
    const webcalUrl = `${HOSTED_URL}/api/calendar/${s.id}`;
    setEmailSending(true);
    try {
      const res = await fetch("/api/send-calendar-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail:    s.email,
          toName:     s.name,
          locName:    loc.name,
          webcalUrl,
        }),
      });
      if (res.ok) {
        setEmailSent(prev => ({...prev, [s.id]: true}));
        showToast(`✅ Calendar invite sent to ${s.email}`);
      } else {
        const err = await res.json();
        showToast(`❌ Failed to send: ${err.error || "Unknown error"}`);
      }
    } catch(e) {
      showToast("❌ Could not reach email server — are you running on Vercel?");
    }
    setEmailSending(false);
  };
  const handlePrint      = ()    => { const w=window.open("","_blank"); if(w){w.document.write(buildPrintHtml(staff,"Weekly Schedule"));w.document.close();}else alert("Please allow pop-ups."); };
  const handleStaffPrint = (s,e) => { e.stopPropagation(); const w=window.open("","_blank"); if(w){w.document.write(buildPrintHtml([s],`${s.name}'s Schedule`));w.document.close();}else alert("Please allow pop-ups."); };

  const overlapWarn = editBlocks.length>1&&hasOverlap(editBlocks.filter(b=>b.startTime&&b.endTime));
  // Hard block: a new/regular block overlaps an existing relief commitment — cannot be overridden
  const reliefOverlapError = (() => {
    const reliefBlocks = editBlocks.filter(b=>b.reliefFor&&b.startTime&&b.endTime);
    const regularBlocks = editBlocks.filter(b=>!b.reliefFor&&b.room&&b.startTime&&b.endTime);
    for(const rb of reliefBlocks){
      const rs=timeToMins(rb.startTime),re=timeToMins(rb.endTime);
      for(const nb of regularBlocks){
        const ns=timeToMins(nb.startTime),ne=timeToMins(nb.endTime);
        if(ns<re&&rs<ne) return rb;
      }
    }
    return null;
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'Nunito','Segoe UI',sans-serif",minHeight:"100vh",background:"#F0F7F4"}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* ── TOAST ── */}
      {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:"#1B4332",color:"white",padding:"10px 22px",borderRadius:12,fontSize:13,fontWeight:700,zIndex:3000,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",whiteSpace:"nowrap",pointerEvents:"none"}}>{toast}</div>}

      {/* ── CLIPBOARD BANNER ── */}
      {clipboard&&<div style={{background:"#1565C0",color:"white",padding:"9px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:13,fontWeight:700,position:"sticky",top:0,zIndex:900,boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>
        <span>📋 Shift copied — click any cell to paste it there</span>
        <button onClick={()=>setClipboard(null)} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"white",borderRadius:8,padding:"4px 12px",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:12}}>✕ Cancel</button>
      </div>}

      {/* ── HEADER ── */}
      <div style={{background:"#1E3A8A",padding:"16px 28px",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABhsAAAYbCAYAAAAGsQssAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAEAAElEQVR4nOz9ebhsV34Xdn/X3lV1hjvpau5utdSTex5st7vd3W7P89hgGw9gGzAYHAMhTAISjMNMDIYAIYzO+xIcwvuShITwBkJeMO9jENgOeMA0xrPV7knqlnSnM1TV3uv9Y+8659yrK3VLW9LVlT6f5yntc+pUnbPr6J5Va6/vWr9V7n3P99YAAAAAAAA8Tc2NPgEAAAAAAODmJmwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwibABAAAAAACYRNgAAAAAAABMImwAAAAAAAAmETYAAAAAAACTCBsAAAAAAIBJhA0AAAAAAMAkwgYAAAAAAGASYQMAAAAAADCJsAEAAAAAAJhE2AAAAAAAAEwibAAAAAAAACYRNgAAAAAAAJMIGwAAAAAAgEmEDQAAAAAAwCTCBgAAAAAAYBJhAwAAAAAAMImwAQAAAAAAmETYAAAAAAAATCJsAAAAAAAAJhE2AAAAAAAAkwgbAAAAAACASYQNAAAAAADAJMIGAAAAAABgEmEDAAAAAAAwyexG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IAiEcGwUCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAIYWwQCAQCgUAgEAgEAoFAIBAIBAKBQBAItdwdEAgEgqbo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YNrauvNH8frXvz5e9KIXxSte8Yp48YtfHFtvvXW0trZGc3NzNDU1xfLly6O/vz/a2tpiwYIFMW/evLj33nvj7rvvjtjxY1P9EibFrlvdHK973eti5513jp122ilmzJgRs2fPLjr0XV1d0d7eHt3d3XHPPffEPffcE3/84x+n30DKemzT9ePYZZddYrfddovBwcFobW0tBomfffbZeOKJJ+KBBx6Ysk1kX9Z4feyyyy7R0NAQc+bMiaGhoZgxY0b09fXFo48+Gk8//XQ8/vjjm+X8+6van8WLXvSi2GmnnWK77baL5ubmGBwcjFWrVkV7e3ssWLAg7rvvvuja5oOTfizr8vcv/ENss802MWfOnJgxY0Yxw72rqys6Ojrinnvu2awzvF5Sd03sueee8bKXvawYBEvL3NP+H2lTsNra2mhsbCz+Pf1bqvG+oZlBqbE+MDAQw8PDMTAwUOxX0NvbW9Tn7urqihUrVsTg4GD09vbGY489FvPmzZv08GxTvazx+thtt93i1a9+deywww6x3XbbRUtLS8ycObNoPKeBrq6urrj//vvj7rvvjj/84Q/RM+efp/rwq6Z20UXx8pe/vLgPpdq2vb29sWrVqli6dOm0f71bd/4oXvva18a2224bL3jBC6K1tTWGh4dj1apVsWjRoli2bFncueQNU32YFZnZfmm86lWvit122y1e+cpXxg477BCzZs2KpqamaGlpiYaGhuL+8dhjj8UDDzwQTzzxRNz2xGum+tAr9tL6a2P33XeP7bbbLkZGRorPq6enJ5555pm4//77p2y27Mz2S2PXXXeNHXfcMZqbm6O5ubnYW6O9vT2efPLJePDBB7eYNsh08JfY/p3R9r3Ydddd42Uve1lss802MWvWrOKesWTJkli0aFEsXLgwFte9a0qOr+nZ78Quu+wSr371q2P27NnR0tISPT09UVtbG6tXr44HH3ww5s+fH+0z37fZjql5+SXxqle9qrjfbrXVVkUJtSeeeCIGBgbioYceiicHD5r0Y6lf8q1405veFK985SujpaUlZs2atcH2UWo/pT1kxrevNrYyOE3gGRwcjP7+/ujt7Y2+vr7o6+uLoaGhWLZsWUSMhpyrV68uvgcPPPDA5N9/F1ww+v/T8Hs23e3UcF38zd/8Tey6667xghe8IHbYYYeYM2dOcc9OGwwvWLAgenp6YsGCBXHXXXfFHXfcEYtqD5vSY29YenEcddRR8ZGPfCR23HHHGB4ejt7e3mhtbS0Grtvb2+PAAw+ckj0QK3Hup3aKww8/fJ0rlfr6+uJnP/tZ/Od//md1238LLoiXvOQl0dLSEi0tLfHiF7+4uK5GjAbkDz744Gbtqz6//4q48MIL4/Wvf/2YSRGrVq2K2bNnx7/+67/GT+7YoerPW7voovi7v/u7eN3rXheNjY3R1NRU9CMaGhqK/R0iYoPXz9bW1iJMKF9LyyFvCnTSfmSpFOnw8HB0d3dHX19fdHV1RWdnZ3R2dkZHR0d0dHRET09P3HjjjTG0/QlVf/089wgbAAAAAGADXjTy09hnn31in332iVe84hWx/fbbxy233BJf+tKXYkn94VN9eBt04jtH4uijj46ZM2fGs88+G7/4xS/i6quvnhblPje3XWbdGMccc0z87d/+bbS2tsatt94a55xzTvRue9xUHxr8RRA2AAAAAAAAWTa+HT0AAAAAAMAGCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgi7ABAAAAAADIImwAAAAAAACyCBsAAAAAAIAswgYAAAAAACCLsAEAAAAAAMgibAAAAAAAALIIGwAAAAAAgCzCBgAAAAAAIIuwAQAAAAAAyCJsAAAAAAAAsggbAAAAAACALMIGAAAAAAAgy/8PaArr1xiXz/wAAAAASUVORK5CYII=" alt="Kids Connection Childcare" style={{height:64,width:130,objectFit:"contain",flexShrink:0}}/>
          <div>
            <div style={{fontWeight:900,fontSize:20,letterSpacing:"-0.3px",lineHeight:1.1,color:"white"}}>Kids Connection Childcare</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:3,fontWeight:600}}>{loc.name}</div>
          </div>
        </div>
        {saveStatus&&<span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.85)"}}>{saveStatus==="saving"?"⏳ Saving…":"✅ Saved"}</span>}
      </div>

      {/* ── LOCATION TABS ── */}
      <div style={{background:"#1E3A8A",display:"flex",alignItems:"center",gap:0,overflowX:"auto",padding:"0 20px"}}>
        {locations.map(l=>{
          const isActive=l.id===activeLocId;
          const lc=LOC_COLORS[l.colorIdx%LOC_COLORS.length];
          return(
            <button key={l.id} onClick={()=>switchLocation(l.id)}
              style={{padding:"11px 20px",border:"none",background:isActive?lc:"transparent",color:isActive?"white":"rgba(255,255,255,0.5)",fontFamily:"inherit",fontWeight:isActive?800:600,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",borderBottom:isActive?"3px solid rgba(255,255,255,0.4)":"3px solid transparent",transition:"all 0.15s",flexShrink:0}}>
              📍 {l.name}
            </button>
          );
        })}
        <button onClick={()=>setShowManageLocs(true)}
          style={{marginLeft:"auto",padding:"11px 16px",border:"none",background:"transparent",color:"rgba(255,255,255,0.5)",fontFamily:"inherit",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,display:"flex",alignItems:"center",gap:5}}>
          ⚙️ Manage Locations
        </button>
        <button onClick={handlePrint} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.25)",color:"white",padding:"7px 14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",flexShrink:0}}>🖨️ Print</button>

        <button onClick={onSignOut} style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.25)",color:"white",padding:"7px 14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",flexShrink:0}}>🚪 Sign Out</button>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{background:"#E8F3E8",padding:"8px 28px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",borderBottom:"1px solid #D0E8D0"}}>
        <span style={{fontSize:11,fontWeight:800,color:"#4B7A5A",letterSpacing:"0.5px",marginRight:4}}>QUICK ACTIONS:</span>
        <button onClick={()=>setCopyPrevModal({step:"pick"})} style={{background:"white",border:"1.5px solid #40916C",color:"#1B4332",borderRadius:9,padding:"5px 13px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>⬅️ Copy from Prev Day/Week</button>
        <button onClick={()=>setShowClearModal(true)}  style={{background:"white",border:"1.5px solid #DC2626",color:"#DC2626",borderRadius:9,padding:"5px 13px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>🗑 Clear Day / Week</button>
        <button onClick={()=>setShowTemplates(true)} style={{background:"white",border:"1.5px solid #9575CD",color:"#512DA8",borderRadius:9,padding:"5px 13px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>📁 Templates{templates.length>0?` (${templates.length})`:""}</button>
        <div ref={calRef} style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,background:"white",borderRadius:9,padding:"4px 10px",position:"relative",border:"1.5px solid #40916C"}}>
          <button onClick={goToPrev} style={{background:"none",border:"none",color:"#1B4332",cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 3px"}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontWeight:800,fontSize:12,whiteSpace:"nowrap",color:"#1B4332"}}>{weekLabel}</div>
            <button onClick={()=>{setShowCalendar(!showCalendar);setCalViewMonth(new Date(weekStart.getFullYear(),weekStart.getMonth(),1));}} style={{background:"none",border:"none",color:"#2D6A4F",cursor:"pointer",fontSize:10,padding:"2px 0",fontFamily:"inherit",fontWeight:700}}>📅 Pick a date ▾</button>
          </div>
          <button onClick={goToNext} style={{background:"none",border:"none",color:"#1B4332",cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 3px"}}>›</button>
          {showCalendar&&(()=>{
            const yr=calViewMonth.getFullYear(),mo=calViewMonth.getMonth();
            const mName=calViewMonth.toLocaleDateString("en-US",{month:"long",year:"numeric"});
            const fd=new Date(yr,mo,1).getDay(),dim=new Date(yr,mo+1,0).getDate();
            const off=fd===0?6:fd-1; const cells=[]; for(let i=0;i<off;i++)cells.push(null); for(let d=1;d<=dim;d++)cells.push(new Date(yr,mo,d));
            while(cells.length%7!==0)cells.push(null);
            const weeks=[]; for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));
            const today=new Date();
            return(
              <div style={{position:"absolute",top:"calc(100% + 10px)",right:0,background:"white",borderRadius:16,boxShadow:"0 12px 40px rgba(0,0,0,0.25)",padding:16,zIndex:2000,minWidth:280,color:"#1E293B"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <button onClick={()=>setCalViewMonth(new Date(yr,mo-1,1))} style={{background:"#F0F7F4",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16,color:"#2D6A4F",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>‹</button>
                  <span style={{fontWeight:800,fontSize:14,color:"#1B4332"}}>{mName}</span>
                  <button onClick={()=>setCalViewMonth(new Date(yr,mo+1,1))} style={{background:"#F0F7F4",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16,color:"#2D6A4F",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>›</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
                  {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:"#94A3B8",padding:"3px 0"}}>{d}</div>)}
                </div>
                {weeks.map((week,wi)=>{
                  const fv=week.find(d=>d!==null),ws2=fv?getWeekStart(fv):null;
                  const isSel=ws2&&weekStart.toDateString()===ws2.toDateString();
                  return(
                    <div key={wi} onClick={()=>{if(ws2){setWeekStart(ws2);setShowCalendar(false);}}}
                      style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderRadius:8,cursor:fv?"pointer":"default",background:isSel?"#D8F3DC":"transparent",marginBottom:2,transition:"background 0.12s"}}
                      onMouseEnter={e=>{if(!isSel&&fv)e.currentTarget.style.background="#F0F7F4";}}
                      onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent";}}>
                      {week.map((day,di)=>{ const isT=day&&day.toDateString()===today.toDateString();
                        return<div key={di} style={{textAlign:"center",padding:"5px 2px",fontSize:12,fontWeight:isT?900:isSel?800:500,color:day?(isT?"#1B4332":"#374151"):"transparent",borderRadius:6,background:isT?"#95D5B2":"transparent"}}>{day?day.getDate():""}</div>;
                      })}
                    </div>
                  );
                })}
                <div style={{textAlign:"center",marginTop:10,fontSize:11,color:"#94A3B8",fontWeight:600}}>Click any row to jump to that week</div>
                <button onClick={()=>setShowCalendar(false)} style={{marginTop:8,width:"100%",padding:8,borderRadius:9,border:"none",background:"#F0F7F4",color:"#2D6A4F",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── ROOM LEGEND BAR ── */}
      <div style={{background:"white",padding:"10px 28px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",borderBottom:"1px solid #D8EDD5",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
        <span style={{fontSize:11,fontWeight:800,color:"#6B7280",letterSpacing:"0.6px",marginRight:2}}>ROOMS:</span>
        {rooms.map(room=>{ const c=COLOR_PALETTE[room.colorIdx%COLOR_PALETTE.length]; return(
          <span key={room.id} style={{display:"inline-flex",alignItems:"center",gap:5,background:c.bg,border:`1.5px solid ${c.border}`,borderRadius:20,padding:"3px 10px",fontSize:11.5,color:c.text,fontWeight:700}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:c.dot,flexShrink:0}}/>{room.name}
          </span>
        ); })}
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={()=>setShowInsights(false)} style={{background:showInsights?"white":"linear-gradient(135deg,#1E3A8A,#16307acc)",color:showInsights?"#1E3A8A":"white",border:"2px solid #1E3A8A",borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>📅 Schedule</button>
          <button onClick={()=>setShowInsights(true)} style={{background:showInsights?"linear-gradient(135deg,#1E3A8A,#16307acc)":"white",color:showInsights?"white":"#1E3A8A",border:"2px solid #1E3A8A",borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>📊 Overview</button>
          <button onClick={()=>setShowManageRooms(true)} style={{background:"white",color:"#2D6A4F",border:"2px solid #40916C",borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>🏠 Edit Spaces</button>
          <button onClick={()=>setShowAddStaff(true)} style={{background:`linear-gradient(135deg,${locColor},${locColor}cc)`,color:"white",border:"none",borderRadius:10,padding:"7px 16px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>+ Add Staff</button>
        </div>
      </div>


      {/* ── INSIGHTS VIEW ── */}
      {showInsights&&(()=>{
        const BLOCK_H=34, BLOCK_PAD=4;
        const clampedInsightDayIdx = Math.min(insightDayIdx, 6);
        const hours = [6,7,8,9,10,11,12,13,14,15,16,17,18];
        const RELIEF_COLOR = {bg:"#FEF9C3",border:"#F59E0B",text:"#92400E",dot:"#F59E0B"};

        // Room order — use insightRoomOrder if set, else default rooms order
        const orderedRooms = (insightRoomOrder || rooms.filter(r=>r.name!=="Vacation"&&r.name!=="Sick")).map(r=>
          rooms.find(rm=>rm.name===r.name)||r
        ).filter(Boolean);

        // Hidden rooms set
        const hiddenRooms = insightRoomFilter || new Set();

        // Lane assignment:
        // - Lanes are assigned in INPUT ORDER (caller pre-sorts by shift duration desc)
        //   so the longest-shift staff always gets lane 0, next longest lane 1, etc.
        // - Relief blocks inherit the lane of whoever they're covering.
        // - Final output is sorted by start time for correct visual left→right rendering.
        const buildLanes = (blocks) => {
          // First pass: assign lane by order of first appearance in input (duration order)
          const staffLane={};
          blocks.forEach(rb=>{
            if(!rb.isRelief&&staffLane[String(rb.staffId)]===undefined){
              staffLane[String(rb.staffId)]=Object.keys(staffLane).length;
            }
          });
          // Second pass: assign lanes, then sort by start time for rendering
          const withLanes=blocks.map(rb=>{
            if(rb.isRelief&&rb.reliefFor!=null){
              const coveredLane=staffLane[String(rb.reliefFor)];
              return{...rb,lane:coveredLane!==undefined?coveredLane:Object.keys(staffLane).length};
            }
            return{...rb,lane:staffLane[String(rb.staffId)]??0};
          });
          return withLanes.sort((a,b)=>timeToMins(a.startTime)-timeToMins(b.startTime));
        };

        const roomStaffMap = {};
        orderedRooms.forEach(room=>{
          const raw=[];

          // Sort staff by total minutes in this room today (descending) so longest shifts are at top
          const staffWithDuration=[...staff].map((s,si)=>{
            const blocks=(getCellData(s.id,clampedInsightDayIdx)?.blocks||[]).filter(b=>b.room===room.name&&b.startTime&&b.endTime);
            const totalMins=blocks.reduce((sum,b)=>sum+Math.max(0,timeToMins(b.endTime)-timeToMins(b.startTime)),0);
            return {s,si,totalMins};
          }).filter(x=>x.totalMins>0).sort((a,b)=>b.totalMins-a.totalMins);

          staffWithDuration.forEach(({s,si})=>{
            (getCellData(s.id,clampedInsightDayIdx)?.blocks||[]).forEach(b=>{
              if(b.room===room.name&&b.startTime&&b.endTime){
                // Only use explicit reliefFor — inferred relief was causing regular blocks
                // that overlap the relief window to be incorrectly placed in the owner's lane.
                // The boot cleanup pass stamps reliefFor on any block that was missing it,
                // so every real relief block has it explicitly set.
                const resolvedReliefFor=b.reliefFor||null;
                raw.push({staffId:s.id,name:s.name,si,startTime:b.startTime,endTime:b.endTime,
                  blockId:b.id,
                  isRelief:!!(resolvedReliefFor),
                  reliefFor:resolvedReliefFor,
                  reliefNote:b.reliefNote||''});
              }
            });
          });
          roomStaffMap[room.name]=buildLanes(raw);
        });

        // For each room, find lunch gaps per staff member (gap between consecutive blocks of same person)
        // If they have a Lunch/Break block with no relief in that gap → show an "Add relief" zone
        const lunchGapMap = {}; // roomName → [{staffId, name, si, lane, gapStartMins, gapEndMins, lunchBlockId}]
        orderedRooms.forEach(room=>{
          const gaps=[];
          const staffInRoom=new Map();
          (roomStaffMap[room.name]||[]).forEach(rb=>{
            if(!staffInRoom.has(rb.staffId)) staffInRoom.set(rb.staffId,{name:rb.name,si:rb.si,lane:rb.lane,blocks:[]});
            staffInRoom.get(rb.staffId).blocks.push(rb);
          });
          staffInRoom.forEach((info,sId)=>{
            const sorted=[...info.blocks].sort((a,b)=>timeToMins(a.startTime)-timeToMins(b.startTime));
            for(let i=0;i<sorted.length-1;i++){
              const gapStart=timeToMins(sorted[i].endTime), gapEnd=timeToMins(sorted[i+1].startTime);
              if(gapEnd<=gapStart) continue;
              // Only flag gaps of 60 minutes or under — wider gaps are not lunch breaks
              if(gapEnd-gapStart>60) continue;
              // Find a Lunch/Break block for this staff in this gap
              const theirBlocks=getCellData(sId,clampedInsightDayIdx)?.blocks||[];
              const lunchBlock=theirBlocks.find(b=>IS_LUNCH_ROOM(b.room||'')&&b.startTime&&b.endTime&&
                timeToMins(b.startTime)>=gapStart-15&&timeToMins(b.endTime)<=gapEnd+15);
              if(lunchBlock){
                const reliefEntries=(lunchBlock.reliefs||[]).filter(r=>r.staffId&&r.startTime&&r.endTime);
                const isNa=reliefEntries.length>0&&reliefEntries.every(r=>isNCSentinel(r.staffId));
                const hasRealRelief=reliefEntries.some(r=>!isNCSentinel(r.staffId));
                gaps.push({staffId:sId,name:info.name,si:info.si,lane:info.lane,
                  gapStartMins:gapStart,gapEndMins:gapEnd,lunchBlockId:lunchBlock.id,
                  hasRelief:hasRealRelief,isNa});
              }
            }
          });
          lunchGapMap[room.name]=gaps;
        });

        const maxLanes = (blocks) => blocks.reduce((m,b)=>Math.max(m,(b.lane||0)+1),1);

        const moveRoom = (idx, dir) => {
          const base = insightRoomOrder || rooms.filter(r=>r.name!=="Vacation"&&r.name!=="Sick");
          const arr=[...base];
          const newIdx=idx+dir;
          if(newIdx<0||newIdx>=arr.length) return;
          [arr[idx],arr[newIdx]]=[arr[newIdx],arr[idx]];
          setInsightRoomOrder(arr);
        };

        const toggleHideRoom = (name) => {
          setInsightRoomFilter(prev=>{
            const next=new Set(prev||[]);
            if(next.has(name)) next.delete(name); else next.add(name);
            return next.size===0?null:next;
          });
        };

        return(
          <div style={{padding:"20px 28px"}}>
            {/* Navy header bar — matches schedule table header */}
            <div style={{background:"white",borderRadius:18,boxShadow:"0 2px 20px rgba(0,0,0,0.07)",overflow:"hidden",marginBottom:0}}>
              <div style={{background:"#1E3A8A",display:"flex",alignItems:"stretch"}}>
                {/* Left column: SPACE / ROOM label */}
                <div style={{width:190,flexShrink:0,padding:"13px 16px",borderRight:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:800,color:"white",letterSpacing:"0.5px"}}>SPACE / ROOM</span>
                </div>
                {/* Day columns — clickable to switch day */}
                <div style={{flex:1,display:"flex"}}>
                  {weekDates.map((date,i)=>{ const isToday=date.toDateString()===new Date().toDateString(); const isActive=clampedInsightDayIdx===i; return(
                    <button key={i} onClick={()=>setInsightDayIdx(i)}
                      style={{flex:1,padding:"10px 4px",background:isActive?"rgba(255,255,255,0.18)":isToday?"rgba(255,255,255,0.07)":"transparent",
                        border:"none",borderRight:i<6?"1px solid rgba(255,255,255,0.08)":"none",cursor:"pointer",fontFamily:"inherit",position:"relative",
                        outline:isActive?"2px solid rgba(255,255,255,0.5)":"none",outlineOffset:"-2px"}}>
                      {isToday&&!isActive&&<div style={{position:"absolute",top:5,right:5,background:"#95D5B2",color:"#1B4332",fontSize:8,fontWeight:900,padding:"1px 5px",borderRadius:6}}>TODAY</div>}
                      <div style={{fontSize:13,fontWeight:isActive?900:700,color:"white"}}>{DAY_SHORT[i]}</div>
                      <div style={{fontSize:10,color:isActive?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.55)",marginTop:1,fontWeight:500}}>{formatDate(date)}</div>
                      {isActive&&<div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:3,background:"#95D5B2",borderRadius:"3px 3px 0 0"}}/>}
                    </button>
                  ); })}
                </div>
              </div>

            <div style={{padding:"16px 20px",overflowX:"auto"}}>
              {/* Hour ticks */}
              <div style={{display:"flex",alignItems:"center",marginBottom:10,paddingBottom:6,borderBottom:"1px solid #F1F5F9"}}>
                <div style={{width:190,flexShrink:0}}/>
                <div style={{flex:1,position:"relative",height:16}}>
                  {hours.map(h=>{
                    const pct=(h*60-INS_START)/INS_RANGE*100;
                    if(pct<0||pct>100) return null;
                    const lbl=h===12?"12p":h>12?`${h-12}p`:`${h}a`;
                    return <span key={h} style={{position:"absolute",left:`${pct}%`,transform:"translateX(-50%)",fontSize:10,color:"#94A3B8",fontWeight:700}}>{lbl}</span>;
                  })}
                </div>
              </div>

              {/* Room rows */}
              {orderedRooms.map((room,roomIdx)=>{
                const c=COLOR_PALETTE[room.colorIdx%COLOR_PALETTE.length];
                const isHidden=hiddenRooms.has(room.name);
                const roomBlocks=roomStaffMap[room.name]||[];
                const lanes=maxLanes(roomBlocks);
                const rowH=Math.max(44,lanes*(BLOCK_H+BLOCK_PAD)+BLOCK_PAD*2);
                return(
                  <div key={room.id} style={{display:"flex",alignItems:"flex-start",marginBottom:6,opacity:isHidden?0.4:1}}>
                    {/* Controls + room label */}
                    <div style={{width:190,flexShrink:0,paddingRight:10,display:"flex",alignItems:"flex-start",gap:4,paddingTop:4}}>
                      {/* Reorder buttons */}
                      <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                        <button onClick={()=>moveRoom(roomIdx,-1)} disabled={roomIdx===0}
                          style={{background:"none",border:"none",cursor:roomIdx===0?"default":"pointer",fontSize:11,color:roomIdx===0?"#E2E8F0":"#94A3B8",padding:"1px 3px",lineHeight:1}}>▲</button>
                        <button onClick={()=>moveRoom(roomIdx,1)} disabled={roomIdx===orderedRooms.length-1}
                          style={{background:"none",border:"none",cursor:roomIdx===orderedRooms.length-1?"default":"pointer",fontSize:11,color:roomIdx===orderedRooms.length-1?"#E2E8F0":"#94A3B8",padding:"1px 3px",lineHeight:1}}>▼</button>
                      </div>
                      {/* Room label + hide toggle */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{background:c.bg,border:`1.5px solid ${c.border}`,borderRadius:8,padding:"5px 8px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:4}}>
                          <span style={{fontSize:10.5,fontWeight:800,color:c.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{room.name}</span>
                          <button onClick={()=>toggleHideRoom(room.name)} title={isHidden?"Show room":"Hide room"}
                            style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:isHidden?c.border:"#94A3B8",flexShrink:0,padding:0,lineHeight:1}}>
                            {isHidden?"👁":"🙈"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Timeline track */}
                    {!isHidden?(
                      <div ref={el=>{if(el)el._insRoom=room.name;}}
                        style={{flex:1,position:"relative",background:"#F8FAFC",borderRadius:10,border:"1.5px solid #E2E8F0",height:rowH,minWidth:0,userSelect:"none"}}
                        onMouseDown={e=>{
                          if(e.button!==0)return;
                          // Only fire if click is on the track itself (blocks stopPropagation)
                          const trackRect=e.currentTarget.getBoundingClientRect();
                          const x=e.clientX-trackRect.left;
                          const snapped=Math.max(INS_START,Math.min(INS_END,Math.round((x/trackRect.width*INS_RANGE+INS_START)/15)*15));
                          insNewDragRef.current={room:room.name,dayIdx:clampedInsightDayIdx,anchor:snapped,trackRect};
                          setInsNewPreview({room:room.name,startMins:snapped,endMins:Math.min(snapped+60,INS_END)});
                        }}>
                        {/* Hour grid lines */}
                        {hours.map(h=>{
                          const pct=(h*60-INS_START)/INS_RANGE*100;
                          if(pct<0||pct>100) return null;
                          return <div key={h} style={{position:"absolute",left:`${pct}%`,top:0,bottom:0,borderLeft:`1px solid ${h%6===0?"#CBD5E1":"#EEF2F7"}`,pointerEvents:"none"}}/>;
                        })}
                        {roomBlocks.length===0&&(
                          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                            <span style={{fontSize:10,color:"#CBD5E1",fontWeight:600}}>No staff scheduled</span>
                          </div>
                        )}

                        {/* Drag tooltip — only for the room where drag is active */}
                        {insDragTooltip&&insDragRef.current?.roomName===room.name&&(()=>{
                          const cx=Math.max(5,Math.min(95,insDragTooltip.pct));
                          return(
                            <div style={{position:"absolute",left:`${cx}%`,top:-28,transform:"translateX(-50%)",background:"#1E293B",color:"white",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,whiteSpace:"nowrap",pointerEvents:"none",zIndex:20}}>
                              {insDragTooltip.label}
                            </div>
                          );
                        })()}

                        {/* Lunch gap "Add relief" zones */}
                        {(lunchGapMap[room.name]||[]).map((gap,gi)=>{
                          const gLeft=Math.max(0,(gap.gapStartMins-INS_START)/INS_RANGE*100);
                          const gWidth=Math.max(0.5,(gap.gapEndMins-gap.gapStartMins)/INS_RANGE*100);
                          const gTop=BLOCK_PAD+gap.lane*(BLOCK_H+BLOCK_PAD);
                          return(
                            <div key={gi}
                              onMouseDown={e=>e.stopPropagation()}
                              onClick={e=>{ e.stopPropagation(); openEdit(gap.staffId,clampedInsightDayIdx); }}
                              title={gap.isNa?`${gap.name.split(" ")[0]}'s lunch — no coverage needed`:gap.hasRelief?`${gap.name.split(" ")[0]}'s lunch — relief assigned`:`Click to assign relief for ${gap.name.split(" ")[0]}'s lunch`}
                              style={{position:"absolute",left:`${gLeft}%`,width:`${gWidth}%`,top:gTop,height:BLOCK_H,
                                border:`2px dashed ${gap.isNa?"#94A3B8":gap.hasRelief?"#86EFAC":"#FCD34D"}`,borderRadius:7,
                                background:gap.isNa?"rgba(148,163,184,0.08)":gap.hasRelief?"rgba(134,239,172,0.08)":"rgba(252,211,77,0.12)",
                                boxSizing:"border-box",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4,
                                zIndex:1}}>
                              {!gap.hasRelief&&!gap.isNa&&<span style={{fontSize:9,fontWeight:800,color:"#92400E",background:"#FEF9C3",padding:"1px 5px",borderRadius:4,whiteSpace:"nowrap"}}>+ Add relief</span>}
                              {gap.hasRelief&&<span style={{fontSize:9,fontWeight:800,color:"#166534",background:"#DCFCE7",padding:"1px 5px",borderRadius:4,whiteSpace:"nowrap"}}>✓ Covered</span>}
                              {gap.isNa&&<span style={{fontSize:9,fontWeight:800,color:"#475569",background:"#F1F5F9",padding:"1px 5px",borderRadius:4,whiteSpace:"nowrap"}}>N/C</span>}
                            </div>
                          );
                        })}

                        {/* New block drawing preview */}
                        {insNewPreview?.room===room.name&&(()=>{
                          const pl=Math.max(0,(insNewPreview.startMins-INS_START)/INS_RANGE*100);
                          const pw=Math.max(0.5,(insNewPreview.endMins-insNewPreview.startMins)/INS_RANGE*100);
                          return(
                            <div style={{position:"absolute",left:`${pl}%`,width:`${pw}%`,top:BLOCK_PAD,height:rowH-BLOCK_PAD*2,
                              background:"rgba(99,102,241,0.12)",border:"2px dashed #6366F1",borderRadius:7,boxSizing:"border-box",
                              pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:4,zIndex:5}}>
                              <span style={{fontSize:9,fontWeight:800,color:"#4F46E5",whiteSpace:"nowrap"}}>
                                {minsToTime(insNewPreview.startMins).replace(":00","").replace(" ","").toLowerCase()} – {minsToTime(insNewPreview.endMins).replace(":00","").replace(" ","").toLowerCase()}
                              </span>
                            </div>
                          );
                        })()}

                        {/* Staff blocks */}
                        {roomBlocks.map((rb,rbi)=>{
                          const isDragging=rb.blockId!=null&&insDragPreview?.blockId===rb.blockId;
                          const dispStart=isDragging?minsToTime(insDragPreview.startMins):rb.startTime;
                          const dispEnd=isDragging?minsToTime(insDragPreview.endMins):rb.endTime;
                          const rs=isDragging?insDragPreview.startMins:timeToMins(rb.startTime);
                          const re=isDragging?insDragPreview.endMins:timeToMins(rb.endTime);
                          const left=Math.max(0,(rs-INS_START)/INS_RANGE*100);
                          const width=Math.max(0.5,(re-rs)/INS_RANGE*100);
                          const top=BLOCK_PAD+rb.lane*(BLOCK_H+BLOCK_PAD);
                          const bc=rb.isRelief?RELIEF_COLOR:c;
                          return(
                            <div key={rbi}
                              style={{position:"absolute",left:`${left}%`,width:`${width}%`,top,height:BLOCK_H,
                                background:bc.bg,border:`2px solid ${bc.border}`,borderRadius:7,
                                display:"flex",alignItems:"center",gap:0,overflow:"hidden",
                                boxSizing:"border-box",cursor:"grab",zIndex:isDragging?10:2,
                                opacity:isDragging?0.85:1,
                                boxShadow:isDragging?"0 4px 16px rgba(0,0,0,0.18)":"none"}}
                              onMouseDown={e=>{
                                if(e.button!==0)return;
                                e.preventDefault();
                                e.stopPropagation();
                                const trackEl=e.currentTarget.parentElement;
                                const trackRect=trackEl.getBoundingClientRect();
                                const x=e.clientX-trackRect.left;
                                const bL=(timeToMins(rb.startTime)-INS_START)/INS_RANGE*trackRect.width;
                                const bR=(timeToMins(rb.endTime)-INS_START)/INS_RANGE*trackRect.width;
                                const EDGE=10;
                                const type=x<=bL+EDGE?'resize-s':x>=bR-EDGE?'resize-e':'move';
                                const snapped=Math.max(INS_START,Math.min(INS_END,Math.round((x/trackRect.width*INS_RANGE+INS_START)/15)*15));
                                insDragRef.current={type,staffId:rb.staffId,dayIdx:clampedInsightDayIdx,blockId:rb.blockId,
                                  roomName:room.name,origStart:timeToMins(rb.startTime),origEnd:timeToMins(rb.endTime),anchor:snapped,trackRect};
                              }}
                              onClick={e=>{
                                // Only fire click if no drag happened
                                if(insDragPreview) return;
                                e.stopPropagation();
                                // Relief blocks always open the lunch owner's edit, not the coverer's —
                                // this prevents users accidentally editing Shirley's row when they mean Venus
                                const editTargetId = rb.isRelief && rb.reliefFor ? rb.reliefFor : rb.staffId;
                                setShowInsights(true); openEdit(editTargetId,clampedInsightDayIdx);
                              }}>
                              {/* Left resize handle */}
                              <div style={{width:8,height:"100%",cursor:"ew-resize",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",opacity:0.4}}>
                                <div style={{width:2,height:12,background:bc.border,borderRadius:1}}/>
                              </div>
                              {/* Content */}
                              <div style={{flex:1,display:"flex",alignItems:"center",gap:4,overflow:"hidden",padding:"0 2px",minWidth:0}}>
                                <div style={{width:18,height:18,borderRadius:"50%",background:bc.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:"white",flexShrink:0}}>{initials(rb.name)}</div>
                                <div style={{overflow:"hidden",minWidth:0,flex:1}}>
                                  <div style={{fontSize:10,fontWeight:800,color:bc.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                    {rb.name.split(" ")[0]}{rb.isRelief?<span style={{fontSize:8,opacity:0.8}}> ↔</span>:null}
                                  </div>
                                  <div style={{fontSize:8,color:"#94A3B8",whiteSpace:"nowrap"}}>
                                    {dispStart.replace(":00","").replace(" ","").toLowerCase()}–{dispEnd.replace(":00","").replace(" ","").toLowerCase()}
                                  </div>
                                </div>
                              </div>
                              {/* Right resize handle */}
                              <div style={{width:8,height:"100%",cursor:"ew-resize",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",opacity:0.4}}>
                                <div style={{width:2,height:12,background:bc.border,borderRadius:1}}/>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ):(
                      <div style={{flex:1,height:36,background:"#F8FAFC",borderRadius:10,border:"1.5px dashed #E2E8F0",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:10,color:"#CBD5E1",fontWeight:600}}>Hidden — click 👁 on the room label to show</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Show all button if any hidden */}
              {hiddenRooms.size>0&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #F1F5F9"}}>
                  <button onClick={()=>setInsightRoomFilter(null)} style={{fontSize:11,fontWeight:700,color:"#6D28D9",background:"#F5F3FF",border:"1.5px solid #DDD6FE",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontFamily:"inherit"}}>
                    👁 Show all hidden rooms ({hiddenRooms.size})
                  </button>
                </div>
              )}
            </div>
            </div>{/* end white card */}
          </div>
        );
      })()}

      {/* ── INSIGHTS NEW BLOCK POPOVER ── */}
      {insNewPopover&&(()=>{
        const pop=insNewPopover;
        const closePopover=()=>{ setInsNewPopover(null); setInsNewPreview(null); };
        const roomObj=rooms.find(r=>r.name===pop.room);
        const c=roomObj?COLOR_PALETTE[roomObj.colorIdx%COLOR_PALETTE.length]:{bg:"#F8FAFC",border:"#CBD5E1",text:"#475569"};

        // Who is in this room during this time window? (for relief detection)
        const coveredStaff = staff.filter(s=>{
          if(String(s.id)===String(pop.staffId)) return false;
          return (getCellData(s.id,pop.dayIdx)?.blocks||[]).some(b=>
            b.room===pop.room&&b.startTime&&b.endTime&&
            timeToMins(b.startTime)<=pop.startMins&&timeToMins(b.endTime)>=pop.endMins&&!b.reliefFor
          );
        });
        // Also find who has a Lunch/Break block overlapping this window (primary relief target)
        const lunchOwner = staff.find(s=>{
          if(String(s.id)===String(pop.staffId)) return false;
          return (getCellData(s.id,pop.dayIdx)?.blocks||[]).some(b=>
            IS_LUNCH_ROOM(b.room||'')&&b.startTime&&b.endTime&&
            timeToMins(b.startTime)<=pop.startMins+15&&timeToMins(b.endTime)>=pop.endMins-15
          );
        }) || coveredStaff[0];

        const saveInsBlock=()=>{
          if(!pop.staffId) return;
          const key=`${wiso}|${pop.staffId}|${pop.dayIdx}`;
          const ns={...schedule};
          const existing=ns[key]?.blocks||[];
          let nb;
          if(pop.isRelief&&lunchOwner){
            // Create as a relief block — reliefFor is set, which reconcileReliefs will link
            nb={...newBlock(minsToTime(pop.startMins),minsToTime(pop.endMins),pop.room),
              reliefFor:lunchOwner.id,
              reliefNote:`Relief for ${lunchOwner.name}`,
              reliefBlockId:`r${Date.now()}${Math.random()}`};
          } else {
            nb={...newBlock(minsToTime(pop.startMins),minsToTime(pop.endMins),pop.room)};
          }
          ns[key]={blocks:sortBlocks([...existing,nb])};
          setSchedule(reconcileReliefs(ns));
          closePopover();
        };

        const PW=310, PH=pop.isRelief?350:300;
        const left=Math.min(pop.mouseX-PW/2, window.innerWidth-PW-12);
        const top=Math.min(pop.mouseY+12, window.innerHeight-PH-12);
        return(
          <>
            <div style={{position:"fixed",inset:0,zIndex:3000}} onClick={closePopover}/>
            <div style={{position:"fixed",left:Math.max(8,left),top:Math.max(8,top),width:PW,zIndex:3001,
              background:"white",borderRadius:16,boxShadow:"0 12px 40px rgba(0,0,0,0.22)",overflow:"hidden"}}>
              {/* Header */}
              <div style={{background:`linear-gradient(135deg,${c.border},${c.border}cc)`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{color:"white",fontWeight:900,fontSize:13}}>{pop.isRelief?"🔄 Relief block":"New block"} — {pop.room}</div>
                  <div style={{color:"rgba(255,255,255,0.8)",fontSize:11,marginTop:1}}>{DAY_SHORT[pop.dayIdx]} {formatDate(weekDates[pop.dayIdx])} · {minsToTime(pop.startMins).replace(":00","").toLowerCase()} – {minsToTime(pop.endMins).replace(":00","").toLowerCase()}</div>
                </div>
                <button onClick={closePopover}
                  style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:7,width:26,height:26,cursor:"pointer",fontSize:14,color:"white",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
              <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>

                {/* Relief toggle */}
                <div onClick={()=>setInsNewPopover(p=>({...p,isRelief:!p.isRelief}))}
                  style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:9,
                    border:`2px solid ${pop.isRelief?"#FCD34D":"#E2E8F0"}`,
                    background:pop.isRelief?"#FFFBEB":"#F8FAFC",cursor:"pointer"}}>
                  <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${pop.isRelief?"#F59E0B":"#CBD5E1"}`,
                    background:pop.isRelief?"#F59E0B":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {pop.isRelief&&<span style={{color:"white",fontSize:11,fontWeight:900,lineHeight:1}}>✓</span>}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:800,color:pop.isRelief?"#92400E":"#475569"}}>This is a relief/lunch cover block</div>
                    {pop.isRelief&&lunchOwner&&(
                      <div style={{fontSize:10,color:"#92400E",marginTop:1}}>Covering: <strong>{lunchOwner.name}</strong></div>
                    )}
                    {pop.isRelief&&!lunchOwner&&(
                      <div style={{fontSize:10,color:"#94A3B8",marginTop:1}}>No staff found in this room at this time</div>
                    )}
                  </div>
                </div>

                {/* Staff picker */}
                <div>
                  <label style={{fontSize:10,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",display:"block",marginBottom:4}}>STAFF MEMBER</label>
                  <select value={pop.staffId} onChange={e=>setInsNewPopover(p=>({...p,staffId:e.target.value}))}
                    style={{width:"100%",padding:"8px 10px",borderRadius:9,border:`2px solid ${pop.staffId?c.border:"#E2E8F0"}`,fontSize:13,fontWeight:700,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:pop.staffId?"#1E293B":"#94A3B8"}}>
                    <option value="">— Select staff member —</option>
                    {staff.map(s=>{
                      const conflict=(getCellData(s.id,pop.dayIdx)?.blocks||[]).some(b=>
                        b.startTime&&b.endTime&&!HOURS_EXCLUDED_ROOMS.has(b.room)&&!b.reliefFor&&
                        timeToMins(b.startTime)<pop.endMins&&timeToMins(b.endTime)>pop.startMins&&b.room!==pop.room
                      );
                      return <option key={s.id} value={s.id} disabled={conflict}>{s.name}{conflict?" — busy":""}</option>;
                    })}
                  </select>
                </div>

                {/* Time selects */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div>
                    <label style={{fontSize:10,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",display:"block",marginBottom:4}}>START</label>
                    <select value={minsToTime(pop.startMins)} onChange={e=>setInsNewPopover(p=>({...p,startMins:timeToMins(e.target.value)}))}
                      style={{width:"100%",padding:"7px 8px",borderRadius:8,border:"2px solid #E2E8F0",fontSize:12,fontWeight:600,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:"#334155"}}>
                      {TIMES.filter(t=>timeToMins(t)<pop.endMins).map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",display:"block",marginBottom:4}}>END</label>
                    <select value={minsToTime(pop.endMins)} onChange={e=>setInsNewPopover(p=>({...p,endMins:timeToMins(e.target.value)}))}
                      style={{width:"100%",padding:"7px 8px",borderRadius:8,border:"2px solid #E2E8F0",fontSize:12,fontWeight:600,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:"#334155"}}>
                      {TIMES.filter(t=>timeToMins(t)>pop.startMins).map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Relief coverage summary */}
                {pop.isRelief&&pop.staffId&&lunchOwner&&(
                  <div style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:8,padding:"7px 10px",fontSize:10,fontWeight:700,color:"#92400E"}}>
                    ✅ On save: <strong>{staff.find(s=>String(s.id)===String(pop.staffId))?.name?.split(" ")[0]}</strong> covers <strong>{lunchOwner.name.split(" ")[0]}</strong>'s lunch from {minsToTime(pop.startMins).replace(":00","").toLowerCase()} – {minsToTime(pop.endMins).replace(":00","").toLowerCase()}. Their schedules will link automatically.
                  </div>
                )}

                {/* Actions */}
                <div style={{display:"flex",gap:8,marginTop:2}}>
                  <button onClick={closePopover}
                    style={{flex:1,padding:"9px 0",borderRadius:10,border:"2px solid #E2E8F0",background:"white",color:"#475569",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                  <button onClick={saveInsBlock} disabled={!pop.staffId}
                    style={{flex:2,padding:"9px 0",borderRadius:10,border:"none",
                      background:pop.staffId?`linear-gradient(135deg,${c.border},${c.border}aa)`:"#E2E8F0",
                      color:pop.staffId?"white":"#94A3B8",fontWeight:800,fontSize:13,
                      cursor:pop.staffId?"pointer":"default",fontFamily:"inherit"}}>
                    ✓ Add to Schedule
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── SCHEDULE TABLE ── */}
      {!showInsights&&<div style={{padding:"20px 28px",overflowX:"auto"}}>
        <div style={{background:"white",borderRadius:18,boxShadow:"0 2px 20px rgba(0,0,0,0.07)",overflow:"hidden",minWidth:680}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                <th style={{background:"#1E3A8A",padding:"15px 12px",textAlign:"left",color:"white",fontSize:12,fontWeight:800,letterSpacing:"0.5px",width:150,borderRight:"1px solid rgba(255,255,255,0.1)"}}>STAFF MEMBER</th>
                {weekDates.map((date,i)=>{ const isToday=date.toDateString()===new Date().toDateString(); return(
                  <th key={i} style={{background:isToday?"#16307a":"#1E3A8A",padding:"15px 6px",textAlign:"center",color:"white",fontSize:12,fontWeight:800,minWidth:80,borderRight:i<6?"1px solid rgba(255,255,255,0.08)":"none",position:"relative"}}>
                    {isToday&&<div style={{position:"absolute",top:6,right:8,background:"#95D5B2",color:"#1B4332",fontSize:9,fontWeight:900,padding:"1px 6px",borderRadius:8}}>TODAY</div>}
                    <div style={{fontSize:13,fontWeight:900}}>{DAY_SHORT[i]}</div>
                    <div style={{fontSize:11,opacity:0.72,marginTop:2,fontWeight:500}}>{formatDate(date)}</div>
                  </th>
                ); })}
                <th style={{background:"#1E3A8A",padding:"15px 8px",textAlign:"center",color:"white",fontSize:10,fontWeight:800,width:64,letterSpacing:"0.3px",borderLeft:"1px solid rgba(255,255,255,0.12)"}}>WEEK<br/>HRS</th>
              </tr>

            </thead>
            <tbody>
              {staff.map((s,si)=>{
                const wkMins=staffWeekMins(s.id);
                return(
                  <tr key={s.id} style={{borderBottom:"1px solid #E8F3E8",background:si%2===0?"white":"#FAFDF9"}}>
                    <td style={{padding:"10px 14px",borderRight:"2px solid #E8F3E8",background:si%2===0?"white":"#FAFDF9",verticalAlign:"middle"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          <button onClick={()=>setStaff(a=>{const n=[...a];[n[si-1],n[si]]=[n[si],n[si-1]];return n;})} disabled={si===0} style={{background:"#F1F5F9",border:"none",borderRadius:5,width:20,height:20,cursor:si===0?"default":"pointer",fontSize:11,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center",opacity:si===0?0.3:1,flexShrink:0}}>▲</button>
                          <button onClick={()=>setStaff(a=>{const n=[...a];[n[si],n[si+1]]=[n[si+1],n[si]];return n;})} disabled={si===staff.length-1} style={{background:"#F1F5F9",border:"none",borderRadius:5,width:20,height:20,cursor:si===staff.length-1?"default":"pointer",fontSize:11,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center",opacity:si===staff.length-1?0.3:1,flexShrink:0}}>▼</button>
                        </div>
                        <div style={{width:34,height:34,borderRadius:"50%",background:getAvatarColor(si),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"white",flexShrink:0,boxShadow:"0 2px 6px rgba(0,0,0,0.15)"}}>{initials(s.name)}</div>
                        <div style={{flex:1,minWidth:0}}>
                          {editingStaffId===s.id?(
                            <input autoFocus value={editingStaffName} onChange={e=>setEditingStaffName(e.target.value)} onBlur={saveStaffName} onKeyDown={e=>{if(e.key==="Enter")saveStaffName();if(e.key==="Escape")setEditingStaffId(null);}} style={{fontSize:12,fontWeight:700,color:"#1E293B",border:"2px solid #40916C",borderRadius:7,padding:"2px 7px",outline:"none",width:"100%",fontFamily:"inherit",background:"#F0FDF4"}}/>
                          ):(
                            <div title="Click to edit name" onClick={()=>startEditStaff(s)} style={{fontSize:12,fontWeight:700,color:"#1E293B",cursor:"text",borderBottom:"1.5px dashed #B7D8B7",paddingBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                          )}
                          <div style={{display:"flex",gap:4,marginTop:5}}>
                            <button onClick={e=>{e.stopPropagation();setShowStaffInfo(s);}} title="View/edit staff info & calendar" style={{background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:800,color:"#1E3A8A",cursor:"pointer",fontFamily:"inherit"}}>✉️</button>
                            <button onClick={e=>handleStaffPrint(s,e)} style={{background:"#F0F7F4",border:"1px solid #D0E8D0",borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:800,color:"#2D6A4F",cursor:"pointer",fontFamily:"inherit"}}>🖨️</button>
                            <button onClick={()=>{ const t=new Date(); const d=t.getDay(); const todayIdx=d===0?6:d-1; setSickModal({staffId:s.id,dayIdx:todayIdx}); }} title="Mark sick — generates cover suggestions for today" style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:800,color:"#C2410C",cursor:"pointer",fontFamily:"inherit"}}>🤒 Sick</button>
                            <button onClick={()=>setConfirmDelete({type:"staff",id:s.id,name:s.name})} style={{background:"#FFF5F5",border:"1px solid #FEE2E2",borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:800,color:"#EF4444",cursor:"pointer",fontFamily:"inherit"}}>× Remove</button>
                          </div>
                        </div>
                      </div>
                    </td>

                    {weekDates.map((_,dayIdx)=>{
                      const cell=getCellData(s.id,dayIdx),blocks=cell?.blocks||[],mins=staffDayMins(s.id,dayIdx);
                      return(
                        <td key={dayIdx} style={{padding:"5px 4px",verticalAlign:"top",borderRight:dayIdx<6?"1px solid #F0F7F0":"none"}}>
                          <div style={{position:"relative"}}
                            onMouseEnter={e=>{const a=e.currentTarget.querySelector(".ca");if(a)a.style.opacity="1";}}
                            onMouseLeave={e=>{const a=e.currentTarget.querySelector(".ca");if(a)a.style.opacity="0";}}>
                            <div className="ca" style={{position:"absolute",top:4,right:4,display:"flex",gap:2,zIndex:10,opacity:0,transition:"opacity 0.15s"}}>
                              {blocks.length>0&&<button onClick={e=>copyDay(s.id,dayIdx,e)} title="Copy shift" style={{background:"#1B4332",border:"none",borderRadius:5,width:20,height:20,cursor:"pointer",fontSize:9,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>📋</button>}
                              {clipboard&&<button onClick={e=>pasteDay(s.id,dayIdx,e)} title="Paste here" style={{background:"#1565C0",border:"none",borderRadius:5,width:20,height:20,cursor:"pointer",fontSize:9,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>📌</button>}
                            </div>
                            <div onClick={()=>{if(clipboard)pasteDay(s.id,dayIdx,null);else openEdit(s.id,dayIdx);}}
                              style={{minHeight:78,borderRadius:10,cursor:"pointer",border:clipboard?"2px dashed #1565C0":blocks.length?"2px solid #D8EDD5":"2px dashed #D1E8D1",background:clipboard?"#EFF6FF":blocks.length?"#FAFDF9":"transparent",padding:blocks.length?"5px":"0",display:"flex",flexDirection:"column",gap:3,justifyContent:blocks.length?"flex-start":"center",alignItems:blocks.length?"stretch":"center",transition:"all 0.12s"}}
                              onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 3px 12px rgba(0,0,0,0.1)";e.currentTarget.style.borderColor=clipboard?"#1565C0":"#40916C";}}
                              onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=clipboard?"#1565C0":blocks.length?"#D8EDD5":"#D1E8D1";}}>
                              {blocks.length?(
                                <>
                                  {blocks.map(b=>{ const c=rc(b.room); 
                                    // Exclude N/C sentinels (__nc__ and legacy __na__) from coverage display
                                    const reliefCoverage=(b.reliefs||[]).filter(r=>r.staffId&&r.startTime&&r.endTime&&!isNCSentinel(r.staffId));
                                    // Find what room this relief staff is covering from (for relief blocks)
                                    return(
                                    <div key={b.id} style={{background:c.bg,border:`1.5px solid ${c.border}`,borderRadius:7,padding:"4px 7px"}}>
                                      <div style={{fontSize:11,fontWeight:800,color:c.text}}>{b.room||<span style={{color:"#94A3B8",fontStyle:"italic"}}>No room</span>}</div>
                                      {b.reliefNote&&<div style={{fontSize:9.5,fontWeight:700,color:"#92400E",background:"#FEF9C3",borderRadius:4,padding:"1px 5px",marginTop:2}}>{b.reliefNote}</div>}
                                      <div style={{fontSize:10,color:"#64748B",fontWeight:600}}>{b.startTime} – {b.endTime}</div>
                                      {reliefCoverage.length>0&&(
                                        <div style={{marginTop:4,display:"flex",flexDirection:"column",gap:2}}>
                                          {reliefCoverage.map(r=>{
                                            const rSid=String(r.staffId);
                                            const rMember=staff.find(st=>String(st.id)===rSid);
                                            const rName=rMember?.name||"Unknown";
                                            const rBlocks=rMember?getCellData(rMember.id,dayIdx)?.blocks||[]:[];
                                            const rStart=timeToMins(r.startTime);
                                            const rEnd=timeToMins(r.endTime);
                                            // Find the room the relief staff is covering from — check active room during relief window, then nearest before it
                                            const regularBlks=rBlocks.filter(rb=>rb.room&&!rb.reliefFor&&rb.room!=="Relief"&&!HOURS_EXCLUDED_ROOMS.has(rb.room)&&rb.startTime&&rb.endTime);
                                            const currentRoom=regularBlks.find(rb=>timeToMins(rb.startTime)<rEnd&&timeToMins(rb.endTime)>rStart)
                                              ||regularBlks.sort((a,bb)=>timeToMins(bb.endTime)-timeToMins(a.endTime)).find(rb=>timeToMins(rb.endTime)<=rStart+30);
                                            return(
                                              <div key={r.id} style={{background:"#FEF9C3",border:"1px solid #FCD34D",borderRadius:4,padding:"2px 5px",display:"flex",flexWrap:"wrap",alignItems:"center",gap:4}}>
                                                <span style={{fontSize:9,fontWeight:900,color:"#92400E"}}>→</span>
                                                <span style={{fontSize:9.5,fontWeight:800,color:"#78350F"}}>{rName}</span>
                                                <span style={{fontSize:9,fontWeight:600,color:"#92400E",opacity:0.8}}>{r.startTime}–{r.endTime}</span>
                                                {currentRoom
                                                  ?<span style={{fontSize:9,fontWeight:700,color:"#1B4332",background:"#D1FAE5",borderRadius:3,padding:"0 4px"}}>📍 from {currentRoom.room}</span>
                                                  :<span style={{fontSize:9,fontWeight:600,color:"#6B7280",fontStyle:"italic"}}>no active room</span>
                                                }
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ); })}
                                  {mins>0&&<div style={{textAlign:"right",fontSize:9.5,color:"#94A3B8",fontWeight:700,paddingRight:3}}>{fmtHours(mins)}</div>}
                                </>
                              ):clipboard?(
                                <span style={{fontSize:11,color:"#1565C0",fontWeight:800}}>📌 Paste here</span>
                              ):(
                                <span style={{fontSize:22,color:"#B7D8B7",fontWeight:300}}>+</span>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}

                    <td style={{textAlign:"center",verticalAlign:"middle",padding:"8px 6px",borderLeft:"2px solid #E8F3E8",background:si%2===0?"#F8FCF9":"#F3FAF4"}}>
                      <div style={{fontSize:13,fontWeight:900,color:wkMins>0?"#1E3A8A":"#CBD5E1"}}>{fmtHours(wkMins)}</div>
                    </td>
                  </tr>
                );
              })}
              {staff.length===0&&(
                <tr><td colSpan={weekDates.length+2} style={{padding:"48px 24px",textAlign:"center",color:"#94A3B8",fontSize:14}}>
                  <div style={{fontSize:32,marginBottom:8}}>👶</div>No staff at this location yet. Click <strong>"+ Add Staff"</strong> to get started.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{textAlign:"center",marginTop:14,fontSize:11.5,color:"#94A3B8",fontWeight:500}}>
          Click any cell to build a shift · Hover a filled cell to copy · Click a name to edit it
        </div>
      </div>}

      {/* ══════════════════════ MODALS ══════════════════════════════════════════ */}

      {/* ── MANAGE LOCATIONS MODAL ── */}
      {showManageLocs&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,15,30,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={e=>e.target===e.currentTarget&&setShowManageLocs(false)}>
          <div style={{background:"white",borderRadius:22,padding:28,width:480,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.3)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:900,fontSize:22,color:"#1E293B"}}>📍 Manage Locations</div>
              <button onClick={()=>setShowManageLocs(false)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:20}}>Each location has its own staff, rooms, schedules and templates. Click a name to rename it.</div>

            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
              {locations.map(l=>{
                const lc=LOC_COLORS[l.colorIdx%LOC_COLORS.length];
                const isActive=l.id===activeLocId;
                return(
                  <div key={l.id} style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",background:isActive?`${lc}15`:"#F8FAFC",border:`2px solid ${isActive?lc:"#E2E8F0"}`,borderRadius:14}}>
                    <div style={{width:14,height:14,borderRadius:"50%",background:lc,flexShrink:0}}/>
                    {editingLocId===l.id?(
                      <input autoFocus value={editingLocName} onChange={e=>setEditingLocName(e.target.value)} onBlur={saveLocName} onKeyDown={e=>{if(e.key==="Enter")saveLocName();if(e.key==="Escape")setEditingLocId(null);}} style={{flex:1,fontSize:14,fontWeight:700,color:"#1E293B",border:`2px solid ${lc}`,borderRadius:8,padding:"5px 10px",outline:"none",fontFamily:"inherit",background:"white"}}/>
                    ):(
                      <span onClick={()=>startEditLoc(l)} style={{flex:1,fontSize:14,fontWeight:700,color:"#1E293B",cursor:"text",borderBottom:"1.5px dashed #CBD5E1",paddingBottom:1}}>{l.name}</span>
                    )}
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {isActive&&<span style={{fontSize:10,fontWeight:800,color:lc,background:`${lc}20`,padding:"2px 8px",borderRadius:8}}>ACTIVE</span>}
                      {!isActive&&<button onClick={()=>{switchLocation(l.id);setShowManageLocs(false);}} style={{background:lc,color:"white",border:"none",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Switch</button>}
                      <span style={{fontSize:10.5,color:"#94A3B8",fontStyle:"italic"}}>click name to rename</span>
                      <button onClick={()=>setConfirmDelete({type:"location",id:l.id,name:l.name})} style={{background:"none",border:"none",color:"#CBD5E1",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 2px"}} onMouseEnter={e=>e.currentTarget.style.color="#EF4444"} onMouseLeave={e=>e.currentTarget.style.color="#CBD5E1"}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{borderTop:"1.5px solid #E8F3E8",paddingTop:18}}>
              <div style={{fontSize:11,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",marginBottom:8}}>ADD NEW LOCATION</div>
              <div style={{display:"flex",gap:8}}>
                <input value={newLocName} onChange={e=>setNewLocName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addLocation()} placeholder="e.g. Downtown, Westside, Location 2…" style={{flex:1,padding:"11px 13px",borderRadius:11,border:"2px solid #E2E8F0",fontSize:14,outline:"none",fontFamily:"inherit",fontWeight:600,color:"#1E293B"}}/>
                <button onClick={addLocation} style={{padding:"11px 18px",borderRadius:11,border:"none",background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Add</button>
              </div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:8}}>New locations start with default rooms. Staff and schedules are fully independent per location.</div>
            </div>
            <button onClick={()=>setShowManageLocs(false)} style={{marginTop:18,width:"100%",padding:13,borderRadius:12,border:"none",background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Done ✓</button>
          </div>
        </div>
      )}

      {/* ── EDIT SHIFT MODAL ── */}
      {editCell&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,30,20,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={e=>e.target===e.currentTarget&&setEditCell(null)}>
          <div style={{background:"white",borderRadius:22,padding:28,width:520,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.28)",maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
              <div>
                <div style={{fontWeight:900,fontSize:13,color:"#94A3B8",letterSpacing:"0.3px",textTransform:"uppercase"}}>Edit Shift</div>
                <div style={{fontSize:20,color:"#1E293B",marginTop:2,fontWeight:800}}>{staff.find(s=>s.id===editCell.sId)?.name} &nbsp;·&nbsp; {formatDateLong(weekDates[editCell.dayIdx])}</div>
              </div>
              <button onClick={()=>setEditCell(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
            </div>

            {reliefOverlapError&&<div style={{background:"#FEE2E2",border:"1.5px solid #EF4444",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>🚫</span>
              <span style={{fontSize:13,fontWeight:700,color:"#991B1B"}}>This block overlaps a relief commitment ({reliefOverlapError.reliefNote}, {reliefOverlapError.startTime}–{reliefOverlapError.endTime}). Adjust or remove the conflicting block to save.</span>
            </div>}
            {overlapWarn&&<div style={{background:"#FFF3CD",border:"1.5px solid #FFB300",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>⚠️</span>
              <span style={{fontSize:13,fontWeight:700,color:"#856404"}}>Two or more blocks overlap — please check your start and end times.</span>
            </div>}

            <div style={{marginBottom:14,background:"#F8FAFC",borderRadius:12,padding:"12px 14px 10px",border:"1.5px solid #E2E8F0",userSelect:"none"}}>
              <div style={{fontSize:9.5,fontWeight:800,color:"#94A3B8",letterSpacing:"0.6px",marginBottom:8}}>DRAG EMPTY SPACE TO CREATE &nbsp;·&nbsp; DRAG BODY TO MOVE &nbsp;·&nbsp; DRAG EDGES TO RESIZE</div>
              <div onMouseMove={e=>tlHandlerRef.current.move?.(e)} onMouseUp={()=>tlHandlerRef.current.up?.()} onMouseLeave={()=>tlHandlerRef.current.up?.()} style={{position:"relative"}}>
                <div ref={tlRef} onMouseDown={onTlMouseDown}
                  style={{position:"relative",height:56,borderRadius:10,background:"white",border:"1.5px solid #E2E8F0",cursor:"crosshair",overflow:"visible"}}>
                  {[6,7,8,9,10,11,12,13,14,15,16,17,18].map(h=>{
                    const pct=(h*60-TL_START)/TL_RANGE*100;
                    if(pct<0||pct>100)return null;
                    return <div key={h} style={{position:"absolute",left:`${pct}%`,top:0,bottom:0,borderLeft:`1px solid ${h%6===0?"#CBD5E1":"#F1F5F9"}`,pointerEvents:"none"}}/>;
                  })}
                  {editBlocks.map(b=>{
                    const prev=tlPreview&&!tlPreview.isNew&&tlPreview.id===b.id?tlPreview:null;
                    const st=prev?.startTime||b.startTime, et=prev?.endTime||b.endTime;
                    if(!st||!et)return null;
                    const ls=timeToMins(st),le=timeToMins(et);
                    const left=(ls-TL_START)/TL_RANGE*100, width=(le-ls)/TL_RANGE*100;
                    const cv=rc(b.room);
                    return(
                      <div key={b.id} style={{position:"absolute",top:4,height:48,left:`${Math.max(0,left)}%`,width:`${Math.max(0.5,width)}%`,background:cv.bg,border:`2px solid ${cv.border}`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:2,overflow:"hidden"}}>
                        <div style={{position:"absolute",left:0,top:0,width:8,height:"100%",background:`${cv.border}55`,borderRadius:"5px 0 0 5px"}}/>
                        <span style={{fontSize:9,fontWeight:800,color:cv.text,padding:"0 12px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.room||"?"}</span>
                        <div style={{position:"absolute",right:0,top:0,width:8,height:"100%",background:`${cv.border}55`,borderRadius:"0 5px 5px 0"}}/>
                      </div>
                    );
                  })}
                  {tlPreview?.isNew&&(()=>{
                    const ls=timeToMins(tlPreview.startTime),le=timeToMins(tlPreview.endTime);
                    const left=(ls-TL_START)/TL_RANGE*100, width=(le-ls)/TL_RANGE*100;
                    return <div style={{position:"absolute",top:4,height:48,left:`${Math.max(0,left)}%`,width:`${Math.max(0.5,width)}%`,background:"#DCFCE7",border:"2px dashed #40916C",borderRadius:7,pointerEvents:"none",zIndex:3,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:9,fontWeight:800,color:"#2D6A4F"}}>New</span>
                    </div>;
                  })()}
                  {tlTooltip?.label&&(()=>{
                    const TIPW=170;
                    const trackW=tlRef.current?.getBoundingClientRect()?.width||500;
                    const cx=Math.max(TIPW/2+4,Math.min(trackW-TIPW/2-4,tlTooltip.x));
                    const TC={'new':{bg:"#1B4332",accent:"#86EFAC",lbl:"NEW"},'move':{bg:"#1E3A8A",accent:"#93C5FD",lbl:"MOVE"},'resize-s':{bg:"#7C2D12",accent:"#FCA5A5",lbl:"START"},'resize-e':{bg:"#7C2D12",accent:"#FCA5A5",lbl:"END"}};
                    const tc=TC[tlTooltip.type]||TC['move'];
                    return(
                      <div style={{position:"absolute",left:cx,top:-50,transform:"translateX(-50%)",background:tc.bg,color:"white",padding:"6px 12px",borderRadius:9,whiteSpace:"nowrap",pointerEvents:"none",zIndex:30,boxShadow:"0 6px 20px rgba(0,0,0,0.28)",display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700}}>
                        <span style={{fontSize:9,fontWeight:900,color:tc.accent,letterSpacing:"0.5px",background:"rgba(255,255,255,0.12)",padding:"2px 5px",borderRadius:4}}>{tc.lbl}</span>
                        {tlTooltip.label}
                        <div style={{position:"absolute",bottom:-6,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderTop:`6px solid ${tc.bg}`}}/>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div style={{position:"relative",height:16,marginTop:5}}>
                {[6,7,8,9,10,11,12,13,14,15,16,17,18].map(h=>{
                  const pct=(h*60-TL_START)/TL_RANGE*100;
                  if(pct<0||pct>100)return null;
                  const lbl=h===12?"12p":h>12?`${h-12}p`:`${h}a`;
                  return <span key={h} style={{position:"absolute",left:`${pct}%`,transform:"translateX(-50%)",fontSize:9,color:"#94A3B8",fontWeight:700}}>{lbl}</span>;
                })}
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              {editBlocks.map((block,idx)=>{
                const c=block.room?rc(block.room):{bg:"#F8FAFC",border:"#E2E8F0",text:"#64748B",dot:"#CBD5E1"};
                return(
                  <div key={block.id} style={{background:c.bg,border:`2px solid ${c.border}`,borderRadius:14,padding:"13px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:c.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"white"}}>{idx+1}</div>
                        <span style={{fontSize:11,fontWeight:800,color:"#64748B",letterSpacing:"0.4px"}}>BLOCK {idx+1}</span>
                        {block.reliefNote&&<span style={{fontSize:9.5,fontWeight:800,color:"#92400E",background:"#FEF9C3",border:"1px solid #FCD34D",padding:"1px 7px",borderRadius:6}}>{block.reliefNote}</span>}
                        {block.startTime&&block.endTime&&blockMins(block)>0&&<span style={{fontSize:10,fontWeight:700,color:"#40916C",background:"#E8F5E8",padding:"1px 7px",borderRadius:8}}>{fmtHours(blockMins(block))}</span>}
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>moveBlock(idx,-1)} disabled={idx===0} style={{background:"rgba(255,255,255,0.7)",border:"1px solid #E2E8F0",borderRadius:6,width:26,height:26,cursor:idx===0?"default":"pointer",fontSize:13,color:idx===0?"#D1D5DB":"#475569",display:"flex",alignItems:"center",justifyContent:"center"}}>↑</button>
                        <button onClick={()=>moveBlock(idx,1)} disabled={idx===editBlocks.length-1} style={{background:"rgba(255,255,255,0.7)",border:"1px solid #E2E8F0",borderRadius:6,width:26,height:26,cursor:idx===editBlocks.length-1?"default":"pointer",fontSize:13,color:idx===editBlocks.length-1?"#D1D5DB":"#475569",display:"flex",alignItems:"center",justifyContent:"center"}}>↓</button>
                        {editBlocks.length>1&&<button onClick={()=>removeBlock(block.id)} style={{background:"#FFF5F5",border:"1px solid #FEE2E2",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:15,color:"#EF4444",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>}
                      </div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <label style={{fontSize:10.5,fontWeight:800,color:"#6B7280",display:"block",marginBottom:5,letterSpacing:"0.5px"}}>ROOM / ASSIGNMENT</label>
                      <select value={block.room} onChange={e=>{
                        const newRoom=e.target.value;
                        const flds={room:newRoom};
                        if(newRoom&&block.startTime){
                          if(HOURS_EXCLUDED_ROOMS.has(newRoom)){
                            // Snap start to the latest work block that ends at or before this block's
                            // current start — so a block inserted in a 9-10am gap stays at 9am,
                            // not pulled to 3pm by a later block's end time.
                            const blockStart=timeToMins(block.startTime);
                            const prevWorkEnd=editBlocks
                              .filter(b=>b.id!==block.id&&b.startTime&&b.endTime&&!HOURS_EXCLUDED_ROOMS.has(b.room)&&b.room&&timeToMins(b.endTime)<=blockStart)
                              .reduce((max,b)=>Math.max(max,timeToMins(b.endTime)),0);
                            const lunchStart=prevWorkEnd>0?prevWorkEnd:blockStart;
                            const lunchStartTime=TIMES.find(t=>timeToMins(t)===lunchStart)||block.startTime;
                            const autoEnd=TIMES.find(t=>timeToMins(t)===lunchStart+60);
                            flds.startTime=lunchStartTime;
                            if(autoEnd)flds.endTime=autoEnd;
                          } else {
                            const startMins=timeToMins(block.startTime);
                            const autoEnd=TIMES.find(t=>timeToMins(t)===startMins+240);
                            if(autoEnd)flds.endTime=autoEnd;
                          }
                        }
                        updateBlockFields(block.id,flds);
                      }} style={{width:"100%",padding:"9px 11px",borderRadius:9,border:`2px solid ${c.border}`,fontSize:13,fontWeight:700,outline:"none",background:"white",color:block.room?c.text:"#94A3B8",fontFamily:"inherit",cursor:"pointer"}}>
                        <option value="">Select a room…</option>
                        {rooms.map(r=><option key={r.id} value={r.name}>{r.name}</option>)}
                      </select>
                      {HOURS_EXCLUDED_ROOMS.has(block.room)&&block.startTime&&block.endTime&&(()=>{
                        const bStart=timeToMins(block.startTime), bEnd=timeToMins(block.endTime);
                        // Relief can't start before Sarah finishes any overlapping work block
                        // e.g. if Pre-K ends at 12:30 but Lunch starts at 12:00, earliest relief is 12:30
                        const effectiveBreakStart=editBlocks.filter(b=>b.id!==block.id&&b.room&&!HOURS_EXCLUDED_ROOMS.has(b.room)&&b.startTime&&b.endTime).reduce((max,sb)=>{
                          const se=timeToMins(sb.endTime);
                          // If this work block ends within the break window, it pushes the earliest relief start
                          if(se>bStart&&se<=bEnd)return Math.max(max,se);
                          return max;
                        },bStart);
                        const reliefs=block.reliefs||[];
                        const updateReliefs=newReliefs=>updateBlock(block.id,"reliefs",newReliefs);
                        const updateOneRelief=(rid,f,v)=>updateReliefs(reliefs.map(r=>r.id===rid?{...r,[f]:v}:r));
                        const removeRelief=rid=>updateReliefs(reliefs.filter(r=>r.id!==rid));
                        const effectiveBreakStartTime=TIMES.find(t=>timeToMins(t)===effectiveBreakStart)||block.startTime;
                        const addRelief=()=>{
                          const last=reliefs[reliefs.length-1];
                          const s=last?.endTime||effectiveBreakStartTime;
                          updateReliefs([...reliefs,newRelief(s,block.endTime)]);
                        };
                        return (
                          <div style={{marginTop:8,background:"#FFF9E6",border:"1.5px solid #FCD34D",borderRadius:9,padding:"10px 12px"}}>
                            <div style={{fontSize:10.5,fontWeight:800,color:"#92400E",marginBottom:8,letterSpacing:"0.4px"}}>🔄 ASSIGN RELIEF COVERAGE</div>
                            {reliefs.map((r,ri)=>(
                              <div key={r.id} style={{background:"white",border:"1px solid #FDE68A",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                  <span style={{fontSize:10,fontWeight:800,color:"#92400E",letterSpacing:"0.4px"}}>RELIEF {ri+1}</span>
                                  <button onClick={()=>removeRelief(r.id)} style={{background:"#FFF5F5",border:"1px solid #FEE2E2",borderRadius:5,width:20,height:20,cursor:"pointer",fontSize:13,color:"#EF4444",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>
                                </div>
                                <div style={{marginBottom:7}}>
                                  <label style={{fontSize:10,fontWeight:700,color:"#78350F",display:"block",marginBottom:3}}>Staff Member</label>
                                  <select
                                    value={String(r.staffId||"")}
                                    onChange={e=>updateOneRelief(r.id,"staffId",e.target.value)}
                                    style={{width:"100%",padding:"7px 9px",borderRadius:7,border:"2px solid #FCD34D",fontSize:12.5,fontWeight:700,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:r.staffId?"#1C1C1C":"#94A3B8"}}
                                  >
                                    <option value="">— Select staff —</option>
                                    <option value="__nc__">N/C — No coverage needed</option>
                                    {staff.filter(s=>{
                                      if(String(s.id)===String(editCell?.sId))return false;
                                      // Always keep the currently-selected staff member in the list —
                                      // otherwise they get filtered out by the busy-check because their
                                      // relief block already exists in their saved schedule.
                                      if(String(s.id)===String(r.staffId))return true;
                                      const alreadyPicked=reliefs.some(rv=>rv.id!==r.id&&String(rv.staffId)===String(s.id));
                                      if(alreadyPicked)return false;
                                      const reliefStart=timeToMins(r.startTime||effectiveBreakStartTime);
                                      const reliefEnd=timeToMins(r.endTime||block.endTime);
                                      const theirBlocks=getCellData(s.id,editCell?.dayIdx)?.blocks||[];
                                      const isBusy=theirBlocks.some(tb=>{
                                        // Exclude their own relief block for this same lunch window —
                                        // that block IS the assignment and shouldn't count as a conflict
                                        if(!tb.startTime||!tb.endTime||HOURS_EXCLUDED_ROOMS.has(tb.room))return false;
                                        if(String(tb.reliefFor)===String(editCell?.sId))return false;
                                        const ts=timeToMins(tb.startTime),te=timeToMins(tb.endTime);
                                        return ts<reliefEnd&&te>reliefStart;
                                      });
                                      return !isBusy;
                                    }).map(s=>(
                                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                                  <div>
                                    <label style={{fontSize:10,fontWeight:700,color:"#78350F",display:"block",marginBottom:3}}>Start</label>
                                    <select value={r.startTime||effectiveBreakStartTime} onChange={e=>updateOneRelief(r.id,"startTime",e.target.value)} style={{width:"100%",padding:"7px 8px",borderRadius:7,border:"2px solid #FCD34D",fontSize:12,fontWeight:600,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:"#334155"}}>
                                      {TIMES.filter(t=>timeToMins(t)>=effectiveBreakStart&&timeToMins(t)<bEnd).map(t=><option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{fontSize:10,fontWeight:700,color:"#78350F",display:"block",marginBottom:3}}>End</label>
                                    <select value={r.endTime||block.endTime} onChange={e=>updateOneRelief(r.id,"endTime",e.target.value)} style={{width:"100%",padding:"7px 8px",borderRadius:7,border:"2px solid #FCD34D",fontSize:12,fontWeight:600,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:"#334155"}}>
                                      {TIMES.filter(t=>timeToMins(t)>timeToMins(r.startTime||effectiveBreakStartTime)&&timeToMins(t)<=bEnd).map(t=><option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </div>
                                </div>
                                {r.staffId&&!isNCSentinel(r.staffId)&&<div style={{marginTop:6,fontSize:10,fontWeight:700,color:"#65520A",background:"#FEF9C3",borderRadius:5,padding:"3px 7px"}}>✅ {staff.find(s=>String(s.id)===String(r.staffId))?.name} → added to their schedule</div>}
                                {isNCSentinel(r.staffId)&&<div style={{marginTop:6,fontSize:10,fontWeight:700,color:"#475569",background:"#F1F5F9",borderRadius:5,padding:"3px 7px"}}>✅ No coverage needed — marked N/C</div>}
                                {r.staffId&&r.staffId!=="__nc__"&&r.startTime&&(()=>{
                                  const rStart=timeToMins(r.startTime);
                                  const rMember=staff.find(s=>String(s.id)===String(r.staffId));
                                  const theirBlocks=rMember?getCellData(rMember.id,editCell?.dayIdx)?.blocks||[]:[];
                                  const inRoom=theirBlocks.find(tb=>tb.room&&!tb.reliefFor&&!HOURS_EXCLUDED_ROOMS.has(tb.room)&&tb.room!=="Relief"&&timeToMins(tb.startTime)<=rStart&&timeToMins(tb.endTime)>=rStart);
                                  return inRoom?(
                                    <div style={{marginTop:4,background:"#ECFDF5",border:"1px solid #6EE7B7",borderRadius:5,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#065F46"}}>
                                      📍 Currently in: <strong>{inRoom.room}</strong> ({inRoom.startTime}–{inRoom.endTime}) — they will cover from there
                                    </div>
                                  ):<div style={{marginTop:4,background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:5,padding:"3px 8px",fontSize:10,fontWeight:600,color:"#94A3B8"}}>No active room at this time</div>;
                                })()}
                              </div>
                            ))}
                            <button onClick={addRelief} style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"2px dashed #FCD34D",background:"#FFFBEB",color:"#92400E",fontWeight:800,fontSize:11.5,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>+ Add Relief Staff</button>
                          </div>
                        );
                      })()}
                    </div>
                    {/* ── Covering for someone's lunch (enter from coverer's side) ── */}
                    {block.room&&!HOURS_EXCLUDED_ROOMS.has(block.room)&&block.startTime&&block.endTime&&(()=>{
                      const hasCovering=!!block.reliefFor;
                      const bStart=timeToMins(block.startTime),bEnd=timeToMins(block.endTime);
                      return(
                        <div style={{marginTop:8,background:hasCovering?"#F0FDF4":"#F8FAFC",border:`1.5px solid ${hasCovering?"#6EE7B7":"#E2E8F0"}`,borderRadius:9,padding:"9px 12px"}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:hasCovering?8:0}}>
                            <div style={{fontSize:10.5,fontWeight:800,color:hasCovering?"#065F46":"#94A3B8",letterSpacing:"0.4px"}}>
                              {hasCovering?"✅ COVERING LUNCH FOR":"🔄 COVERING SOMEONE'S LUNCH?"}
                            </div>
                            {hasCovering?(
                              <button onClick={()=>updateBlockFields(block.id,{reliefFor:null,reliefNote:"",reliefBlockId:null})}
                                style={{background:"#FFF5F5",border:"1px solid #FEE2E2",borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:800,color:"#EF4444",cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
                            ):(
                              <button onClick={()=>updateBlockFields(block.id,{reliefFor:"__pending__",reliefNote:"",reliefBlockId:null})}
                                style={{background:"white",border:"1.5px solid #CBD5E1",borderRadius:6,padding:"2px 9px",fontSize:10,fontWeight:800,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>+ Assign</button>
                            )}
                          </div>
                          {hasCovering&&(
                            <div>
                              <label style={{fontSize:10,fontWeight:700,color:"#065F46",display:"block",marginBottom:3}}>Staff whose lunch I'm covering</label>
                              <select
                                value={String(block.reliefFor)==="__pending__"?"":String(block.reliefFor)}
                                onChange={e=>{
                                  const tId=e.target.value;
                                  const tName=staff.find(s=>String(s.id)===tId)?.name||"";
                                  updateBlockFields(block.id,{reliefFor:tId,reliefNote:`Relief for ${tName}`,reliefBlockId:block.reliefBlockId||`r${Date.now()}${Math.random()}`});
                                }}
                                style={{width:"100%",padding:"7px 9px",borderRadius:7,border:"2px solid #6EE7B7",fontSize:12.5,fontWeight:700,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:String(block.reliefFor)==="__pending__"?"#94A3B8":"#1C1C1C"}}
                              >
                                <option value="">— Select staff —</option>
                                {staff.filter(s=>String(s.id)!==String(editCell?.sId)).map(s=>(
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                              {block.reliefFor&&String(block.reliefFor)!=="__pending__"&&(()=>{
                                const tName=staff.find(s=>String(s.id)===String(block.reliefFor))?.name||"";
                                const theirBlocks=getCellData(block.reliefFor,editCell?.dayIdx)?.blocks||[];
                                const lunchExists=theirBlocks.some(tb=>IS_LUNCH_ROOM(tb.room||'')&&tb.startTime&&tb.endTime&&
                                  timeToMins(tb.startTime)<=bStart&&timeToMins(tb.endTime)>=bEnd);
                                return(
                                  <div style={{marginTop:5,fontSize:10,fontWeight:700,color:lunchExists?"#065F46":"#92400E",background:lunchExists?"#DCFCE7":"#FEF3C7",borderRadius:5,padding:"3px 8px"}}>
                                    {lunchExists
                                      ?`✅ ${tName.split(" ")[0]}'s Lunch / Break block exists — will be linked on save`
                                      :`⚠️ ${tName.split(" ")[0]} has no lunch block yet — one will be auto-created on save (${block.startTime}–${block.endTime})`}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
                      <div>
                        <label style={{fontSize:10.5,fontWeight:800,color:"#6B7280",display:"block",marginBottom:5,letterSpacing:"0.5px"}}>START TIME</label>
                        <select value={block.startTime} onChange={e=>{ const ns=e.target.value; const flds={startTime:ns}; if(timeToMins(block.endTime)<=timeToMins(ns)){const i=TIMES.indexOf(ns);flds.endTime=TIMES[Math.min(i+1,TIMES.length-1)];} updateBlockFields(block.id,flds); }} style={{width:"100%",padding:"9px 10px",borderRadius:9,border:"2px solid rgba(0,0,0,0.08)",fontSize:13,fontWeight:600,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:"#334155"}}>
                          {TIMES.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{fontSize:10.5,fontWeight:800,color:"#6B7280",display:"block",marginBottom:5,letterSpacing:"0.5px"}}>END TIME</label>
                        <select value={block.endTime} onChange={e=>updateBlock(block.id,"endTime",e.target.value)} style={{width:"100%",padding:"9px 10px",borderRadius:9,border:"2px solid rgba(0,0,0,0.08)",fontSize:13,fontWeight:600,outline:"none",background:"white",fontFamily:"inherit",cursor:"pointer",color:"#334155"}}>
                          {TIMES.filter(t=>timeToMins(t)>timeToMins(block.startTime)).map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={addBlock} style={{width:"100%",padding:11,borderRadius:11,border:"2px dashed #40916C",background:"#F0FDF4",color:"#2D6A4F",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>+ Add Another Block</button>

            {editBlocks.some(b=>b.room&&b.startTime&&b.endTime)&&(
              <div style={{background:"#E8F5E8",borderRadius:10,padding:"9px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:700,color:"#2D6A4F"}}>Day total</span>
                <span style={{fontSize:15,fontWeight:900,color:"#1B4332"}}>{fmtHours(dayMins(editBlocks.filter(b=>b.room&&b.startTime&&b.endTime)))}</span>
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={clearCell} style={{padding:"11px 14px",borderRadius:11,border:"2px solid #FEE2E2",background:"#FFF5F5",color:"#EF4444",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🗑 Clear</button>
              <button onClick={()=>setEditCell(null)} style={{flex:1,padding:11,borderRadius:11,border:"2px solid #E2E8F0",background:"white",color:"#475569",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
              <button onClick={saveEdit} disabled={!!reliefOverlapError} style={{flex:1,padding:11,borderRadius:11,border:"none",background:reliefOverlapError?"#FCA5A5":`linear-gradient(135deg,${locColor},${locColor}cc)`,color:"white",fontWeight:800,fontSize:14,cursor:reliefOverlapError?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:reliefOverlapError?"none":"0 4px 14px rgba(0,0,0,0.2)",opacity:reliefOverlapError?0.7:1}}>Save Shift ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TEMPLATES MODAL ── */}
      {showTemplates&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,30,20,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={e=>e.target===e.currentTarget&&setShowTemplates(false)}>
          <div style={{background:"white",borderRadius:22,padding:28,width:480,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.25)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:900,fontSize:22,color:"#1E293B"}}>📁 Templates — {loc.name}</div>
              <button onClick={()=>setShowTemplates(false)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:20}}>Templates are saved per location. Save the current week as a reusable template, then load it onto any week.</div>
            <div style={{background:"#F0FDF4",border:"2px solid #D8F3DC",borderRadius:14,padding:16,marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:800,color:"#2D6A4F",marginBottom:10}}>💾 SAVE CURRENT WEEK AS TEMPLATE</div>
              <div style={{display:"flex",gap:8}}>
                <input value={newTemplateName} onChange={e=>setNewTemplateName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveTemplate()} placeholder="e.g. Standard Week, Summer Schedule…" style={{flex:1,padding:"10px 13px",borderRadius:10,border:"2px solid #B7E4C7",fontSize:13,outline:"none",fontFamily:"inherit",fontWeight:600,color:"#1E293B"}}/>
                <button onClick={saveTemplate} style={{padding:"10px 16px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Save</button>
              </div>
            </div>
            {templates.length===0?(
              <div style={{textAlign:"center",padding:"24px 0",color:"#94A3B8",fontSize:13}}>No templates saved for this location yet.</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {templates.map(tmpl=>(
                  <div key={tmpl.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:12}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:14,color:"#1E293B"}}>{tmpl.name}</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Saved {tmpl.saved}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>loadTemplate(tmpl)} style={{background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",border:"none",borderRadius:9,padding:"7px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Load onto this week</button>
                      <button onClick={()=>deleteTemplate(tmpl.id)} style={{background:"#FFF5F5",color:"#EF4444",border:"1.5px solid #FEE2E2",borderRadius:9,padding:"7px 10px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={()=>setShowTemplates(false)} style={{marginTop:20,width:"100%",padding:13,borderRadius:12,border:"none",background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Done ✓</button>
          </div>
        </div>
      )}

      {/* ── MANAGE ROOMS MODAL ── */}
      {showManageRooms&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,30,20,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={e=>e.target===e.currentTarget&&setShowManageRooms(false)}>
          <div style={{background:"white",borderRadius:22,padding:28,width:460,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.25)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:900,fontSize:22,color:"#1E293B"}}>🏠 Rooms — {loc.name}</div>
              <button onClick={()=>setShowManageRooms(false)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:20}}>Rooms are unique to this location. Click any name to rename it.</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
              {rooms.map((room,roomIdx)=>{ const c=COLOR_PALETTE[room.colorIdx%COLOR_PALETTE.length]; return(
                <div key={room.id} style={{background:c.bg,border:`2px solid ${c.border}`,borderRadius:12,padding:"11px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:(!HOURS_EXCLUDED_ROOMS.has(room.name)&&room.name!=="Kitchen"&&room.name!=="Floater"&&room.name!=="Office")?8:0}}>
                    <span style={{width:11,height:11,borderRadius:"50%",background:c.dot,flexShrink:0}}/>
                    {editingRoomId===room.id?(
                      <input autoFocus value={editingRoomName} onChange={e=>setEditingRoomName(e.target.value)} onBlur={saveRoomName} onKeyDown={e=>{if(e.key==="Enter")saveRoomName();if(e.key==="Escape")setEditingRoomId(null);}} style={{flex:1,fontSize:14,fontWeight:700,color:c.text,border:`2px solid ${c.border}`,borderRadius:8,padding:"5px 10px",outline:"none",fontFamily:"inherit",background:"white"}}/>
                    ):(
                      <span onClick={()=>startEditRoom(room)} style={{flex:1,fontSize:14,fontWeight:700,color:c.text,cursor:"text",borderBottom:`1.5px dashed ${c.border}`,paddingBottom:1}}>{room.name}</span>
                    )}
                    {editingRoomId!==room.id&&<span style={{fontSize:10.5,color:"#94A3B8",fontStyle:"italic"}}>click to rename</span>}
                    <div style={{display:"flex",gap:2,marginLeft:4}}>
                      <button onClick={()=>setRooms(r=>{const a=[...r];[a[roomIdx-1],a[roomIdx]]=[a[roomIdx],a[roomIdx-1]];return a;})} disabled={roomIdx===0} style={{background:"#F1F5F9",border:"none",borderRadius:5,width:22,height:22,cursor:"pointer",fontSize:11,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center",opacity:roomIdx===0?0.3:1}}>▲</button>
                      <button onClick={()=>setRooms(r=>{const a=[...r];[a[roomIdx],a[roomIdx+1]]=[a[roomIdx+1],a[roomIdx]];return a;})} disabled={roomIdx===rooms.length-1} style={{background:"#F1F5F9",border:"none",borderRadius:5,width:22,height:22,cursor:"pointer",fontSize:11,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center",opacity:roomIdx===rooms.length-1?0.3:1}}>▼</button>
                    </div>
                    <button onClick={()=>setConfirmDelete({type:"room",id:room.id,name:room.name})} disabled={PROTECTED_ROOMS.has(room.name)} style={{background:"none",border:"none",color:PROTECTED_ROOMS.has(room.name)?"transparent":"#CBD5E1",cursor:PROTECTED_ROOMS.has(room.name)?"default":"pointer",fontSize:20,lineHeight:1,padding:"0 2px",position:"relative"}} onMouseEnter={e=>{if(!PROTECTED_ROOMS.has(room.name))e.currentTarget.style.color="#EF4444";}} onMouseLeave={e=>{if(!PROTECTED_ROOMS.has(room.name))e.currentTarget.style.color="#CBD5E1";}}>
                      {PROTECTED_ROOMS.has(room.name)
                        ?<span style={{fontSize:11,fontWeight:800,color:"#92400E",background:"#FEF3C7",border:"1.5px solid #FCD34D",borderRadius:6,padding:"2px 7px",letterSpacing:"0.3px"}}>🔒 Protected</span>
                        :"×"
                      }
                    </button>
                  </div>
                  {!HOURS_EXCLUDED_ROOMS.has(room.name)&&room.name!=="Kitchen"&&room.name!=="Floater"&&room.name!=="Office"&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <div>
                        <div style={{fontSize:10,fontWeight:800,color:"#94A3B8",letterSpacing:"0.5px",marginBottom:4}}>MAX CAPACITY</div>
                        <input type="number" min="1" max="50" placeholder="e.g. 10" value={room.capacity||""} onChange={e=>setRooms(rooms.map(r=>r.id===room.id?{...r,capacity:e.target.value?parseInt(e.target.value):null}:r))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1.5px solid ${c.border}`,fontSize:13,fontWeight:700,outline:"none",fontFamily:"inherit",background:"white",color:c.text}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,fontWeight:800,color:"#94A3B8",letterSpacing:"0.5px",marginBottom:4}}>STAFF : CHILDREN RATIO</div>
                        <input placeholder="e.g. 1:4" value={room.ratio||""} onChange={e=>setRooms(rooms.map(r=>r.id===room.id?{...r,ratio:e.target.value}:r))} style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1.5px solid ${c.border}`,fontSize:13,fontWeight:700,outline:"none",fontFamily:"inherit",background:"white",color:c.text}}/>
                      </div>
                    </div>
                  )}
                </div>
              ); })}
            </div>
            <div style={{borderTop:"1.5px solid #E8F3E8",paddingTop:18}}>
              <div style={{fontSize:11,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",marginBottom:8}}>ADD NEW ROOM</div>
              <div style={{display:"flex",gap:8}}>
                <input value={newRoomName} onChange={e=>setNewRoomName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addRoom()} placeholder="e.g. School Age Room" style={{flex:1,padding:"11px 13px",borderRadius:11,border:"2px solid #E2E8F0",fontSize:14,outline:"none",fontFamily:"inherit",fontWeight:600,color:"#1E293B"}}/>
                <button onClick={addRoom} style={{padding:"11px 18px",borderRadius:11,border:"none",background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Add</button>
              </div>
            </div>
            <button onClick={()=>setShowManageRooms(false)} style={{marginTop:18,width:"100%",padding:13,borderRadius:12,border:"none",background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Done ✓</button>
          </div>
        </div>
      )}

      {/* ── ADD STAFF MODAL ── */}
      {showAddStaff&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,30,20,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={e=>e.target===e.currentTarget&&setShowAddStaff(false)}>
          <div style={{background:"white",borderRadius:22,padding:28,width:360,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>
            <div style={{fontWeight:900,fontSize:22,color:"#1E293B",marginBottom:4}}>Add Staff Member</div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:18}}>Adding to: <strong style={{color:locColor}}>{loc.name}</strong></div>
            <label style={{fontSize:11,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",display:"block",marginBottom:5}}>FULL NAME</label>
            <input autoFocus value={newStaffName} onChange={e=>setNewStaffName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStaff()} placeholder="e.g. Jane Smith" style={{width:"100%",padding:"13px 15px",borderRadius:12,border:"2px solid #E2E8F0",fontSize:15,outline:"none",fontFamily:"inherit",fontWeight:600,boxSizing:"border-box",color:"#1E293B",marginBottom:12}}/>
            <label style={{fontSize:11,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",display:"block",marginBottom:5}}>EMAIL ADDRESS <span style={{fontWeight:500,color:"#94A3B8"}}>(for calendar sharing)</span></label>
            <input value={newStaffEmail} onChange={e=>setNewStaffEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStaff()} placeholder="e.g. jane@email.com" type="email" style={{width:"100%",padding:"13px 15px",borderRadius:12,border:"2px solid #E2E8F0",fontSize:15,outline:"none",fontFamily:"inherit",fontWeight:600,boxSizing:"border-box",color:"#1E293B"}}/>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button onClick={()=>setShowAddStaff(false)} style={{flex:1,padding:12,borderRadius:11,border:"2px solid #E2E8F0",background:"white",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13,color:"#64748B"}}>Cancel</button>
              <button onClick={addStaff} style={{flex:1,padding:12,borderRadius:11,border:"none",background:`linear-gradient(135deg,${locColor},${locColor}cc)`,color:"white",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:14,boxShadow:"0 4px 14px rgba(0,0,0,0.2)"}}>Add Staff ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE MODAL ── */}
      {/* ── CLEAR DAY / WEEK PICKER ── */}
      {showClearModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,30,20,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:16}} onClick={e=>e.target===e.currentTarget&&setShowClearModal(false)}>
          <div style={{background:"white",borderRadius:22,padding:28,width:420,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <div style={{fontWeight:900,fontSize:20,color:"#1E293B"}}>🗑 Clear Day / Week</div>
              <button onClick={()=>setShowClearModal(false)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:18}}>Choose a specific day to clear, or clear the entire week. All staff shifts for the selection will be removed.</div>

            {/* Day buttons */}
            <div style={{fontSize:10.5,fontWeight:800,color:"#94A3B8",letterSpacing:"0.5px",marginBottom:8}}>CLEAR A SPECIFIC DAY</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:18}}>
              {DAY_SHORT.map((d,i)=>{
                const date=weekDates[i];
                const isToday=date?.toDateString()===new Date().toDateString();
                const hasShifts=staff.some(s=>getCellData(s.id,i)?.blocks?.length>0);
                const label=`${d}, ${formatDate(date)}`;
                return(
                  <button key={i} onClick={()=>{ setShowClearModal(false); setConfirmDelete({type:"clearDay",dayIdx:i,label}); }}
                    disabled={!hasShifts}
                    style={{
                      display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 4px",
                      borderRadius:10,border:`2px solid ${isToday?"#40916C":hasShifts?"#FCA5A5":"#E2E8F0"}`,
                      background:isToday?"#F0FDF4":hasShifts?"#FFF5F5":"#F8FAFC",
                      cursor:hasShifts?"pointer":"default",fontFamily:"inherit",
                      opacity:hasShifts?1:0.4,
                    }}>
                    <span style={{fontSize:11,fontWeight:800,color:isToday?"#1B4332":hasShifts?"#DC2626":"#94A3B8"}}>{d}</span>
                    <span style={{fontSize:9,fontWeight:600,color:"#94A3B8",marginTop:2}}>{formatDate(date)}</span>
                    {isToday&&<span style={{fontSize:8,fontWeight:900,color:"#40916C",marginTop:2,letterSpacing:"0.3px"}}>TODAY</span>}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{height:1,background:"#E2E8F0",marginBottom:16}}/>

            {/* Clear entire week */}
            <div style={{fontSize:10.5,fontWeight:800,color:"#94A3B8",letterSpacing:"0.5px",marginBottom:8}}>CLEAR ENTIRE WEEK</div>
            <button onClick={()=>{ setShowClearModal(false); setConfirmDelete({type:"clearWeek"}); }}
              style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px solid #FCA5A5",background:"#FFF5F5",color:"#DC2626",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              🗑 Clear All Days — {weekLabel}
            </button>
          </div>
        </div>
      )}

      {confirmDelete&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,30,20,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:16}} onClick={e=>e.target===e.currentTarget&&setConfirmDelete(null)}>
          <div style={{background:"white",borderRadius:22,padding:32,width:400,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.3)",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:"50%",background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 16px"}}>
              {"🗑️"}
            </div>
            <div style={{fontWeight:900,fontSize:20,color:"#1E293B",marginBottom:8}}>
              {confirmDelete.type==="clearWeek"?"Clear Entire Week?"
              :confirmDelete.type==="clearDay"?`Clear ${confirmDelete.label}?`
              :confirmDelete.type==="staff"?"Remove Staff Member?"
              :confirmDelete.type==="room"?"Delete Room?"
              :"Delete Location?"}
            </div>
            <div style={{fontSize:14,color:"#64748B",marginBottom:6}}>
              {confirmDelete.type==="clearWeek"&&<>Clear <strong style={{color:"#DC2626"}}>all shifts for every staff member</strong> on the current week ({weekLabel}). This cannot be undone.</>}
              {confirmDelete.type==="clearDay"&&<>Clear <strong style={{color:"#DC2626"}}>all shifts for every staff member</strong> on <strong style={{color:"#1E293B"}}>{confirmDelete.label}</strong>. This cannot be undone.</>}
              {confirmDelete.type==="staff"&&<>Remove <strong style={{color:"#1E293B"}}>{confirmDelete.name}</strong>? All their scheduled shifts at this location will be deleted.</>}
              {confirmDelete.type==="room"&&<>Delete room <strong style={{color:"#1E293B"}}>{confirmDelete.name}</strong>? It will be cleared from all shifts where it was assigned.</>}
              {confirmDelete.type==="location"&&<>Delete <strong style={{color:"#1E293B"}}>{confirmDelete.name}</strong>? All staff, rooms, and schedules for this location will be permanently removed.</>}
            </div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:24}}>This action cannot be undone.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmDelete(null)} style={{flex:1,padding:12,borderRadius:12,border:"2px solid #E2E8F0",background:"white",color:"#475569",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
              <button onClick={()=>{
                if(confirmDelete.type==="clearWeek")clearWeek();
                else if(confirmDelete.type==="clearDay")clearDay(confirmDelete.dayIdx);
                else if(confirmDelete.type==="staff")removeStaff(confirmDelete.id);
                else if(confirmDelete.type==="room")removeRoom(confirmDelete.id);
                else removeLoc(confirmDelete.id);
                setConfirmDelete(null);
              }} style={{flex:1,padding:12,borderRadius:12,border:"none",background:"linear-gradient(135deg,#DC2626,#EF4444)",color:"white",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(220,38,38,0.3)"}}>
                {confirmDelete.type==="clearWeek"?"Yes, Clear Entire Week"
                :confirmDelete.type==="clearDay"?`Yes, Clear ${confirmDelete.label.split(",")[0]}`
                :confirmDelete.type==="staff"?"Yes, Remove"
                :confirmDelete.type==="room"?"Yes, Delete"
                :"Yes, Delete Location"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── COPY FROM PREV DAY / WEEK MODAL ── */}
      {copyPrevModal&&(()=>{
        const prevWeekStart=new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate()-7);
        const prevWeekDates=getWeekDates(prevWeekStart);
        const prevWiso=prevWeekStart.toISOString();
        // Which days in the prev week have ANY data
        const prevDayHasData=DAYS.map((_,d)=>staff.some(s=>schedule[`${prevWiso}|${s.id}|${d}`]?.blocks?.length>0));
        const m=copyPrevModal;
        const close=()=>setCopyPrevModal(null);
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(15,30,20,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:16}} onClick={e=>e.target===e.currentTarget&&close()}>
            <div style={{background:"white",borderRadius:22,padding:28,width:460,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.3)"}}>

              {/* Header */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div>
                  <div style={{fontWeight:900,fontSize:19,color:"#1E293B"}}>⬅️ Copy from Previous Week</div>
                  <div style={{fontSize:12,color:"#64748B",marginTop:2}}>Previous week: <strong>{`${formatDate(prevWeekDates[0])} – ${formatDate(prevWeekDates[6])}`}</strong></div>
                </div>
                <button onClick={close} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>

              {/* Step: pick */}
              {m.step==="pick"&&(
                <div>
                  <div style={{fontSize:13,color:"#475569",marginBottom:16,fontWeight:600}}>What would you like to copy?</div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <button onClick={()=>setCopyPrevModal({step:"confirm-week"})}
                      style={{padding:"16px 18px",borderRadius:14,border:"2px solid #40916C",background:"#F0FDF4",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                      <div style={{fontWeight:800,fontSize:14,color:"#1B4332"}}>📅 Copy entire week</div>
                      <div style={{fontSize:12,color:"#52B788",marginTop:3}}>Copy all shifts from prev week — only fills empty days, won't overwrite existing shifts</div>
                    </button>
                    <button onClick={()=>setCopyPrevModal({step:"pickDay",fromDay:null,toDay:null})}
                      style={{padding:"16px 18px",borderRadius:14,border:"2px solid #3B82F6",background:"#EFF6FF",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                      <div style={{fontWeight:800,fontSize:14,color:"#1E40AF"}}>📆 Copy a single day</div>
                      <div style={{fontSize:12,color:"#60A5FA",marginTop:3}}>Pick one day from last week and paste it onto any day this week</div>
                    </button>
                  </div>
                  <button onClick={close} style={{marginTop:16,width:"100%",padding:11,borderRadius:11,border:"2px solid #E2E8F0",background:"white",color:"#475569",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                </div>
              )}

              {/* Step: confirm-week */}
              {m.step==="confirm-week"&&(
                <div>
                  <div style={{background:"#F0FDF4",border:"1.5px solid #86EFAC",borderRadius:12,padding:"14px 16px",marginBottom:18}}>
                    <div style={{fontWeight:800,fontSize:14,color:"#1B4332",marginBottom:4}}>📅 Copy entire previous week</div>
                    <div style={{fontSize:13,color:"#374151"}}>All shifts from <strong>{`${formatDate(prevWeekDates[0])} – ${formatDate(prevWeekDates[6])}`}</strong> will be copied into the current week. Days that already have shifts will be skipped.</div>
                  </div>
                  <div style={{fontSize:12,color:"#94A3B8",marginBottom:20,textAlign:"center"}}>Shifts will be duplicated with fresh IDs. This only fills empty days.</div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setCopyPrevModal({step:"pick"})} style={{flex:1,padding:12,borderRadius:11,border:"2px solid #E2E8F0",background:"white",color:"#475569",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Back</button>
                    <button onClick={()=>{ copyFromPrevWeek(); close(); }}
                      style={{flex:2,padding:12,borderRadius:11,border:"none",background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(27,67,50,0.3)"}}>
                      ✓ Yes, Copy Entire Week
                    </button>
                  </div>
                </div>
              )}

              {/* Step: pickDay — select source and target day */}
              {m.step==="pickDay"&&(
                <div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",marginBottom:8}}>COPY FROM (previous week)</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                      {DAYS.map((day,i)=>{
                        const hasData=prevDayHasData[i];
                        const sel=m.fromDay===i;
                        return(
                          <button key={i} onClick={()=>hasData&&setCopyPrevModal(p=>({...p,fromDay:i}))}
                            style={{padding:"8px 4px",borderRadius:9,border:`2px solid ${sel?"#3B82F6":hasData?"#93C5FD":"#E2E8F0"}`,
                              background:sel?"#2563EB":hasData?"#EFF6FF":"#F8FAFC",
                              color:sel?"white":hasData?"#1E40AF":"#CBD5E1",
                              fontWeight:sel?800:hasData?700:500,fontSize:11,cursor:hasData?"pointer":"default",
                              fontFamily:"inherit",textAlign:"center"}}>
                            <div>{DAY_SHORT[i]}</div>
                            <div style={{fontSize:9,marginTop:2,opacity:0.8}}>{formatDate(prevWeekDates[i])}</div>
                            {!hasData&&<div style={{fontSize:8,marginTop:2,color:"#CBD5E1"}}>empty</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{marginBottom:18}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",marginBottom:8}}>PASTE TO (this week)</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                      {DAYS.map((day,i)=>{
                        const hasData=staff.some(s=>getCellData(s.id,i)?.blocks?.length>0);
                        const sel=m.toDay===i;
                        const isToday=weekDates[i]?.toDateString()===new Date().toDateString();
                        return(
                          <button key={i} onClick={()=>setCopyPrevModal(p=>({...p,toDay:i}))}
                            style={{padding:"8px 4px",borderRadius:9,
                              border:`2px solid ${sel?"#40916C":isToday?"#1E3A8A":"#E2E8F0"}`,
                              background:sel?"#1B4332":isToday?"#EFF6FF":"#F8FAFC",
                              color:sel?"white":isToday?"#1E3A8A":"#374151",
                              fontWeight:sel?800:600,fontSize:11,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>
                            <div>{DAY_SHORT[i]}</div>
                            <div style={{fontSize:9,marginTop:2,opacity:0.8}}>{formatDate(weekDates[i])}</div>
                            {hasData&&!sel&&<div style={{fontSize:8,marginTop:2,color:"#F59E0B",fontWeight:700}}>has shifts</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setCopyPrevModal({step:"pick"})} style={{flex:1,padding:12,borderRadius:11,border:"2px solid #E2E8F0",background:"white",color:"#475569",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Back</button>
                    <button onClick={()=>{ if(m.fromDay==null||m.toDay==null)return; setCopyPrevModal({step:"confirm-day",fromDay:m.fromDay,toDay:m.toDay}); }}
                      disabled={m.fromDay==null||m.toDay==null}
                      style={{flex:2,padding:12,borderRadius:11,border:"none",
                        background:m.fromDay!=null&&m.toDay!=null?"linear-gradient(135deg,#1E40AF,#3B82F6)":"#E2E8F0",
                        color:m.fromDay!=null&&m.toDay!=null?"white":"#94A3B8",
                        fontWeight:800,fontSize:13,cursor:m.fromDay!=null&&m.toDay!=null?"pointer":"default",fontFamily:"inherit"}}>
                      Next →
                    </button>
                  </div>
                </div>
              )}

              {/* Step: confirm-day */}
              {m.step==="confirm-day"&&(
                <div>
                  <div style={{background:"#EFF6FF",border:"1.5px solid #93C5FD",borderRadius:12,padding:"14px 16px",marginBottom:6}}>
                    <div style={{fontWeight:800,fontSize:14,color:"#1E40AF",marginBottom:6}}>📆 Confirm single day copy</div>
                    <div style={{fontSize:13,color:"#374151",lineHeight:1.6}}>
                      Copy <strong>{DAYS[m.fromDay]}, {formatDate(prevWeekDates[m.fromDay])}</strong> (prev week)<br/>
                      → Paste onto <strong>{DAYS[m.toDay]}, {formatDate(weekDates[m.toDay])}</strong> (this week)
                    </div>
                  </div>
                  {staff.some(s=>getCellData(s.id,m.toDay)?.blocks?.length>0)&&(
                    <div style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:9,padding:"8px 12px",marginTop:8,marginBottom:4,fontSize:12,color:"#92400E",fontWeight:700}}>
                      ⚠️ {DAYS[m.toDay]} already has shifts — they will be overwritten.
                    </div>
                  )}
                  <div style={{fontSize:12,color:"#94A3B8",marginBottom:20,marginTop:8,textAlign:"center"}}>Shifts will be duplicated with fresh IDs.</div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setCopyPrevModal({step:"pickDay",fromDay:m.fromDay,toDay:m.toDay})} style={{flex:1,padding:12,borderRadius:11,border:"2px solid #E2E8F0",background:"white",color:"#475569",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Back</button>
                    <button onClick={()=>{ copyDayFromPrev(m.fromDay,m.toDay); close(); }}
                      style={{flex:2,padding:12,borderRadius:11,border:"none",background:"linear-gradient(135deg,#1E40AF,#3B82F6)",color:"white",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(37,99,235,0.3)"}}>
                      ✓ Yes, Copy {DAY_SHORT[m.fromDay]} → {DAY_SHORT[m.toDay]}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* ── STAFF INFO / CALENDAR MODAL ── */}
      {showStaffInfo && (()=>{
        const s = staff.find(x=>x.id===showStaffInfo.id) || showStaffInfo;
        const wkMins = staffWeekMins(s.id);
        const hasSchedule = weekDates.some((_,di)=>getCellData(s.id,di));
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(15,15,30,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1500,padding:16}} onClick={e=>e.target===e.currentTarget&&setShowStaffInfo(null)}>
            <div style={{background:"white",borderRadius:22,padding:28,width:440,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.28)",maxHeight:"90vh",overflowY:"auto"}}>

              {/* Header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:getAvatarColor(staff.findIndex(st=>st.id===s.id)),display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"white",boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>{initials(s.name)}</div>
                  <div>
                    <div style={{fontWeight:900,fontSize:18,color:"#1E293B"}}>{s.name}</div>
                    <div style={{fontSize:12,color:"#64748B",marginTop:1}}>{loc.name} · {fmtHours(wkMins)} this week</div>
                  </div>
                </div>
                <button onClick={()=>setShowStaffInfo(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
              </div>

              {/* Email section */}
              <div style={{marginBottom:20}}>
                <label style={{fontSize:11,fontWeight:800,color:"#6B7280",letterSpacing:"0.5px",display:"block",marginBottom:7}}>✉️ EMAIL ADDRESS</label>
                <div style={{display:"flex",gap:8}}>
                  <input
                    key={s.id}
                    defaultValue={s.email||""}
                    onBlur={e=>saveStaffEmail(s.id,e.target.value.trim())}
                    onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}}
                    placeholder="e.g. jane@email.com"
                    type="email"
                    style={{flex:1,padding:"11px 13px",borderRadius:10,border:"2px solid #E2E8F0",fontSize:14,outline:"none",fontFamily:"inherit",fontWeight:600,color:"#1E293B"}}
                  />
                </div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:5}}>Used for sending calendar invites. Not shown on the main schedule.</div>
              </div>

              {/* Divider */}
              <div style={{borderTop:"1.5px solid #E8F3E8",paddingTop:18,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:800,color:"#1E293B",marginBottom:4}}>📅 Calendar Sharing</div>
                <div style={{fontSize:12,color:"#64748B",marginBottom:14}}>Share {s.name.split(" ")[0]}'s schedule directly to their phone calendar. They subscribe once and it stays up to date automatically.</div>
              </div>

              {/* Download ICS - works right now */}
              <div style={{background:"#F0FDF4",border:"2px solid #BBF7D0",borderRadius:14,padding:16,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:13,color:"#166534"}}>📥 Download This Week's Schedule</div>
                    <div style={{fontSize:11,color:"#4B7A5A",marginTop:2}}>Downloads a .ics file — {s.name.split(" ")[0]} opens it on their phone to import shifts into Apple Calendar or Google Calendar.</div>
                  </div>
                  <button
                    onClick={()=>{ if(!hasSchedule){showToast("⚠️ No shifts scheduled this week");return;} handleDownloadICS(s); }}
                    style={{background:"#166534",color:"white",border:"none",borderRadius:10,padding:"9px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}
                  >
                    Download
                  </button>
                </div>
              </div>

              {/* Send Calendar Invite Email */}
              <div style={{background:"#EEF2FF",border:"2px solid #C7D2FE",borderRadius:14,padding:16,marginBottom:20}}>
                <div style={{fontWeight:800,fontSize:13,color:"#1E3A8A",marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                  🔗 Send Live Calendar Subscription
                  {emailSent[s.id] && <span style={{background:"#DCFCE7",color:"#166534",fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:8}}>✓ Sent</span>}
                </div>
                <div style={{fontSize:12,color:"#4B5563",marginBottom:12,lineHeight:1.6}}>
                  Sends {s.name.split(" ")[0]} an email with a <strong>one-tap subscribe link</strong> for their phone calendar.
                  They tap it once → their calendar asks "Subscribe?" → they say yes → their work schedule
                  appears automatically and stays synced whenever you update it.
                  Works on both <strong>iPhone</strong> (Apple Calendar) and <strong>Android</strong> (Google Calendar).
                </div>

                {/* Webcal URL preview */}
                <div style={{background:"white",border:"1px solid #C7D2FE",borderRadius:8,padding:"8px 11px",marginBottom:12,fontSize:11,fontFamily:"monospace",color:"#6366F1",wordBreak:"break-all"}}>
                  webcal://{HOSTED_URL.replace(/^https?:\/\//,"")}/api/calendar/{s.id}
                </div>

                {/* No email warning */}
                {!s.email && (
                  <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:8,padding:"8px 11px",marginBottom:10,fontSize:12,color:"#92400E",fontWeight:600}}>
                    ⚠️ Add an email address above before sending.
                  </div>
                )}

                <button
                  onClick={()=>handleSendCalendarInvite(s)}
                  disabled={emailSending || !s.email}
                  style={{width:"100%",padding:"11px",borderRadius:10,border:"none",background:s.email?"#1E3A8A":"#CBD5E1",color:"white",fontWeight:800,fontSize:13,cursor:s.email?"pointer":"default",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:emailSending?0.7:1}}
                >
                  {emailSending ? "⏳ Sending…" : emailSent[s.id] ? "✉️ Resend Invite" : "✉️ Send Calendar Invite"}
                </button>
                <div style={{fontSize:10,color:"#94A3B8",textAlign:"center",marginTop:6}}>
                  Sends from noreply@kcchildcare.ca via Resend · Requires app to be deployed on Vercel
                </div>
              </div>

              <button onClick={()=>setShowStaffInfo(null)} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:"#1E3A8A",color:"white",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Done ✓</button>
            </div>
          </div>
        );
      })()}

      <style>{`* { box-sizing: border-box; } select { -webkit-appearance: auto; } @media print { body { background: white !important; } button { display: none !important; } }`}</style>

      {/* ── SICK DAY MODAL ── */}
      {sickModal&&(()=>{
        const sickS=staff.find(s=>String(s.id)===String(sickModal.staffId));
        if(!sickS) return null;
        const dayIdx=sickModal.dayIdx;
        const todayDate=weekDates[dayIdx];
        const dayLabel=todayDate?`${DAY_SHORT[dayIdx]} ${formatDate(todayDate)}`:"Today";
        const sickBlocks=(getCellData(sickS.id,dayIdx)?.blocks||[]).filter(b=>b.room&&b.startTime&&b.endTime&&b.room!=="Sick");

        // Get suggestions for a block — scheduled staff first, then unscheduled
        const getSuggestions = (block) => {
          const bStart=timeToMins(block.startTime), bEnd=timeToMins(block.endTime);
          const scored=[];
          staff.forEach((s,si)=>{
            if(String(s.id)===String(sickS.id)) return;
            const theirBlocks=(getCellData(s.id,dayIdx)?.blocks||[]);
            const isScheduled=theirBlocks.some(b=>b.room&&b.startTime&&b.endTime&&!HOURS_EXCLUDED_ROOMS.has(b.room));
            // Check if they're free during this block
            const isBusy=theirBlocks.some(b=>{
              if(!b.startTime||!b.endTime) return false;
              return timeToMins(b.startTime)<bEnd&&timeToMins(b.endTime)>bStart;
            });
            if(isBusy) return;
            const weekHrs=Math.round(staffWeekMins(s.id)/60*10)/10;
            scored.push({s,si,isScheduled,weekHrs});
          });
          // Sort: scheduled first, then by fewest hours (most room to take on more)
          scored.sort((a,b)=>{ if(a.isScheduled!==b.isScheduled) return a.isScheduled?-1:1; return a.weekHrs-b.weekHrs; });
          return scored.slice(0,4);
        };

        // Apply a suggestion — assign the block to a different staff member, mark sick staff as Sick
        const applySuggestion = (block, targetStaffId) => {
          const wKey=wiso;
          const sKey=`${wKey}|${sickS.id}|${dayIdx}`;
          const tKey=`${wKey}|${targetStaffId}|${dayIdx}`;
          setLocations(prev=>prev.map(loc=>{
            if(loc.id!==activeLocId) return loc;
            const sched={...loc.schedule};
            // Replace the sick staff's block with Sick marker
            const sickCell=sched[sKey]||{blocks:[]};
            sched[sKey]={...sickCell,blocks:sickCell.blocks.map(b=>
              b.id===block.id?{...b,room:"Sick"}:b
            )};
            // Add the block to target staff's schedule
            const tCell=sched[tKey]||{blocks:[]};
            const newB={...block,id:uid(),reliefNote:`Covering for ${sickS.name}`,reliefs:[]};
            sched[tKey]={...tCell,blocks:sortBlocks([...tCell.blocks,newB])};
            return{...loc,schedule:sched};
          }));
        };

        // Mark all blocks as Sick (if no suggestions applied)
        const markAllSick = () => {
          const wKey=wiso;
          const sKey=`${wKey}|${sickS.id}|${dayIdx}`;
          setLocations(prev=>prev.map(loc=>{
            if(loc.id!==activeLocId) return loc;
            const sched={...loc.schedule};
            const cell=sched[sKey]||{blocks:[]};
            const sickStart=sickBlocks[0]?.startTime||"6:00 AM";
            const sickEnd=sickBlocks[sickBlocks.length-1]?.endTime||"6:00 PM";
            sched[sKey]={...cell,blocks:[{...newBlock(sickStart,sickEnd,"Sick"),id:Date.now()}]};
            return{...loc,schedule:sched};
          }));
          setSickModal(null);
        };

        return(
          <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:16}} onClick={e=>e.target===e.currentTarget&&setSickModal(null)}>
            <div style={{background:"white",borderRadius:22,width:600,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.3)"}}>
              {/* Header */}
              <div style={{background:"linear-gradient(135deg,#7C2D12,#C2410C)",padding:"20px 24px",borderRadius:"22px 22px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{color:"white",fontWeight:900,fontSize:18}}>🤒 Sick Day — {sickS.name}</div>
                  <div style={{color:"rgba(255,255,255,0.75)",fontSize:12,marginTop:3}}>{dayLabel} · {sickBlocks.length} block{sickBlocks.length!==1?"s":""} to cover</div>
                </div>
                <button onClick={()=>setSickModal(null)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16,color:"white",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>

              <div style={{padding:"20px 24px"}}>
                {sickBlocks.length===0?(
                  <div style={{textAlign:"center",padding:"30px 0",color:"#94A3B8"}}>
                    <div style={{fontSize:32,marginBottom:8}}>😌</div>
                    <div style={{fontSize:14,fontWeight:700}}>{sickS.name} has no shifts scheduled for {dayLabel}.</div>
                    <button onClick={()=>setSickModal(null)} style={{marginTop:16,padding:"9px 20px",borderRadius:10,border:"none",background:"#F1F5F9",color:"#475569",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
                  </div>
                ):(
                  <>
                    <div style={{fontSize:12,color:"#64748B",fontWeight:600,marginBottom:16}}>
                      Select a staff member to cover each block. Applying a suggestion will add that block to their schedule and mark {sickS.name.split(" ")[0]}'s shift as Sick.
                    </div>

                    {sickBlocks.map((block,bi)=>{
                      const c=rc(block.room);
                      const suggestions=getSuggestions(block);
                      const alreadyMarked=block.room==="Sick";
                      return(
                        <div key={block.id} style={{background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:14,padding:"14px 16px",marginBottom:12}}>
                          {/* Block header */}
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                            <div style={{background:c.bg,border:`1.5px solid ${c.border}`,borderRadius:7,padding:"4px 10px",fontSize:12,fontWeight:800,color:c.text}}>{block.room}</div>
                            <div style={{fontSize:12,fontWeight:700,color:"#475569"}}>{block.startTime} – {block.endTime}</div>
                            {alreadyMarked&&<span style={{fontSize:11,fontWeight:800,color:"#16A34A",background:"#DCFCE7",padding:"2px 8px",borderRadius:6}}>✓ Covered</span>}
                          </div>

                          {/* Suggestions */}
                          {!alreadyMarked&&(suggestions.length===0?(
                            <div style={{fontSize:12,color:"#94A3B8",fontStyle:"italic"}}>No available staff found for this time slot.</div>
                          ):(
                            <div style={{display:"flex",flexDirection:"column",gap:6}}>
                              {suggestions.map(({s,si,isScheduled,weekHrs})=>(
                                <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,background:"white",border:"1.5px solid #E2E8F0",borderRadius:10,padding:"8px 12px"}}>
                                  <div style={{width:28,height:28,borderRadius:"50%",background:getAvatarColor(si),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:"white",flexShrink:0}}>{initials(s.name)}</div>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:12,fontWeight:800,color:"#1E293B"}}>{s.name}</div>
                                    <div style={{display:"flex",gap:6,marginTop:2}}>
                                      {isScheduled
                                        ?<span style={{fontSize:10,fontWeight:700,color:"#1B4332",background:"#D1FAE5",borderRadius:5,padding:"1px 6px"}}>✓ Already working</span>
                                        :<span style={{fontSize:10,fontWeight:700,color:"#92400E",background:"#FEF3C7",borderRadius:5,padding:"1px 6px"}}>📞 Call-in</span>
                                      }
                                      <span style={{fontSize:10,color:"#64748B",fontWeight:600}}>{weekHrs}h this week</span>
                                    </div>
                                  </div>
                                  <button onClick={()=>applySuggestion(block,s.id)} style={{background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",border:"none",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                    Apply ✓
                                  </button>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    })}

                    <div style={{display:"flex",gap:10,marginTop:4}}>
                      <button onClick={markAllSick} style={{flex:1,padding:"11px 0",borderRadius:12,border:"2px solid #FED7AA",background:"#FFF7ED",color:"#C2410C",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                        🤒 Just mark {sickS.name.split(" ")[0]} sick (no replacements)
                      </button>
                      <button onClick={()=>setSickModal(null)} style={{padding:"11px 20px",borderRadius:12,border:"none",background:"#F1F5F9",color:"#475569",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Done</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── ATTENDANCE MODAL ── */}
      {showAttendance&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,30,20,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={e=>e.target===e.currentTarget&&setShowAttendance(false)}>
          <div style={{background:"white",borderRadius:22,padding:28,width:720,maxWidth:"100%",boxShadow:"0 24px 64px rgba(0,0,0,0.25)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:900,fontSize:22,color:"#1E293B"}}>👶 Expected Attendance — {weekLabel}</div>
              <button onClick={()=>setShowAttendance(false)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#64748B",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:20}}>Enter how many children you expect per room each day. This helps the AI verify staffing ratios.</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    <th style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:800,color:"#94A3B8",letterSpacing:"0.5px",borderBottom:"2px solid #F1F5F9",width:140}}>ROOM</th>
                    {DAY_SHORT.map((d,i)=>(
                      <th key={i} style={{padding:"10px 8px",textAlign:"center",fontSize:11,fontWeight:800,color:"#1E3A8A",letterSpacing:"0.5px",borderBottom:"2px solid #F1F5F9",minWidth:80}}>
                        {d}<div style={{fontSize:10,color:"#94A3B8",fontWeight:600}}>{formatDate(weekDates[i])}</div>
                      </th>
                    ))}
                    <th style={{padding:"10px 8px",textAlign:"center",fontSize:11,fontWeight:800,color:"#94A3B8",borderBottom:"2px solid #F1F5F9",width:60}}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room,ri)=>{
                    const c=COLOR_PALETTE[room.colorIdx%COLOR_PALETTE.length];
                    const isExcluded=attendanceExcluded.has(room.name);
                    const weekTotal=DAY_SHORT.reduce((sum,_,i)=>sum+(attendance[`${wiso}|${i}|${room.id}`]||0),0);
                    return(
                      <tr key={room.id} style={{borderBottom:"1px solid #F1F5F9",background:isExcluded?"#FAFAFA":ri%2===0?"white":"#FAFDF9",opacity:isExcluded?0.5:1}}>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{width:10,height:10,borderRadius:"50%",background:c.dot,flexShrink:0}}/>
                            <span style={{fontSize:13,fontWeight:800,color:c.text,textDecoration:isExcluded?"line-through":"none"}}>{room.name}</span>
                            <button
                              onClick={()=>setAttendanceExcluded(prev=>{const n=new Set(prev);n.has(room.name)?n.delete(room.name):n.add(room.name);return n;})}
                              style={{marginLeft:"auto",padding:"3px 10px",borderRadius:6,border:"none",background:isExcluded?"#F1F5F9":"#FEE2E2",color:isExcluded?"#64748B":"#DC2626",fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}
                            >
                              {isExcluded?"+ include":"× exclude"}
                            </button>
                          </div>
                          {room.capacity&&!isExcluded&&<div style={{fontSize:10,color:"#94A3B8",fontWeight:600,marginTop:2,paddingLeft:18}}>Cap: {room.capacity}{room.ratio?` · Ratio: ${room.ratio}`:""}</div>}
                        </td>
                        {DAY_SHORT.map((_,i)=>{
                          if(isExcluded) return <td key={i} style={{padding:"8px",textAlign:"center",color:"#CBD5E1",fontSize:12}}>—</td>;
                          const k=`${wiso}|${i}|${room.id}`;
                          const val=attendance[k]||"";
                          const overCap=room.capacity&&val>room.capacity;
                          return(
                            <td key={i} style={{padding:"8px",textAlign:"center"}}>
                              <input
                                type="number" min="0" max="99"
                                value={val}
                                onChange={e=>setAttendance(prev=>({...prev,[k]:e.target.value?parseInt(e.target.value):null}))}
                                placeholder="—"
                                style={{width:56,padding:"6px 8px",borderRadius:8,border:`2px solid ${overCap?"#EF4444":val?c.border:"#E2E8F0"}`,fontSize:13,fontWeight:700,textAlign:"center",outline:"none",fontFamily:"inherit",color:overCap?"#EF4444":c.text,background:overCap?"#FFF5F5":"white"}}
                              />
                              {overCap&&<div style={{fontSize:9,color:"#EF4444",fontWeight:800,marginTop:2}}>OVER CAP</div>}
                            </td>
                          );
                        })}
                        <td style={{padding:"8px",textAlign:"center",fontSize:13,fontWeight:900,color:weekTotal>0?"#1E3A8A":"#CBD5E1"}}>{isExcluded?"—":weekTotal||"—"}</td>
                      </tr>
                    );
                  })}
                  {/* Daily totals row */}
                  <tr style={{borderTop:"2px solid #E2E8F0",background:"#F8FAFC"}}>
                    <td style={{padding:"10px 14px",fontSize:11,fontWeight:800,color:"#94A3B8",letterSpacing:"0.5px"}}>DAILY TOTAL</td>
                    {DAY_SHORT.map((_,i)=>{
                      const dayTotal=rooms.filter(r=>!attendanceExcluded.has(r.name)).reduce((sum,room)=>{
                        const k=`${wiso}|${i}|${room.id}`;
                        return sum+(attendance[k]||0);
                      },0);
                      return <td key={i} style={{padding:"10px 8px",textAlign:"center",fontSize:14,fontWeight:900,color:dayTotal>0?"#1E3A8A":"#CBD5E1"}}>{dayTotal||"—"}</td>;
                    })}
                    <td style={{padding:"10px 8px",textAlign:"center",fontSize:14,fontWeight:900,color:"#1B4332"}}>
                      {rooms.filter(r=>!attendanceExcluded.has(r.name)).reduce((sum,room)=>sum+DAY_SHORT.reduce((s,_,i)=>s+(attendance[`${wiso}|${i}|${room.id}`]||0),0),0)||"—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button onClick={()=>setShowAttendance(false)} style={{marginTop:20,width:"100%",padding:13,borderRadius:12,border:"none",background:"linear-gradient(135deg,#1B4332,#40916C)",color:"white",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Done ✓</button>
          </div>
        </div>
      )}

    </div>
  );
}

