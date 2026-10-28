import { branchLabel, isOpen, esc, baht, money, thDate, thMonth, lastMonths, curMonth, statusChip, STATUS, debounce, $, $$ } from "../utils.js";
import { pageHeader, toast, friendlyError } from "../ui.js";
import { queryRequests } from "../data.js";

export default async function view(root, ctx) {
  const role = ctx.role;
  const st = { month: role === "accounting" ? "" : curMonth(), status: "", branchId: "", q: "", rows: [], loading: false };
  const branches = () => (role === "accounting" ? Object.values(ctx.summary || {}).filter((b) => b && b.id)
    : role === "approver" ? (ctx.regionBranches || []) : []).filter(isOpen).sort((a, b) => (a.id > b.id ? 1 : -1));

  root.innerHTML = pageHeader({
    title: role === "branch" ? "รายการของฉัน" : role === "approver" ? "ใบเบิกสาขาที่ดูแล" : "ใบเบิกทั้งหมด", live: false,
    crumb: "รายการใบเบิก",
    actions: role === "branch" ? `<a class="btn sky" href="#/new"><span class="material-symbols-outlined">add</span>ขอเบิก</a>` : "",
  }) + `
  <div class="card flat">
    <div class="filters" style="padding:1.25rem 1.5rem">
      <div class="field"><label>เดือน</label><select class="inp" id="m">${role === "accounting" ? `<option value="">ล่าสุด 100 รายการ</option>` : ""}${lastMonths(18).map((m) => `<option value="${m}" ${m === st.month ? "selected" : ""}>${thMonth(m)}</option>`).join("")}</select></div>
      <div class="field"><label>สถานะ</label><select class="inp" id="s"><option value="">ทุกสถานะ</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></div>
      ${role !== "branch" ? `<div class="field"><label>สาขา</label><select class="inp" id="b"><option value="">ทุกสาขา</option>${branches().map((b) => `<option value="${esc(b.id)}">${esc(branchLabel(b))}</option>`).join("")}</select></div>` : ""}
      <div class="field grow" style="min-width:200px"><label>ค้นหาในผลลัพธ์</label><div class="search"><span class="material-symbols-outlined">search</span><input class="inp" id="q" placeholder="เลขที่เอกสาร / ผู้ขอเบิก / สาขา"></div></div>
      <button class="btn ghost" id="rf"><span class="material-symbols-outlined">refresh</span>โหลดใหม่</button>
    </div>
    <div id="out"></div>
    <div class="pager"><span class="small muted" id="info"></span><span class="small muted">ใช้ Read ตามจำนวนรายการที่โหลด (สูงสุด 100)</span></div>
  </div>`;

  const paint = () => {
    const q = st.q.trim().toLowerCase();
    const rows = st.rows.filter((r) => !q || `${r.docNo} ${r.requesterName} ${r.branchName}`.toLowerCase().includes(q))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.updatedAt || 0) - (a.updatedAt || 0));
    $("#info").textContent = st.loading ? "กำลังโหลด…" : `แสดง ${rows.length} จาก ${st.rows.length} รายการ`;
    $("#out").innerHTML = st.loading ? `<div class="empty"><div class="spin" style="margin:0 auto 1rem"></div>กำลังโหลด…</div>` : rows.length ? `
      <div class="tbl-wrap mob-hide"><table class="tbl"><thead><tr><th>เลขที่เอกสาร</th><th>วันที่</th>${role !== "branch" ? "<th>สาขา</th>" : ""}<th>ผู้ขอเบิก</th><th class="c">รายการ</th><th class="r">ยอดรวม</th><th>สถานะ</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.docNo)}</b></td><td>${thDate(r.date)}</td>${role !== "branch" ? `<td>${esc(r.branchName)}</td>` : ""}<td>${esc(r.requesterName)}</td><td class="c">${r.items?.length || 0}</td><td class="r num"><b>${money(r.total)}</b></td><td>${statusChip(r.status)}</td></tr>`).join("")}</tbody></table></div>
      <div class="reqcards" style="padding:1rem">${rows.map((r) => `<div class="reqcard" data-id="${r.id}"><div class="row between"><b>${esc(r.docNo)}</b>${statusChip(r.status)}</div>
        <div class="small muted">${role !== "branch" ? esc(r.branchName) + " · " : ""}${thDate(r.date)}</div><b class="num" style="font-size:16px">${baht(r.total)}</b></div>`).join("")}</div>`
      : `<div class="empty"><span class="material-symbols-outlined">search_off</span>ไม่พบใบเบิก</div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => ctx.nav(`#/request/${el.dataset.id}`)));
  };
  const load = async () => {
    st.loading = true; paint();
    try {
      st.rows = await queryRequests({ role, region: ctx.profile.region, branchId: role === "branch" ? ctx.profile.branchId : st.branchId, month: st.month, status: st.status, lim: 100 });
    } catch (e) { console.error(e); toast(friendlyError(e), "err", 7000); st.rows = []; }
    st.loading = false; paint();
  };
  $("#m").onchange = (e) => { st.month = e.target.value; load(); };
  $("#s").onchange = (e) => { st.status = e.target.value; load(); };
  if ($("#b")) $("#b").onchange = (e) => { st.branchId = e.target.value; load(); };
  $("#q").oninput = debounce((e) => { if (!$("#out")) return; st.q = e.target.value; paint(); }, 150);
  $("#rf").onclick = load;
  load();
}
