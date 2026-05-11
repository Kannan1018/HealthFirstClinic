/* ═══════════════════════════════════════════════
   HealthFirst Clinic — app.js
   Firebase Firestore backend connected
═══════════════════════════════════════════════ */

// ── Firebase Config ──
const firebaseConfig = {
  apiKey: "AIzaSyBMHgnM0ThjDeOMmZAHuKOVjF14miU9Sgc",
  authDomain: "healthfirst-f218f.firebaseapp.com",
  projectId: "healthfirst-f218f",
  storageBucket: "healthfirst-f218f.firebasestorage.app",
  messagingSenderId: "98906953435",
  appId: "1:98906953435:web:64f4a9bb718bf93b795efe",
  measurementId: "G-3BP7ZNRD9M"
};

// ── Load Firebase from CDN (no npm needed) ──
let db = null;
let firebaseReady = false;

async function initFirebase() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore, collection, addDoc, getDocs, query, orderBy, where, serverTimestamp, onSnapshot } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseReady = true;
    window._fs = { collection, addDoc, getDocs, query, orderBy, where, serverTimestamp, onSnapshot };
    console.log("✅ Firebase connected");
    document.dispatchEvent(new Event("firebase-ready"));
  } catch (e) {
    console.error("Firebase init error:", e);
  }
}

initFirebase();

// ── Save a booking to Firestore ──
async function saveBooking(data) {
  if (!firebaseReady) return null;
  const { collection, addDoc, serverTimestamp } = window._fs;
  try {
    const ref = await addDoc(collection(db, "bookings"), {
      ...data,
      status: "confirmed",
      createdAt: serverTimestamp()
    });
    return ref.id;
  } catch (e) {
    console.error("Error saving booking:", e);
    return null;
  }
}

// ── Load all bookings ──
async function loadBookings(filterDate) {
  if (!firebaseReady) return [];
  const { collection, getDocs, query, orderBy, where } = window._fs;
  try {
    let q;
    if (filterDate) {
      q = query(collection(db, "bookings"), where("date", "==", filterDate), orderBy("createdAt", "desc"));
    } else {
      q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error loading bookings:", e);
    return [];
  }
}

// ── Update booking status ──
async function updateBookingStatus(id, status) {
  if (!firebaseReady) return;
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  try {
    await updateDoc(doc(db, "bookings", id), { status });
  } catch (e) {
    console.error("Error updating booking:", e);
  }
}

// ── NAV: scroll + burger ──
(function () {
  const nav = document.getElementById("mainNav");
  const burger = document.getElementById("burger");
  const mobileMenu = document.getElementById("mobileMenu");
  if (nav) window.addEventListener("scroll", () => nav.classList.toggle("scrolled", window.scrollY > 20));
  if (burger && mobileMenu) {
    burger.addEventListener("click", () => mobileMenu.classList.toggle("open"));
    document.addEventListener("click", e => { if (nav && !nav.contains(e.target)) mobileMenu.classList.remove("open"); });
  }
})();

// ── Scroll reveal ──
(function () {
  const style = document.createElement("style");
  style.textContent = `.reveal{opacity:0;transform:translateY(22px);transition:opacity .5s ease,transform .5s ease}.reveal.visible{opacity:1;transform:translateY(0)}`;
  document.head.appendChild(style);
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
  }, { threshold: 0.08 });
  document.querySelectorAll(".spec-card,.doc-card,.step-card,.review-card,.doc-list-card,.kpi-card,.big-kpi,.panel")
    .forEach(t => { t.classList.add("reveal"); io.observe(t); });
})();

function getParam(k) { return new URLSearchParams(window.location.search).get(k); }

