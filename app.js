/* ═══════════════════════════════════════════════
   HealthFirst — app.js
   ✅ Live ratings from Firebase
   ✅ Feedback form after appointment done
   ✅ Direct Razorpay on Book click (no pay at clinic choice on click — Razorpay opens immediately)
   ✅ Real-time slot availability
═══════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: "AIzaSyBMHgnM0ThjDeOMmZAHuKOVjF14miU9Sgc",
  authDomain: "healthfirst-f218f.firebaseapp.com",
  projectId: "healthfirst-f218f",
  storageBucket: "healthfirst-f218f.firebasestorage.app",
  messagingSenderId: "98906953435",
  appId: "1:98906953435:web:64f4a9bb718bf93b795efe",
  measurementId: "G-3BP7ZNRD9M"
};

const RAZORPAY_KEY = "rzp_test_SokQ6RRs3wd0oH";

let db = null;
let firebaseReady = false;

async function initFirebase() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore, collection, addDoc, getDocs, updateDoc, doc, query, orderBy, where, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseReady = true;
    window._fs = { collection, addDoc, getDocs, updateDoc, doc, query, orderBy, where, serverTimestamp };
    console.log("✅ Firebase connected");
    document.dispatchEvent(new Event("firebase-ready"));
  } catch (e) {
    console.error("Firebase init error:", e);
  }
}
initFirebase();

// ── Firebase helpers ──
async function saveBooking(data) {
  if (!firebaseReady) return null;
  const { collection, addDoc, serverTimestamp } = window._fs;
  try {
    const ref = await addDoc(collection(db, "bookings"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  } catch (e) { console.error("saveBooking:", e); return null; }
}

async function saveFeedback(data) {
  if (!firebaseReady) return null;
  const { collection, addDoc, serverTimestamp } = window._fs;
  try {
    const ref = await addDoc(collection(db, "reviews"), { ...data, createdAt: serverTimestamp() });
    return ref.id;
  } catch (e) { console.error("saveFeedback:", e); return null; }
}

async function loadBookings(filterDate) {
  if (!firebaseReady) return [];
  const { collection, getDocs, query, orderBy, where } = window._fs;
  try {
    const q = filterDate
      ? query(collection(db, "bookings"), where("date", "==", filterDate))
      : query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error("loadBookings:", e); return []; }
}

async function loadReviews() {
  if (!firebaseReady) return [];
  const { collection, getDocs, query, orderBy } = window._fs;
  try {
    const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error("loadReviews:", e); return []; }
}

async function getBookedSlots(doctorName, dateKey) {
  if (!firebaseReady) return [];
  const { collection, getDocs, query, where } = window._fs;
  try {
    const q = query(collection(db, "bookings"), where("doctorDate", "==", doctorName + "_" + dateKey));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data()).filter(b => b.status !== "cancelled").map(b => b.slot);
  } catch (e) { console.error("getBookedSlots:", e); return []; }
}

async function updateBookingStatus(id, status) {
  if (!firebaseReady) return;
  const { doc, updateDoc } = window._fs;
  try { await updateDoc(doc(db, "bookings", id), { status }); }
  catch (e) { console.error("updateStatus:", e); }
}

function loadRazorpay() {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

// ── NAV ──
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
   HOME PAGE — Live Reviews
═══════════════════════════════════ */
if (document.getElementById("liveReviewsGrid")) {
  document.addEventListener("firebase-ready", loadLiveReviews);

  async function loadLiveReviews() {
    const grid = document.getElementById("liveReviewsGrid");
    const reviews = await loadReviews();

    if (reviews.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:32px 16px;color:var(--navy-m)">
          <div style="font-size:40px;margin-bottom:12px">💬</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:6px">No reviews yet</div>
          <div style="font-size:14px">Be the first to share your experience after your appointment!</div>
        </div>`;
      return;
    }

    const stars = r => "★".repeat(r) + "☆".repeat(5 - r);

    grid.innerHTML = reviews.slice(0, 6).map(r => `
      <div class="review-card">
        <div class="review-stars" style="color:#F59E0B;font-size:18px;margin-bottom:10px">${stars(r.rating || 5)}</div>
        <p class="review-text" style="font-size:15px;color:var(--navy-m);line-height:1.7;margin-bottom:16px;font-style:italic">"${r.comment}"</p>
        <div class="review-author" style="display:flex;align-items:center;gap:12px">
          <div class="review-avatar" style="width:40px;height:40px;border-radius:50%;background:var(--teal-l);color:var(--teal-d);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">
            ${(r.patientName || "P").slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--navy)">${r.patientName || "Patient"}</div>
            <div style="font-size:12px;color:var(--navy-m);margin-top:2px">Visited ${r.doctor} · ${r.specialty || ""}</div>
          </div>
        </div>
      </div>`).join("");
  }
}

/* ═══════════════════════════════════
   BOOKING PAGE
═══════════════════════════════════ */
if (document.getElementById("docList")) {

  // Inject styles for pay option modal + feedback modal
  const extraStyles = document.createElement("style");
  extraStyles.textContent = `
    /* Pay option modal */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,.55);
      display: flex; align-items: flex-end; justify-content: center;
      z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .2s;
    }
    .modal-overlay.open { opacity: 1; pointer-events: all; }
    .modal-sheet {
      background: white; border-radius: 24px 24px 0 0; padding: 28px 24px 36px;
      width: 100%; max-width: 480px;
      transform: translateY(60px); transition: transform .25s cubic-bezier(.34,1.2,.64,1);
    }
    .modal-overlay.open .modal-sheet { transform: translateY(0); }
    .modal-handle { width: 40px; height: 4px; background: var(--border-md); border-radius: 2px; margin: 0 auto 20px; }
    .modal-title { font-family: var(--ff-d); font-size: 20px; font-weight: 700; color: var(--navy); margin-bottom: 6px; }
    .modal-sub { font-size: 14px; color: var(--navy-m); margin-bottom: 22px; }
    .pay-btn-row { display: flex; flex-direction: column; gap: 10px; }
    .pay-choice {
      padding: 16px 20px; border-radius: var(--r-lg); border: 2px solid var(--border);
      font-size: 15px; font-weight: 700; font-family: var(--ff);
      cursor: pointer; display: flex; align-items: center; gap: 14px; text-align: left;
      transition: all .18s; background: white;
    }
    .pay-choice:hover { border-color: var(--teal); background: var(--teal-l); }
    .pay-choice-icon { font-size: 28px; flex-shrink: 0; }
    .pay-choice-text small { display: block; font-size: 12px; font-weight: 400; color: var(--navy-m); margin-top: 3px; }
    .pay-choice.primary { background: var(--teal); border-color: var(--teal); color: white; }
    .pay-choice.primary small { color: rgba(255,255,255,.8); }
    .pay-choice.primary:hover { background: var(--teal-d); }

    /* Feedback modal */
    .feedback-overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .2s;
      padding: 20px;
    }
    .feedback-overlay.open { opacity: 1; pointer-events: all; }
    .feedback-box {
      background: white; border-radius: 20px; padding: 28px 24px;
      width: 100%; max-width: 420px;
      transform: scale(.92); transition: transform .25s cubic-bezier(.34,1.2,.64,1);
    }
    .feedback-overlay.open .feedback-box { transform: scale(1); }
    .fb-title { font-family: var(--ff-d); font-size: 20px; font-weight: 700; color: var(--navy); margin-bottom: 6px; }
    .fb-sub { font-size: 14px; color: var(--navy-m); margin-bottom: 20px; }
    .star-picker { display: flex; gap: 8px; margin-bottom: 16px; }
    .star-pick { font-size: 32px; cursor: pointer; filter: grayscale(1); transition: filter .15s, transform .15s; }
    .star-pick.lit { filter: none; }
    .star-pick:hover { transform: scale(1.15); }
    .fb-textarea { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border-md); border-radius: var(--r); font-size: 14px; font-family: var(--ff); color: var(--navy); background: var(--bg); outline: none; resize: vertical; min-height: 80px; margin-bottom: 14px; transition: border-color .15s; }
    .fb-textarea:focus { border-color: var(--teal); }
    .fb-submit { width: 100%; background: var(--teal); color: white; border: none; border-radius: var(--r-lg); padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: var(--ff); transition: all .18s; }
    .fb-submit:hover { background: var(--teal-d); }
    .fb-skip { width: 100%; background: none; border: none; color: var(--navy-m); font-size: 13px; font-family: var(--ff); cursor: pointer; margin-top: 10px; text-decoration: underline; }
  `;
  document.head.appendChild(extraStyles);

  // ── Pay option modal HTML ──
  const payModal = document.createElement("div");
  payModal.className = "modal-overlay";
  payModal.id = "payModal";
  payModal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Choose Payment Method</div>
      <div class="modal-sub" id="payModalSub">Appointment with Dr. — on —</div>
      <div class="pay-btn-row">
        <button class="pay-choice primary" onclick="processPayment('online')">
          <span class="pay-choice-icon">💳</span>
          <span class="pay-choice-text">
            Pay Online Now
            <small>Secure payment · Instant confirmation · Razorpay</small>
          </span>
        </button>
        <button class="pay-choice" onclick="processPayment('clinic')">
          <span class="pay-choice-icon">🏥</span>
          <span class="pay-choice-text">
            Pay at Clinic
            <small>Cash or card on arrival · Slot reserved for you</small>
          </span>
        </button>
      </div>
      <div style="margin-top:14px;font-size:12px;color:var(--navy-m);text-align:center">🔒 Payments processed securely by Razorpay</div>
      <button onclick="closePayModal()" style="width:100%;background:none;border:none;color:var(--navy-m);font-size:13px;font-family:var(--ff);cursor:pointer;margin-top:12px;text-decoration:underline">Cancel</button>
    </div>`;
  document.body.appendChild(payModal);

  // ── Feedback modal HTML ──
  const fbModal = document.createElement("div");
  fbModal.className = "feedback-overlay";
  fbModal.id = "fbModal";
  fbModal.innerHTML = `
    <div class="feedback-box">
      <div style="font-size:36px;text-align:center;margin-bottom:12px">🌟</div>
      <div class="fb-title" style="text-align:center">How was your visit?</div>
      <div class="fb-sub" style="text-align:center" id="fbModalSub">Share your experience with Dr. —</div>
      <div class="star-picker" id="starPicker">
        <span class="star-pick" data-val="1" onclick="pickStar(1)">⭐</span>
        <span class="star-pick" data-val="2" onclick="pickStar(2)">⭐</span>
        <span class="star-pick" data-val="3" onclick="pickStar(3)">⭐</span>
        <span class="star-pick" data-val="4" onclick="pickStar(4)">⭐</span>
        <span class="star-pick" data-val="5" onclick="pickStar(5)">⭐</span>
      </div>
      <textarea class="fb-textarea" id="fbComment" placeholder="Tell us about your experience (optional)..."></textarea>
      <button class="fb-submit" onclick="submitFeedback()">Submit Review</button>
      <button class="fb-skip" onclick="closeFbModal()">Skip for now</button>
    </div>`;
  document.body.appendChild(fbModal);

  // Pay modal state
  let pendingBookingData = null;
  let selectedRating = 5;
  let completedBookingForFeedback = null;

  window.closePayModal = function () {
    document.getElementById("payModal").classList.remove("open");
  };
  window.closeFbModal = function () {
    document.getElementById("fbModal").classList.remove("open");
  };

  // Star picker
  window.pickStar = function (val) {
    selectedRating = val;
    document.querySelectorAll(".star-pick").forEach(s => {
      s.classList.toggle("lit", parseInt(s.dataset.val) <= val);
    });
  };
  // Pre-light 5 stars
  setTimeout(() => pickStar(5), 100);

  // Specialty filter
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

  let selectedDoc     = null;
  let selectedSlot    = null;
  let selectedDateIdx = 0;

  window.selectDoc = function (cardEl, name, avatar, spec, fee, cred) {
    selectedDoc = { name, avatar, spec, fee, cred };
    document.getElementById("doctorListView").style.display = "none";
    document.getElementById("bookingPanel").style.display   = "block";
    document.getElementById("successView").classList.remove("show");
    document.getElementById("bpAvatar").textContent = avatar;
    document.getElementById("bpName").textContent   = name;
    document.getElementById("bpSpec").textContent   = `${spec} · ₹${fee}`;
    selectedSlot = null; selectedDateIdx = 0;
    buildDatePicker(); buildTimeSlots(); updateSummaryPanel();
    document.getElementById("bookingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.backToList = function () {
    document.getElementById("doctorListView").style.display = "block";
    document.getElementById("bookingPanel").style.display   = "none";
    document.getElementById("successView").classList.remove("show");
    selectedDoc = null;
    document.getElementById("summaryPanel").innerHTML = "No appointment selected yet.<br>Choose a doctor and time slot to begin.";
  };

  const DAYS       = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MONTHS     = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MONTH_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function getSelectedDateKey() {
    const d = new Date(); d.setDate(d.getDate() + selectedDateIdx);
    return d.toISOString().split("T")[0];
  }

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
      chip.addEventListener("click", () => {
        selectedDateIdx = i; selectedSlot = null;
        buildDatePicker(); buildTimeSlots(); updateSummaryPanel();
      });
      scroller.appendChild(chip);
    }
  }

  const ALL_SLOTS = ["9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
                     "12:00 PM","2:00 PM","2:30 PM","3:00 PM","3:30 PM","4:00 PM","4:30 PM","5:00 PM"];

  async function buildTimeSlots() {
    const grid = document.getElementById("timeGrid");
    if (!grid) return;
    grid.innerHTML = `<div style="grid-column:1/-1;padding:14px;text-align:center;font-size:13px;color:var(--navy-m)">⏳ Checking available slots...</div>`;
    let bookedSlots = [];
    if (selectedDoc) bookedSlots = await getBookedSlots(selectedDoc.name, getSelectedDateKey());
    grid.innerHTML = "";
    ALL_SLOTS.forEach(slot => {
      const isBooked = bookedSlots.includes(slot);
      const btn = document.createElement("button");
      btn.className = "time-slot" + (isBooked ? " booked" : slot === selectedSlot ? " selected" : "");
      btn.textContent = isBooked ? slot + " ✕" : slot;
      btn.disabled = isBooked;
      btn.title = isBooked ? "Already booked" : "Select this slot";
      if (!isBooked) {
        btn.addEventListener("click", () => {
          selectedSlot = slot;
          grid.querySelectorAll(".time-slot").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          updateSummaryPanel();
        });
      }
      grid.appendChild(btn);
    });
  }

  function updateSummaryPanel() {
    if (!selectedDoc) return;
    const today = new Date(); const d = new Date(today); d.setDate(today.getDate() + selectedDateIdx);
    const dateStr = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    document.getElementById("summaryPanel").innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        <div><strong style="color:var(--navy)">${selectedDoc.name}</strong></div>
        <div style="color:var(--teal);font-weight:600">${selectedDoc.spec}</div>
        <div>📅 ${dateStr} · ${selectedSlot || "<em>No slot selected</em>"}</div>
        <div>💰 Fee: <strong>₹${selectedDoc.fee}</strong></div>
      </div>`;
    const sb = document.getElementById("bookingSummary");
    if (sb) {
      sb.style.display = "block";
      document.getElementById("sumDoc").textContent      = selectedDoc.name;
      document.getElementById("sumSpec").textContent     = selectedDoc.spec;
      document.getElementById("sumDateTime").textContent = `${dateStr} · ${selectedSlot || "—"}`;
      document.getElementById("sumFee").textContent      = `₹${selectedDoc.fee}`;
    }
  }

  // ── Validate form ──
  async function validateAndBuild() {
    const name   = document.getElementById("pName")?.value.trim();
    const phone  = document.getElementById("pPhone")?.value.trim();
    const age    = document.getElementById("pAge")?.value.trim();
    const gender = document.getElementById("pGender")?.value;
    const reason = document.getElementById("pReason")?.value.trim();

    if (!name)                       { alert("Please enter your name.");                     return null; }
    if (!phone || phone.length < 10) { alert("Please enter a valid 10-digit phone number."); return null; }
    if (!selectedSlot)               { alert("Please select a time slot.");                  return null; }

    const today = new Date(); const d = new Date(today); d.setDate(today.getDate() + selectedDateIdx);
    const dateStr = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`;
    const dateKey = getSelectedDateKey();
    const token   = "#" + String(Math.floor(Math.random() * 900) + 100);

    // Check slot still available
    const stillBooked = await getBookedSlots(selectedDoc.name, dateKey);
    if (stillBooked.includes(selectedSlot)) {
      alert("⚠️ This slot was just taken! Please pick another.");
      selectedSlot = null; buildTimeSlots(); return null;
    }

    return { name, phone, age, gender, reason, dateStr, dateKey, token };
  }

  // ── Confirm button → open pay modal ──
  window.confirmBooking = async function () {
    const formData = await validateAndBuild();
    if (!formData) return;
    pendingBookingData = formData;

    // Show pay modal
    document.getElementById("payModalSub").textContent =
      `${selectedDoc.name} · ${formData.dateStr} · ${selectedSlot} · ₹${selectedDoc.fee}`;
    document.getElementById("payModal").classList.add("open");
  };

  // ── Process payment choice ──
  window.processPayment = async function (method) {
    closePayModal();
    if (method === "online") {
      await openRazorpay(pendingBookingData);
    } else {
      await finalizeBooking(pendingBookingData, "confirmed", "pay_at_clinic", null);
    }
  };

  // ── Razorpay checkout ──
  async function openRazorpay(formData) {
    const loaded = await loadRazorpay();
    if (!loaded) {
      alert("Payment gateway failed to load. Please choose 'Pay at Clinic'.");
      document.getElementById("payModal").classList.add("open");
      return;
    }

    const options = {
      key: RAZORPAY_KEY,
      amount: parseInt(selectedDoc.fee) * 100,
      currency: "INR",
      name: "HealthFirst",
      description: `${selectedDoc.name} · ${formData.dateStr} · ${selectedSlot}`,
      image: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏥</text></svg>",
      prefill: { name: formData.name, contact: formData.phone },
      notes: { doctor: selectedDoc.name, date: formData.dateStr, slot: selectedSlot, token: formData.token },
      theme: { color: "#0D9488" },
      handler: async function (response) {
        await finalizeBooking(formData, "confirmed", "paid_online", {
          razorpay_payment_id: response.razorpay_payment_id,
          amount: selectedDoc.fee
        });
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", function (r) {
      alert("❌ Payment failed: " + r.error.description + "\n\nYou can still book by choosing 'Pay at Clinic'.");
      document.getElementById("payModal").classList.add("open");
    });
    rzp.open();
  }

  // ── Save booking + show success ──
  async function finalizeBooking(formData, status, paymentMethod, paymentDetails) {
    const savedId = await saveBooking({
      patientName:    formData.name,
      phone:          formData.phone,
      age:            formData.age,
      gender:         formData.gender,
      reason:         formData.reason,
      doctor:         selectedDoc.name,
      specialty:      selectedDoc.spec,
      fee:            selectedDoc.fee,
      date:           formData.dateKey,
      dateDisplay:    formData.dateStr,
      slot:           selectedSlot,
      token:          formData.token,
      doctorDate:     selectedDoc.name + "_" + formData.dateKey,
      status,
      paymentMethod,
      paymentDetails: paymentDetails || {}
    });

    // Store for feedback
    completedBookingForFeedback = {
      bookingId: savedId,
      patientName: formData.name,
      doctor: selectedDoc.name,
      specialty: selectedDoc.spec
    };

    const isPaid = paymentMethod === "paid_online";

    document.getElementById("bookingPanel").style.display = "none";
    const sv = document.getElementById("successView");
    sv.classList.add("show");
    document.getElementById("tokenNum").textContent = formData.token;
    document.getElementById("successBody").innerHTML = `
      <strong>${formData.name}</strong>, your appointment with
      <strong>${selectedDoc.name}</strong> (${selectedDoc.spec}) is confirmed.<br><br>
      📅 <strong>${formData.dateStr}</strong> at <strong>${selectedSlot}</strong><br>
      💰 Fee: <strong>₹${selectedDoc.fee}</strong> —
      ${isPaid
        ? `<span style="color:var(--green);font-weight:600">✅ Paid online${paymentDetails?.razorpay_payment_id ? ` · ${paymentDetails.razorpay_payment_id}` : ""}</span>`
        : `<span style="color:var(--amber);font-weight:600">🏥 Pay at clinic on arrival</span>`
      }<br><br>
      📲 Confirmation sent to <strong>${formData.phone}</strong><br>
      ⏰ Please arrive 10 minutes before your slot.<br>
      🆔 Bring any previous prescriptions or reports.
    `;
    sv.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.bookAnother = function () {
    document.getElementById("successView").classList.remove("show");
    document.getElementById("doctorListView").style.display = "block";
    selectedDoc = null; selectedDateIdx = 0; selectedSlot = null;
    document.getElementById("summaryPanel").innerHTML = "No appointment selected yet.<br>Choose a doctor and time slot to begin.";
  };

  document.addEventListener("firebase-ready", () => {
    if (selectedDoc) buildTimeSlots();
  });

  // ── Feedback submission ──
  window.submitFeedback = async function () {
    if (!completedBookingForFeedback) { closeFbModal(); return; }
    const comment = document.getElementById("fbComment")?.value.trim();
    if (!comment && selectedRating === 5) {
      // Allow empty comment with 5 stars
    }
    await saveFeedback({
      bookingId:   completedBookingForFeedback.bookingId,
      patientName: completedBookingForFeedback.patientName,
      doctor:      completedBookingForFeedback.doctor,
      specialty:   completedBookingForFeedback.specialty,
      rating:      selectedRating,
      comment:     comment || "Great experience!"
    });
    closeFbModal();
    alert("✅ Thank you for your feedback! It helps other patients choose the right doctor.");
  };
}