/* ═══════════════════════════════════
   BOOKING PAGE
═══════════════════════════════════ */
if (document.getElementById("docList")) {

  const specParam = getParam("spec");
  const docParam  = getParam("doc");

  if (specParam) {
    const btn = Array.from(document.querySelectorAll(".sf-btn")).find(b => b.textContent.includes(specParam));
    if (btn) btn.click();
  }
  const docMap = { priya:"Dr. Priya Sharma", rahul:"Dr. Rahul Mehta", suman:"Dr. Suman Verma", arjun:"Dr. Arjun Patel" };
  if (docParam && docMap[docParam]) {
    setTimeout(() => {
      const card = Array.from(document.querySelectorAll(".doc-list-card"))
        .find(c => c.querySelector(".dli-name")?.textContent === docMap[docParam]);
      if (card) card.click();
    }, 150);
  }

  window.filterBySpec = function (btn, spec) {
    document.querySelectorAll(".sf-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".doc-list-card").forEach(card => {
      card.style.display = (spec === "All" || card.dataset.spec === spec) ? "flex" : "none";
    });
  };

  let selectedDoc = null;

  window.selectDoc = function (cardEl, name, avatar, spec, fee, cred, rating) {
    selectedDoc = { name, avatar, spec, fee, cred, rating };
    document.getElementById("doctorListView").style.display = "none";
    document.getElementById("bookingPanel").style.display   = "block";
    document.getElementById("successView").classList.remove("show");
    document.getElementById("bpAvatar").textContent = avatar;
    document.getElementById("bpName").textContent   = name;
    document.getElementById("bpSpec").textContent   = `${spec} · ₹${fee} · ★ ${rating}`;
    buildDatePicker();
    buildTimeSlots();
    updateSummaryPanel();
    document.getElementById("bookingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.backToList = function () {
    document.getElementById("doctorListView").style.display = "block";
    document.getElementById("bookingPanel").style.display   = "none";
    document.getElementById("successView").classList.remove("show");
    selectedDoc = null;
    document.getElementById("summaryPanel").innerHTML = "No appointment selected yet.<br>Choose a doctor and time slot to begin.";
  };

  const DAYS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MONTH_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  let selectedDateIdx = 0;

  function buildDatePicker() {
    const scroller = document.getElementById("dateScroller");
    if (!scroller) return;
    scroller.innerHTML = "";
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const chip = document.createElement("button");
      chip.className = "date-chip" + (i === selectedDateIdx ? " selected" : "");
      chip.innerHTML = `<span class="dc-day">${DAYS[d.getDay()]}</span><span class="dc-num">${d.getDate()}</span>`;
      chip.addEventListener("click", () => { selectedDateIdx = i; buildDatePicker(); buildTimeSlots(); updateSummaryPanel(); });
      scroller.appendChild(chip);
    }
  }

  const ALL_SLOTS    = ["9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM","12:00 PM","2:00 PM","2:30 PM","3:00 PM","3:30 PM","4:00 PM","4:30 PM","5:00 PM"];
  const BOOKED_SLOTS = { 0:["9:00 AM","10:00 AM","12:00 PM"], 1:["9:30 AM","11:00 AM"], 2:[] };
  let selectedSlot = "11:00 AM";

  function buildTimeSlots() {
    const grid = document.getElementById("timeGrid");
    if (!grid) return;
    const booked = BOOKED_SLOTS[selectedDateIdx] || [];
    grid.innerHTML = "";
    ALL_SLOTS.forEach(slot => {
      const isBooked = booked.includes(slot);
      const btn = document.createElement("button");
      btn.className = "time-slot" + (isBooked ? " booked" : slot === selectedSlot ? " selected" : "");
      btn.textContent = slot;
      if (!isBooked) btn.addEventListener("click", () => { selectedSlot = slot; buildTimeSlots(); updateSummaryPanel(); });
      grid.appendChild(btn);
    });
  }

  function updateSummaryPanel() {
    if (!selectedDoc) return;
    const today = new Date(); const d = new Date(today); d.setDate(today.getDate() + selectedDateIdx);
    const dateStr = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    document.getElementById("summaryPanel").innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        <div><span style="font-weight:700;color:var(--navy)">${selectedDoc.name}</span></div>
        <div style="color:var(--teal);font-weight:600">${selectedDoc.spec}</div>
        <div>📅 ${dateStr} · ${selectedSlot}</div>
        <div>💰 Fee: <strong>₹${selectedDoc.fee}</strong></div>
      </div>`;
    const sb = document.getElementById("bookingSummary");
    if (sb) {
      sb.style.display = "block";
      document.getElementById("sumDoc").textContent      = selectedDoc.name;
      document.getElementById("sumSpec").textContent     = selectedDoc.spec;
      document.getElementById("sumDateTime").textContent = `${dateStr} · ${selectedSlot}`;
      document.getElementById("sumFee").textContent      = `₹${selectedDoc.fee}`;
    }
  }

  window.confirmBooking = async function () {
    const name   = document.getElementById("pName")?.value.trim();
    const phone  = document.getElementById("pPhone")?.value.trim();
    const age    = document.getElementById("pAge")?.value.trim();
    const gender = document.getElementById("pGender")?.value;
    const reason = document.getElementById("pReason")?.value.trim();

    if (!name || !phone) { alert("Please fill in your name and phone number."); return; }
    if (phone.length < 10) { alert("Please enter a valid 10-digit phone number."); return; }

    const confirmBtn = document.getElementById("confirmBtn");
    confirmBtn.textContent = "Saving...";
    confirmBtn.disabled = true;

    const today = new Date(); const d = new Date(today); d.setDate(today.getDate() + selectedDateIdx);
    const dateStr     = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`;
    const dateKey     = d.toISOString().split("T")[0];
    const token       = "#" + String(Math.floor(Math.random() * 900) + 100);

    const bookingData = {
      patientName: name, phone, age, gender, reason,
      doctor: selectedDoc.name, specialty: selectedDoc.spec,
      fee: selectedDoc.fee, date: dateKey, dateDisplay: dateStr,
      slot: selectedSlot, token
    };

    // Save to Firebase
    const savedId = await saveBooking(bookingData);

    confirmBtn.textContent = "Confirm Appointment →";
    confirmBtn.disabled = false;

    // Show success
    document.getElementById("bookingPanel").style.display = "none";
    const sv = document.getElementById("successView");
    sv.classList.add("show");
    document.getElementById("tokenNum").textContent = token;
    document.getElementById("successBody").innerHTML = `
      <strong>${name}</strong>, your appointment with <strong>${selectedDoc.name}</strong> (${selectedDoc.spec}) is confirmed.<br><br>
      📅 <strong>${dateStr}</strong> at <strong>${selectedSlot}</strong><br>
      💰 Consultation fee: <strong>₹${selectedDoc.fee}</strong> (pay at clinic)<br><br>
      📲 SMS confirmation sent to <strong>${phone}</strong><br>
      ⏰ Please arrive 10 minutes before your slot.<br>
      🆔 Bring any previous prescriptions or reports.<br><br>
      ${savedId ? `<span style="color:var(--green);font-size:12px">✅ Booking saved (ID: ${savedId.slice(0,8)}...)</span>` : ""}
    `;
    sv.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.bookAnother = function () {
    document.getElementById("successView").classList.remove("show");
    document.getElementById("doctorListView").style.display = "block";
    selectedDoc = null; selectedDateIdx = 0; selectedSlot = "11:00 AM";
    document.getElementById("summaryPanel").innerHTML = "No appointment selected yet.<br>Choose a doctor and time slot to begin.";
  };
}

/* ═══════════════════════════════════
   DOCTOR DASHBOARD — load real bookings
═══════════════════════════════════ */
if (document.getElementById("queue-upcoming")) {
  document.addEventListener("firebase-ready", loadTodayQueue);

  async function loadTodayQueue() {
    const today = new Date().toISOString().split("T")[0];
    const bookings = await loadBookings(today);
    const container = document.getElementById("queue-upcoming");

    if (bookings.length === 0) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No bookings yet for today. <br><br><a href="book.html" style="color:var(--teal);font-weight:600">View booking page →</a></div>`;
      return;
    }

    container.innerHTML = bookings
      .filter(b => b.status === "confirmed")
      .map((b, i) => `
        <div class="appt-item" id="appt-${b.id}">
          <div class="ai-token">${i + 1}</div>
          <div class="ai-info">
            <div class="ai-name">${b.patientName} · ${b.gender || ""}, ${b.age || ""}</div>
            <div class="ai-detail">${b.slot} · ${b.reason || "General consultation"} · Token ${b.token}</div>
          </div>
          <div class="ai-actions">
            <button class="ai-btn done" onclick="markDone('${b.id}')">✓ Done</button>
            <button class="ai-btn cancel" onclick="cancelAppt('${b.id}')">✗ Cancel</button>
          </div>
        </div>`).join("");

    // Update queue count
    const countEl = document.getElementById("waitingCount");
    if (countEl) countEl.textContent = bookings.filter(b => b.status === "confirmed").length;
    const kpiEl = document.getElementById("kpiToday");
    if (kpiEl) kpiEl.textContent = bookings.length;
  }

  window.markDone = async function (id) {
    await updateBookingStatus(id, "done");
    const row = document.getElementById("appt-" + id);
    if (row) row.querySelector(".ai-actions").innerHTML = '<span class="status-badge sb-done">✓ Done</span>';
  };

  window.cancelAppt = async function (id) {
    await updateBookingStatus(id, "cancelled");
    const row = document.getElementById("appt-" + id);
    if (row) { row.style.opacity = "0.5"; row.querySelector(".ai-actions").innerHTML = '<span class="status-badge sb-cancelled">Cancelled</span>'; }
  };
}

/* ═══════════════════════════════════
   ADMIN PANEL — load real data
═══════════════════════════════════ */
if (document.getElementById("recentBookingsTable")) {
  document.addEventListener("firebase-ready", loadAdminData);

  async function loadAdminData() {
    const bookings = await loadBookings();

    // Recent bookings table
    const table = document.getElementById("recentBookingsTable");
    if (table) {
      if (bookings.length === 0) {
        table.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No bookings yet. Share your booking page to get started!</div>`;
      } else {
        table.innerHTML = bookings.slice(0, 20).map(b => `
          <div class="appt-item">
            <div class="ai-token" style="font-size:11px;background:var(--blue-l);color:var(--blue);width:36px;height:36px">${b.patientName?.slice(0,2).toUpperCase()}</div>
            <div class="ai-info">
              <div class="ai-name">${b.patientName} → ${b.doctor}</div>
              <div class="ai-detail">${b.specialty} · ${b.dateDisplay} ${b.slot} · ₹${b.fee} · Token ${b.token}</div>
            </div>
            <span class="status-badge ${b.status === "done" ? "sb-done" : b.status === "cancelled" ? "sb-cancelled" : "sb-waiting"}">${b.status}</span>
          </div>`).join("");
      }
    }

    // Update KPIs
    const thisMonth = bookings.filter(b => {
      if (!b.date) return false;
      const d = new Date(b.date); const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const revenue = thisMonth.reduce((s, b) => s + (parseInt(b.fee) || 0), 0);
    const el = id => document.getElementById(id);
    if (el("adminTotalBookings")) el("adminTotalBookings").textContent = thisMonth.length;
    if (el("adminRevenue"))       el("adminRevenue").textContent = "₹" + revenue.toLocaleString("hi-IN");
    if (el("adminTotalAll"))      el("adminTotalAll").textContent = bookings.length;
  }
}

// Home page smooth scroll
if (document.querySelector(".hero")) {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const t = document.querySelector(a.getAttribute("href"));
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