/* ═══════════════════════════════════
   DOCTOR DASHBOARD
   — Mark Done → triggers feedback SMS link
═══════════════════════════════════ */
if (document.getElementById("queue-upcoming")) {
  document.addEventListener("firebase-ready", loadTodayQueue);

  async function loadTodayQueue() {
    const today = new Date().toISOString().split("T")[0];
    const bookings = await loadBookings(today);
    const container = document.getElementById("queue-upcoming");

    if (bookings.length === 0) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No bookings for today yet.<br><br><a href="book.html" style="color:var(--teal);font-weight:600">Go to booking page →</a></div>`;
      return;
    }

    container.innerHTML = bookings
      .filter(b => b.status === "confirmed")
      .map((b, i) => `
        <div class="appt-item" id="appt-${b.id}">
          <div class="ai-token">${i + 1}</div>
          <div class="ai-info">
            <div class="ai-name">${b.patientName} · ${b.gender || ""}, ${b.age || ""}</div>
            <div class="ai-detail">
              ${b.slot} · ${b.reason || "General consultation"} · Token ${b.token}
              &nbsp;<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px;${
                b.paymentMethod === "paid_online"
                  ? "background:#ECFDF5;color:#065F46"
                  : "background:#FFF3E0;color:#E65100"
              }">${b.paymentMethod === "paid_online" ? "✅ Paid" : "🏥 Pay at clinic"}</span>
            </div>
          </div>
          <div class="ai-actions">
            <button class="ai-btn done" onclick="markDone('${b.id}','${b.patientName}','${b.phone || ""}')">✓ Done</button>
            <button class="ai-btn cancel" onclick="cancelAppt('${b.id}')">✗ Cancel</button>
          </div>
        </div>`).join("");

    const countEl = document.getElementById("waitingCount");
    if (countEl) countEl.textContent = bookings.filter(b => b.status === "confirmed").length;
    const kpiEl = document.getElementById("kpiToday");
    if (kpiEl) kpiEl.textContent = bookings.length;
  }

  // Mark done → send WhatsApp feedback link to patient
  window.markDone = async function (id, patientName, phone) {
    await updateBookingStatus(id, "done");
    const row = document.getElementById("appt-" + id);
    if (row) row.querySelector(".ai-actions").innerHTML = '<span class="status-badge sb-done">✓ Done</span>';

    // Send WhatsApp feedback link if phone available
    if (phone && phone.length >= 10) {
      const feedbackUrl = `${window.location.origin}/book.html?feedback=${id}`;
      const msg = encodeURIComponent(`Hi ${patientName}! Thank you for visiting HealthFirst today. Please share your feedback: ${feedbackUrl}`);
      // Open WhatsApp in new tab for doctor to send
      const waLink = `https://wa.me/91${phone}?text=${msg}`;
      const sendWA = confirm(`✅ Appointment marked as done!\n\nSend a WhatsApp feedback request to ${patientName}?`);
      if (sendWA) window.open(waLink, "_blank");
    }
  };

  window.cancelAppt = async function (id) {
    await updateBookingStatus(id, "cancelled");
    const row = document.getElementById("appt-" + id);
    if (row) { row.style.opacity = "0.5"; row.querySelector(".ai-actions").innerHTML = '<span class="status-badge sb-cancelled">Cancelled</span>'; }
  };

  // Check if patient came via feedback link
  const fbParam = getParam("feedback");
  if (fbParam) {
    document.getElementById("fbModal") && document.getElementById("fbModal").classList.add("open");
  }
}

/* ═══════════════════════════════════
   ADMIN PANEL
═══════════════════════════════════ */
if (document.getElementById("recentBookingsTable")) {
  document.addEventListener("firebase-ready", loadAdminData);

  async function loadAdminData() {
    const bookings = await loadBookings();
    const reviews  = await loadReviews();

    const table = document.getElementById("recentBookingsTable");
    if (table) {
      table.innerHTML = bookings.length === 0
        ? `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No bookings yet.</div>`
        : bookings.slice(0, 20).map(b => `
            <div class="appt-item">
              <div class="ai-token" style="font-size:11px;background:var(--blue-l);color:var(--blue);width:36px;height:36px">${(b.patientName||"??").slice(0,2).toUpperCase()}</div>
              <div class="ai-info">
                <div class="ai-name">${b.patientName} → ${b.doctor}</div>
                <div class="ai-detail">${b.specialty} · ${b.dateDisplay} · ${b.slot} · ₹${b.fee} · Token ${b.token}
                  &nbsp;<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px;${b.paymentMethod==="paid_online"?"background:#ECFDF5;color:#065F46":"background:#FFF3E0;color:#E65100"}">${b.paymentMethod==="paid_online"?"✅ Paid":"🏥 Clinic"}</span>
                </div>
              </div>
              <span class="status-badge ${b.status==="done"?"sb-done":b.status==="cancelled"?"sb-cancelled":"sb-waiting"}">${b.status}</span>
            </div>`).join("");
    }

    const thisMonth = bookings.filter(b => {
      if (!b.date) return false;
      const d = new Date(b.date); const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const onlineRevenue = thisMonth.filter(b => b.paymentMethod === "paid_online").reduce((s, b) => s + (parseInt(b.fee) || 0), 0);
    const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 5), 0) / reviews.length).toFixed(1) : "—";

    const el = id => document.getElementById(id);
    if (el("adminTotalBookings")) el("adminTotalBookings").textContent = thisMonth.length;
    if (el("adminRevenue"))       el("adminRevenue").textContent = "₹" + onlineRevenue.toLocaleString("hi-IN");
    if (el("adminTotalAll"))      el("adminTotalAll").textContent = bookings.length;
    if (el("adminAvgRating"))     el("adminAvgRating").textContent = avgRating + " ★ (" + reviews.length + " reviews)";
  }
}

// Home smooth scroll
if (document.querySelector(".hero")) {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const t = document.querySelector(a.getAttribute("href"));
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
