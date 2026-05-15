/* ═══════════════════════════════════════════════
   HealthFirst — app.js
   ✅ Dynamic doctors loaded from Firebase
   ✅ Admin can add/remove doctors
   ✅ Doctor applications via For-Doctors page
   ✅ Live ratings, feedback, slot availability
   ✅ Razorpay + Pay-at-clinic options
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

/* ─────────────────────────────────────────────
   🔐 ADMIN EMAIL — change this to YOUR email
   Then create this same account in:
   Firebase Console → Authentication → Users
   See SECURITY-SETUP.md for full instructions.
───────────────────────────────────────────── */
const ADMIN_EMAIL = "REPLACE_WITH_YOUR_EMAIL@example.com";

/* ─── Specialty catalog ─── */
const SPECIALTIES = [
  { key: "General",      label: "General Medicine", icon: "🩺" },
  { key: "Cardiology",   label: "Cardiology",       icon: "❤️" },
  { key: "Pediatrics",   label: "Pediatrics",       icon: "👶" },
  { key: "Dermatology",  label: "Dermatology",      icon: "🧬" },
  { key: "Ortho",        label: "Orthopedics",      icon: "🦴" },
  { key: "Gynecology",   label: "Gynecology",       icon: "🌸" },
  { key: "ENT",          label: "ENT",              icon: "👂" },
  { key: "Ophthalmology",label: "Ophthalmology",    icon: "👁️" },
  { key: "Dental",       label: "Dental",           icon: "🦷" },
  { key: "Psychiatry",   label: "Psychiatry",       icon: "🧠" },
  { key: "Other",        label: "Other",            icon: "🏥" }
];

/* ─── India: states & cities ─── */
const INDIA_STATES_CITIES = {
  "Andhra Pradesh": ["Visakhapatnam","Vijayawada","Guntur","Tirupati","Kakinada","Nellore","Kurnool","Rajahmundry","Anantapur","Other"],
  "Arunachal Pradesh": ["Itanagar","Naharlagun","Pasighat","Tezpur","Other"],
  "Assam": ["Guwahati","Dibrugarh","Silchar","Jorhat","Nagaon","Tinsukia","Tezpur","Other"],
  "Bihar": ["Patna","Gaya","Bhagalpur","Muzaffarpur","Darbhanga","Purnia","Bihar Sharif","Arrah","Other"],
  "Chhattisgarh": ["Raipur","Bhilai","Bilaspur","Korba","Durg","Rajnandgaon","Other"],
  "Goa": ["Panaji","Margao","Vasco da Gama","Mapusa","Other"],
  "Gujarat": ["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Junagadh","Gandhinagar","Anand","Bharuch","Other"],
  "Haryana": ["Gurgaon","Faridabad","Panipat","Ambala","Hisar","Karnal","Sonipat","Rohtak","Yamunanagar","Other"],
  "Himachal Pradesh": ["Shimla","Dharamshala","Solan","Mandi","Kullu","Manali","Other"],
  "Jharkhand": ["Ranchi","Jamshedpur","Dhanbad","Bokaro","Hazaribagh","Deoghar","Other"],
  "Karnataka": ["Bangalore","Mysore","Hubli","Mangalore","Belgaum","Gulbarga","Davangere","Bellary","Tumkur","Shimoga","Other"],
  "Kerala": ["Kochi","Thiruvananthapuram","Kozhikode","Thrissur","Kollam","Kannur","Alappuzha","Palakkad","Malappuram","Other"],
  "Madhya Pradesh": ["Bhopal","Indore","Jabalpur","Gwalior","Ujjain","Sagar","Dewas","Satna","Ratlam","Rewa","Other"],
  "Maharashtra": ["Mumbai","Pune","Nagpur","Nashik","Aurangabad","Thane","Solapur","Kolhapur","Amravati","Navi Mumbai","Other"],
  "Manipur": ["Imphal","Thoubal","Bishnupur","Other"],
  "Meghalaya": ["Shillong","Tura","Jowai","Other"],
  "Mizoram": ["Aizawl","Lunglei","Other"],
  "Nagaland": ["Kohima","Dimapur","Mokokchung","Other"],
  "Odisha": ["Bhubaneswar","Cuttack","Rourkela","Berhampur","Sambalpur","Puri","Balasore","Other"],
  "Punjab": ["Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Mohali","Hoshiarpur","Pathankot","Other"],
  "Rajasthan": ["Jaipur","Jodhpur","Udaipur","Ajmer","Kota","Bikaner","Alwar","Sikar","Bhilwara","Other"],
  "Sikkim": ["Gangtok","Namchi","Other"],
  "Tamil Nadu": ["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli","Erode","Vellore","Thoothukudi","Tiruppur","Other"],
  "Telangana": ["Hyderabad","Warangal","Nizamabad","Karimnagar","Khammam","Other"],
  "Tripura": ["Agartala","Udaipur (Tripura)","Dharmanagar","Other"],
  "Uttar Pradesh": ["Lucknow","Kanpur","Agra","Varanasi","Prayagraj","Noida","Ghaziabad","Meerut","Bareilly","Aligarh","Moradabad","Other"],
  "Uttarakhand": ["Dehradun","Haridwar","Roorkee","Haldwani","Rishikesh","Nainital","Other"],
  "West Bengal": ["Kolkata","Howrah","Durgapur","Asansol","Siliguri","Bardhaman","Malda","Kharagpur","Other"],
  "Andaman and Nicobar Islands": ["Port Blair","Other"],
  "Chandigarh": ["Chandigarh","Other"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Daman","Diu","Silvassa","Other"],
  "Delhi": ["New Delhi","Delhi","Other"],
  "Jammu and Kashmir": ["Srinagar","Jammu","Anantnag","Baramulla","Other"],
  "Ladakh": ["Leh","Kargil","Other"],
  "Lakshadweep": ["Kavaratti","Other"],
  "Puducherry": ["Puducherry","Karaikal","Mahe","Yanam","Other"]
};

let db = null;
let firebaseReady = false;

async function initFirebase() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, getDoc, setDoc, query, orderBy, where, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    const auth = getAuth(app);
    firebaseReady = true;
    window._fs = { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, getDoc, setDoc, query, orderBy, where, serverTimestamp };
    window._auth = { auth, signInWithEmailAndPassword, signOut };
    console.log("✅ Firebase connected");
    document.dispatchEvent(new Event("firebase-ready"));

    // Auth-gated pages: listen for state changes
    onAuthStateChanged(auth, handleAuthStateChange);
  } catch (e) {
    console.error("Firebase init error:", e);
  }
}
initFirebase();

/* ═══════════════════════════════════
   AUTH GATE — admin.html & doctor.html
═══════════════════════════════════ */
async function handleAuthStateChange(user) {
  window._currentUser = user;

  const gate = document.getElementById("authGate");
  if (!gate) return; // page doesn't need auth

  const requireWhat = gate.dataset.require || "admin"; // "admin" or "doctor"
  const content = document.getElementById("authedContent");
  const loading = document.getElementById("authLoading");
  const loginForm = document.getElementById("authLogin");
  const errEl = document.getElementById("loginError");

  function showLogin() {
    if (loading) loading.style.display = "none";
    if (loginForm) loginForm.style.display = "";
    if (content) content.style.display = "none";
    gate.style.display = "";
  }

  function showContent() {
    gate.style.display = "none";
    if (content) content.style.display = "";
  }

  if (!user) {
    showLogin();
    return;
  }

  // Admin gate
  if (requireWhat === "admin") {
    if (user.email === ADMIN_EMAIL) {
      const emailEl = document.getElementById("authedEmail");
      if (emailEl) emailEl.textContent = user.email;
      showContent();
      document.dispatchEvent(new Event("admin-ready"));
    } else {
      if (errEl) errEl.textContent = "This account doesn't have admin access. Try a different email.";
      window._auth.signOut(window._auth.auth);
    }
    return;
  }

  // Doctor gate (allows admin too, since admin should be able to view any dashboard)
  if (requireWhat === "doctor") {
    if (user.email === ADMIN_EMAIL) {
      // Admin signed into doctor page — show admin-style dashboard with all data
      window._currentDoctor = { email: user.email, name: "Admin", specialty: "All Doctors", avatar: "🛡️" };
      const emailEl = document.getElementById("authedEmail");
      if (emailEl) emailEl.textContent = user.email + " (admin)";
      showContent();
      document.dispatchEvent(new Event("doctor-ready"));
      return;
    }
    // Doctor: check they exist in doctors collection by email
    const docMatch = await loadDoctorByEmail(user.email);
    if (docMatch) {
      window._currentDoctor = docMatch;
      const emailEl = document.getElementById("authedEmail");
      if (emailEl) emailEl.textContent = user.email;
      showContent();
      document.dispatchEvent(new Event("doctor-ready"));
    } else {
      if (errEl) errEl.textContent = "This email isn't registered as a doctor. Contact your admin.";
      window._auth.signOut(window._auth.auth);
    }
    return;
  }
}

window.doAdminLogin = async function () {
  const email = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value;
  const errEl = document.getElementById("loginError");
  if (errEl) errEl.textContent = "";
  if (!email || !password) {
    if (errEl) errEl.textContent = "Please enter both email and password.";
    return;
  }
  if (!window._auth) {
    if (errEl) errEl.textContent = "Connecting... please wait a moment and try again.";
    return;
  }
  const btn = document.getElementById("loginBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Signing in..."; }
  try {
    await window._auth.signInWithEmailAndPassword(window._auth.auth, email, password);
    // success path handled by handleAuthStateChange
  } catch (e) {
    console.error("Login error:", e);
    if (errEl) {
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found") {
        errEl.textContent = "Wrong email or password. Please try again.";
      } else if (e.code === "auth/too-many-requests") {
        errEl.textContent = "Too many failed attempts. Try again in a few minutes.";
      } else {
        errEl.textContent = "Sign-in failed: " + (e.message || "unknown error");
      }
    }
    if (btn) { btn.disabled = false; btn.textContent = "Sign In"; }
  }
};

window.doAdminLogout = async function () {
  if (!confirm("Sign out of admin?")) return;
  try {
    await window._auth.signOut(window._auth.auth);
  } catch (e) { console.error(e); }
  location.reload();
};

// ── Firebase helpers ──
async function saveBooking(data) {
  if (!firebaseReady) return null;
  const { collection, addDoc, doc, setDoc, serverTimestamp } = window._fs;
  try {
    // 1. Save full booking (admin + doctor-only readable — contains patient PII)
    const ref = await addDoc(collection(db, "bookings"), { ...data, createdAt: serverTimestamp() });

    // 2. Save lightweight public slot record (used by booking page to show slot availability)
    try {
      await addDoc(collection(db, "bookedSlots"), {
        doctorDate: data.doctorDate,
        slot: data.slot,
        bookingId: ref.id,
        doctorEmail: data.doctorEmail || "",
        status: "confirmed",
        createdAt: serverTimestamp()
      });
    } catch (slotErr) { console.warn("bookedSlots write failed:", slotErr); }

    // 3. Save patient-safe public lookup record (so patient can view their booking later via link)
    const lookupToken = "tk_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    try {
      await setDoc(doc(db, "publicBookings", lookupToken), {
        bookingId: ref.id,
        patientNameMasked: maskName(data.patientName),
        doctor: data.doctor,
        specialty: data.specialty,
        dateDisplay: data.dateDisplay,
        date: data.date,
        slot: data.slot,
        token: data.token,
        fee: data.fee,
        paymentMethod: data.paymentMethod || "pay_at_clinic",
        status: data.status || "confirmed",
        createdAt: serverTimestamp()
      });
    } catch (pubErr) { console.warn("publicBookings write failed:", pubErr); }

    return { id: ref.id, lookupToken };
  } catch (e) { console.error("saveBooking:", e); return null; }
}

function maskName(name) {
  if (!name) return "Patient";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + " " + parts[parts.length - 1][0] + ".";
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

/* Doctor-scoped bookings: only returns bookings where doctorEmail matches the given email.
   The Firestore rule will only allow this query for that authenticated doctor. */
async function loadMyBookingsAsDoctor(doctorEmail, filterDate) {
  if (!firebaseReady) return [];
  const { collection, getDocs, query, where } = window._fs;
  try {
    let q;
    if (filterDate) {
      q = query(collection(db, "bookings"),
                where("doctorEmail", "==", doctorEmail),
                where("date", "==", filterDate));
    } else {
      q = query(collection(db, "bookings"), where("doctorEmail", "==", doctorEmail));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error("loadMyBookingsAsDoctor:", e); return []; }
}

/* Find a doctor by email (used to identify the signed-in doctor) */
async function loadDoctorByEmail(email) {
  if (!firebaseReady || !email) return null;
  const { collection, getDocs, query, where } = window._fs;
  try {
    const q = query(collection(db, "doctors"), where("email", "==", email));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (e) { console.error("loadDoctorByEmail:", e); return null; }
}

/* Public booking lookup (for my-appointments page) — keyed by lookupToken (doc ID) */
async function loadPublicBooking(lookupToken) {
  if (!firebaseReady || !lookupToken) return null;
  const { doc, getDoc } = window._fs;
  try {
    const snap = await getDoc(doc(db, "publicBookings", lookupToken));
    if (!snap.exists()) return null;
    return { lookupToken, ...snap.data() };
  } catch (e) { console.error("loadPublicBooking:", e); return null; }
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
    // Reads the public bookedSlots collection (no PII) for slot availability
    const q = query(collection(db, "bookedSlots"), where("doctorDate", "==", doctorName + "_" + dateKey));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data()).filter(b => b.status !== "cancelled").map(b => b.slot);
  } catch (e) { console.error("getBookedSlots:", e); return []; }
}

async function updateBookingStatus(id, status) {
  if (!firebaseReady) return;
  const { doc, updateDoc, collection, getDocs, query, where } = window._fs;
  try {
    await updateDoc(doc(db, "bookings", id), { status });
    // If cancelled, also free up the public slot
    if (status === "cancelled") {
      try {
        const q = query(collection(db, "bookedSlots"), where("bookingId", "==", id));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          await updateDoc(doc(db, "bookedSlots", d.id), { status: "cancelled" });
        }
      } catch (slotErr) { console.warn("bookedSlots cancel failed:", slotErr); }
    }
  } catch (e) { console.error("updateStatus:", e); }
}

/* ─── Doctor CRUD ─── */
async function loadDoctors() {
  if (!firebaseReady) return [];
  const { collection, getDocs } = window._fs;
  try {
    const snap = await getDocs(collection(db, "doctors"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.active !== false);
  } catch (e) { console.error("loadDoctors:", e); return []; }
}

async function saveDoctor(data) {
  if (!firebaseReady) return null;
  const { collection, addDoc, serverTimestamp } = window._fs;
  try {
    const ref = await addDoc(collection(db, "doctors"), { ...data, active: true, createdAt: serverTimestamp() });
    return ref.id;
  } catch (e) { console.error("saveDoctor:", e); return null; }
}

async function deleteDoctor(id) {
  if (!firebaseReady) return;
  const { doc, deleteDoc } = window._fs;
  try { await deleteDoc(doc(db, "doctors", id)); }
  catch (e) { console.error("deleteDoctor:", e); }
}

/* ─── Doctor applications ─── */
async function saveDoctorApplication(data) {
  if (!firebaseReady) return null;
  const { collection, addDoc, serverTimestamp } = window._fs;
  try {
    const ref = await addDoc(collection(db, "doctorApplications"), { ...data, status: "pending", createdAt: serverTimestamp() });
    return ref.id;
  } catch (e) { console.error("saveDoctorApplication:", e); return null; }
}

async function loadDoctorApplications() {
  if (!firebaseReady) return [];
  const { collection, getDocs, query, orderBy } = window._fs;
  try {
    const q = query(collection(db, "doctorApplications"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error("loadDoctorApplications:", e); return []; }
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
  window._observeReveal = (els) => els.forEach(t => { t.classList.add("reveal"); io.observe(t); });
  window._observeReveal(document.querySelectorAll(".spec-card,.doc-card,.step-card,.review-card,.doc-list-card,.kpi-card,.big-kpi,.panel,.benefit-card,.pricing-card"));
})();

function getParam(k) { return new URLSearchParams(window.location.search).get(k); }

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));
}

/* ═══════════════════════════════════
   HOME PAGE — Live doctors + specialties + reviews
═══════════════════════════════════ */
if (document.getElementById("homeDoctorsGrid") || document.getElementById("homeSpecialtiesGrid") || document.getElementById("liveReviewsGrid")) {
  document.addEventListener("firebase-ready", initHome);

  async function initHome() {
    const doctors = await loadDoctors();
    renderHomeDoctors(doctors);
    renderHomeSpecialties(doctors);
    renderHomeStats(doctors);
    if (document.getElementById("liveReviewsGrid")) loadLiveReviews();
  }

  function renderHomeStats(doctors) {
    const el = document.getElementById("homeDoctorCount");
    if (el) el.textContent = doctors.length;
    const specCount = new Set(doctors.map(d => d.specialtyCategory || "Other")).size;
    const sEl = document.getElementById("homeSpecCount");
    if (sEl) sEl.textContent = specCount;
  }

  function renderHomeSpecialties(doctors) {
    const grid = document.getElementById("homeSpecialtiesGrid");
    if (!grid) return;
    const counts = {};
    doctors.forEach(d => { const k = d.specialtyCategory || "Other"; counts[k] = (counts[k] || 0) + 1; });
    const visible = SPECIALTIES.filter(s => counts[s.key] > 0);
    if (visible.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--navy-m);font-size:15px">
          <div style="font-size:40px;margin-bottom:12px">🩺</div>
          Specialties will appear here as doctors join the platform.
        </div>`;
      return;
    }
    grid.innerHTML = visible.map(s => `
      <a href="book.html?spec=${s.key}" class="spec-card">
        <div class="spec-icon">${s.icon}</div>
        <div class="spec-name">${s.label}</div>
        <div class="spec-count">${counts[s.key]} doctor${counts[s.key] > 1 ? "s" : ""}</div>
      </a>`).join("");
    window._observeReveal(grid.querySelectorAll(".spec-card"));
  }

  function renderHomeDoctors(doctors) {
    const grid = document.getElementById("homeDoctorsGrid");
    if (!grid) return;
    if (doctors.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px 24px;background:white;border-radius:var(--r-xl);border:1px solid var(--border)">
          <div style="font-size:48px;margin-bottom:14px">👨‍⚕️</div>
          <h3 style="font-family:var(--ff-d);font-size:22px;color:var(--navy);margin-bottom:8px">Our doctors are coming soon</h3>
          <p style="color:var(--navy-m);font-size:15px;margin-bottom:18px;max-width:480px;margin-left:auto;margin-right:auto">We're onboarding verified doctors across India. Are you a doctor? Join HealthFirst and start receiving patient bookings instantly.</p>
          <a href="for-doctors.html" class="btn-primary">Join as a Doctor →</a>
        </div>`;
      return;
    }
    const featured = doctors.slice(0, 4);
    grid.innerHTML = featured.map(d => `
      <div class="doc-card">
        <div class="doc-photo">${escapeHtml(d.avatar || "👨‍⚕️")}</div>
        <div class="doc-info">
          <div class="doc-name">${escapeHtml(d.name)}</div>
          <div class="doc-spec">${escapeHtml(d.specialty || "")}</div>
          <div class="doc-cred">${escapeHtml(d.qualification || "")}${d.experience ? " · " + escapeHtml(d.experience) : ""}</div>
          <div class="doc-meta-row">
            <span class="doc-fee">₹${escapeHtml(d.fee)} / visit</span>
            <span class="doc-avail-badge"><span class="avail-dot"></span> Available</span>
          </div>
          <a href="book.html?docId=${d.id}" class="btn-primary doc-book-btn">Book Appointment</a>
        </div>
      </div>`).join("");
    window._observeReveal(grid.querySelectorAll(".doc-card"));

    const viewAllEl = document.getElementById("homeViewAllText");
    if (viewAllEl) viewAllEl.textContent = `View All ${doctors.length} Doctor${doctors.length > 1 ? "s" : ""} →`;
  }

  async function loadLiveReviews() {
    const grid = document.getElementById("liveReviewsGrid");
    if (!grid) return;
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
        <p class="review-text" style="font-size:15px;color:var(--navy-m);line-height:1.7;margin-bottom:16px;font-style:italic">"${escapeHtml(r.comment)}"</p>
        <div class="review-author" style="display:flex;align-items:center;gap:12px">
          <div class="review-avatar" style="width:40px;height:40px;border-radius:50%;background:var(--teal-l);color:var(--teal-d);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">
            ${escapeHtml((r.patientName || "P").slice(0,2).toUpperCase())}
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--navy)">${escapeHtml(r.patientName || "Patient")}</div>
            <div style="font-size:12px;color:var(--navy-m);margin-top:2px">Visited ${escapeHtml(r.doctor)} · ${escapeHtml(r.specialty || "")}</div>
          </div>
        </div>
      </div>`).join("");
    window._observeReveal(grid.querySelectorAll(".review-card"));
  }
}

/* ═══════════════════════════════════
   BOOKING PAGE
═══════════════════════════════════ */
if (document.getElementById("docList")) {

  const extraStyles = document.createElement("style");
  extraStyles.textContent = `
    .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); display: flex; align-items: flex-end; justify-content: center; z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .2s; }
    .modal-overlay.open { opacity: 1; pointer-events: all; }
    .modal-sheet { background: white; border-radius: 24px 24px 0 0; padding: 28px 24px 36px; width: 100%; max-width: 480px; transform: translateY(60px); transition: transform .25s cubic-bezier(.34,1.2,.64,1); }
    .modal-overlay.open .modal-sheet { transform: translateY(0); }
    .modal-handle { width: 40px; height: 4px; background: var(--border-md); border-radius: 2px; margin: 0 auto 20px; }
    .modal-title { font-family: var(--ff-d); font-size: 20px; font-weight: 700; color: var(--navy); margin-bottom: 6px; }
    .modal-sub { font-size: 14px; color: var(--navy-m); margin-bottom: 22px; }
    .pay-btn-row { display: flex; flex-direction: column; gap: 10px; }
    .pay-choice { padding: 16px 20px; border-radius: var(--r-lg); border: 2px solid var(--border); font-size: 15px; font-weight: 700; font-family: var(--ff); cursor: pointer; display: flex; align-items: center; gap: 14px; text-align: left; transition: all .18s; background: white; }
    .pay-choice:hover { border-color: var(--teal); background: var(--teal-l); }
    .pay-choice-icon { font-size: 28px; flex-shrink: 0; }
    .pay-choice-text small { display: block; font-size: 12px; font-weight: 400; color: var(--navy-m); margin-top: 3px; }
    .pay-choice.primary { background: var(--teal); border-color: var(--teal); color: white; }
    .pay-choice.primary small { color: rgba(255,255,255,.8); }
    .pay-choice.primary:hover { background: var(--teal-d); }
    .feedback-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.6); display: flex; align-items: center; justify-content: center; z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .2s; padding: 20px; }
    .feedback-overlay.open { opacity: 1; pointer-events: all; }
    .feedback-box { background: white; border-radius: 20px; padding: 28px 24px; width: 100%; max-width: 420px; transform: scale(.92); transition: transform .25s cubic-bezier(.34,1.2,.64,1); }
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
          <span class="pay-choice-text">Pay Online Now<small>Secure payment · Instant confirmation · Razorpay</small></span>
        </button>
        <button class="pay-choice" onclick="processPayment('clinic')">
          <span class="pay-choice-icon">🏥</span>
          <span class="pay-choice-text">Pay at Clinic<small>Cash or card on arrival · Slot reserved for you</small></span>
        </button>
      </div>
      <div style="margin-top:14px;font-size:12px;color:var(--navy-m);text-align:center">🔒 Payments processed securely by Razorpay</div>
      <button onclick="closePayModal()" style="width:100%;background:none;border:none;color:var(--navy-m);font-size:13px;font-family:var(--ff);cursor:pointer;margin-top:12px;text-decoration:underline">Cancel</button>
    </div>`;
  document.body.appendChild(payModal);

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

  let pendingBookingData = null;
  let selectedRating = 5;
  let completedBookingForFeedback = null;
  let allDoctors = [];

  window.closePayModal = () => document.getElementById("payModal").classList.remove("open");
  window.closeFbModal = () => document.getElementById("fbModal").classList.remove("open");

  window.pickStar = function (val) {
    selectedRating = val;
    document.querySelectorAll(".star-pick").forEach(s => s.classList.toggle("lit", parseInt(s.dataset.val) <= val));
  };
  setTimeout(() => pickStar(5), 100);

  document.addEventListener("firebase-ready", initBookingPage);

  async function initBookingPage() {
    allDoctors = await loadDoctors();
    renderSpecFilter(allDoctors);
    renderDoctorList(allDoctors);

    const specParam = getParam("spec");
    const docIdParam = getParam("docId");
    if (specParam) {
      const btn = document.querySelector(`.sf-btn[data-spec="${specParam}"]`);
      if (btn) btn.click();
    }
    if (docIdParam) {
      setTimeout(() => {
        const card = document.querySelector(`.doc-list-card[data-docid="${docIdParam}"]`);
        if (card) card.click();
      }, 150);
    }
  }

  function renderSpecFilter(doctors) {
    const filter = document.getElementById("specFilter");
    if (!filter) return;
    const counts = {};
    doctors.forEach(d => { const k = d.specialtyCategory || "Other"; counts[k] = (counts[k] || 0) + 1; });
    const total = doctors.length;
    let html = `<button class="sf-btn active" data-spec="All" onclick="filterBySpec(this,'All')"><span class="sf-icon">🏥</span> All Doctors <span class="sf-count">${total}</span></button>`;
    SPECIALTIES.forEach(s => {
      if (counts[s.key] > 0) {
        html += `<button class="sf-btn" data-spec="${s.key}" onclick="filterBySpec(this,'${s.key}')"><span class="sf-icon">${s.icon}</span> ${s.label} <span class="sf-count">${counts[s.key]}</span></button>`;
      }
    });
    filter.innerHTML = html;
  }

  function renderDoctorList(doctors) {
    const list = document.getElementById("docList");
    if (!list) return;
    if (doctors.length === 0) {
      list.innerHTML = `
        <div style="text-align:center;padding:48px 24px;background:white;border-radius:var(--r-xl);border:1px solid var(--border)">
          <div style="font-size:56px;margin-bottom:14px">👨‍⚕️</div>
          <h3 style="font-family:var(--ff-d);font-size:24px;color:var(--navy);margin-bottom:10px">No doctors listed yet</h3>
          <p style="color:var(--navy-m);font-size:15px;max-width:440px;margin:0 auto 20px">We're onboarding verified doctors right now. Check back soon, or if you're a doctor, join us!</p>
          <a href="for-doctors.html" class="btn-primary">Join as a Doctor →</a>
        </div>`;
      return;
    }
    list.innerHTML = doctors.map(d => {
      const sName = escapeHtml(d.name).replace(/'/g, "&#39;");
      const sAvatar = escapeHtml(d.avatar || "👨‍⚕️");
      const sSpec = escapeHtml(d.specialty || "").replace(/'/g, "&#39;");
      const sFee = escapeHtml(d.fee);
      const sCred = escapeHtml((d.qualification || "") + (d.experience ? " · " + d.experience : "")).replace(/'/g, "&#39;");
      const sCity = escapeHtml(d.city || "");
      const onclickData = `'${sName}','${sAvatar}','${sSpec}','${sFee}','${sCred}'`;
      return `
        <div class="doc-list-card" data-spec="${d.specialtyCategory || 'Other'}" data-docid="${d.id}" onclick="selectDoc(this,${onclickData})">
          <div class="dla">${sAvatar}</div>
          <div class="dli">
            <div class="dli-name">${sName}</div>
            <div class="dli-spec">${sSpec}${sCity ? ' · ' + sCity : ''}</div>
            <div class="dli-meta"><span>🎓 ${sCred}</span></div>
          </div>
          <div class="dlr">
            <div class="dlr-fee">₹${sFee}<small>per visit</small></div>
            <button class="btn-primary" style="font-size:13px;padding:9px 18px" onclick="event.stopPropagation();selectDoc(this.closest('.doc-list-card'),${onclickData})">Book</button>
            <span style="font-size:12px;color:var(--green);font-weight:600;display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block"></span>Available</span>
          </div>
        </div>`;
    }).join("");
    window._observeReveal(list.querySelectorAll(".doc-list-card"));
  }

  window.filterBySpec = function (btn, spec) {
    document.querySelectorAll(".sf-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".doc-list-card").forEach(card => {
      card.style.display = (spec === "All" || card.dataset.spec === spec) ? "flex" : "none";
    });
  };

  let selectedDoc = null;
  let selectedSlot = null;
  let selectedDateIdx = 0;

  window.selectDoc = function (cardEl, name, avatar, spec, fee, cred) {
    // Look up full doctor record from cached list using data-docid (so we get email + id)
    const docId = cardEl?.dataset?.docid;
    const fullDoc = allDoctors.find(d => d.id === docId);
    selectedDoc = {
      id: docId,
      email: fullDoc?.email || "",
      name, avatar, spec, fee, cred
    };
    document.getElementById("doctorListView").style.display = "none";
    document.getElementById("bookingPanel").style.display = "block";
    document.getElementById("successView").classList.remove("show");
    document.getElementById("bpAvatar").textContent = avatar;
    document.getElementById("bpName").textContent = name;
    document.getElementById("bpSpec").textContent = `${spec} · ₹${fee}`;
    selectedSlot = null; selectedDateIdx = 0;
    buildDatePicker(); buildTimeSlots(); updateSummaryPanel();
    document.getElementById("bookingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.backToList = function () {
    document.getElementById("doctorListView").style.display = "block";
    document.getElementById("bookingPanel").style.display = "none";
    document.getElementById("successView").classList.remove("show");
    selectedDoc = null;
    document.getElementById("summaryPanel").innerHTML = "No appointment selected yet.<br>Choose a doctor and time slot to begin.";
  };

  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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
      document.getElementById("sumDoc").textContent = selectedDoc.name;
      document.getElementById("sumSpec").textContent = selectedDoc.spec;
      document.getElementById("sumDateTime").textContent = `${dateStr} · ${selectedSlot || "—"}`;
      document.getElementById("sumFee").textContent = `₹${selectedDoc.fee}`;
    }
  }

  async function validateAndBuild() {
    const name = document.getElementById("pName")?.value.trim();
    const phone = document.getElementById("pPhone")?.value.trim();
    const age = document.getElementById("pAge")?.value.trim();
    const gender = document.getElementById("pGender")?.value;
    const reason = document.getElementById("pReason")?.value.trim();

    if (!name) { alert("Please enter your name."); return null; }
    if (!phone || phone.length < 10) { alert("Please enter a valid 10-digit phone number."); return null; }
    if (!selectedSlot) { alert("Please select a time slot."); return null; }

    const today = new Date(); const d = new Date(today); d.setDate(today.getDate() + selectedDateIdx);
    const dateStr = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`;
    const dateKey = getSelectedDateKey();
    const token = "#" + String(Math.floor(Math.random() * 900) + 100);

    const stillBooked = await getBookedSlots(selectedDoc.name, dateKey);
    if (stillBooked.includes(selectedSlot)) {
      alert("⚠️ This slot was just taken! Please pick another.");
      selectedSlot = null; buildTimeSlots(); return null;
    }

    return { name, phone, age, gender, reason, dateStr, dateKey, token };
  }

  window.confirmBooking = async function () {
    const formData = await validateAndBuild();
    if (!formData) return;
    pendingBookingData = formData;
    document.getElementById("payModalSub").textContent =
      `${selectedDoc.name} · ${formData.dateStr} · ${selectedSlot} · ₹${selectedDoc.fee}`;
    document.getElementById("payModal").classList.add("open");
  };

  window.processPayment = async function (method) {
    closePayModal();
    if (method === "online") await openRazorpay(pendingBookingData);
    else await finalizeBooking(pendingBookingData, "confirmed", "pay_at_clinic", null);
  };

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
          razorpay_payment_id: response.razorpay_payment_id, amount: selectedDoc.fee
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

  async function finalizeBooking(formData, status, paymentMethod, paymentDetails) {
    const result = await saveBooking({
      patientName: formData.name, phone: formData.phone, age: formData.age, gender: formData.gender,
      reason: formData.reason,
      doctor: selectedDoc.name, doctorEmail: selectedDoc.email || "", doctorId: selectedDoc.id || "",
      specialty: selectedDoc.spec, fee: selectedDoc.fee,
      date: formData.dateKey, dateDisplay: formData.dateStr, slot: selectedSlot, token: formData.token,
      doctorDate: selectedDoc.name + "_" + formData.dateKey,
      status, paymentMethod, paymentDetails: paymentDetails || {}
    });
    const savedId = result && result.id ? result.id : null;
    const lookupToken = result && result.lookupToken ? result.lookupToken : null;
    completedBookingForFeedback = { bookingId: savedId, patientName: formData.name, doctor: selectedDoc.name, specialty: selectedDoc.spec };

    // Save to browser localStorage so patient can see all their bookings on my-appointments.html
    if (lookupToken) {
      try {
        const mine = JSON.parse(localStorage.getItem("hf_my_bookings") || "[]");
        mine.unshift({
          lookupToken,
          doctor: selectedDoc.name,
          specialty: selectedDoc.spec,
          dateDisplay: formData.dateStr,
          date: formData.dateKey,
          slot: selectedSlot,
          token: formData.token,
          fee: selectedDoc.fee,
          savedAt: new Date().toISOString()
        });
        localStorage.setItem("hf_my_bookings", JSON.stringify(mine.slice(0, 50)));
      } catch (e) { /* localStorage may be unavailable in some browsers */ }
    }

    const isPaid = paymentMethod === "paid_online";
    document.getElementById("bookingPanel").style.display = "none";
    const sv = document.getElementById("successView");
    sv.classList.add("show");
    document.getElementById("tokenNum").textContent = formData.token;

    const myApptUrl = lookupToken ? `my-appointments.html?t=${lookupToken}` : "my-appointments.html";

    document.getElementById("successBody").innerHTML = `
      <strong>${escapeHtml(formData.name)}</strong>, your appointment with
      <strong>${escapeHtml(selectedDoc.name)}</strong> (${escapeHtml(selectedDoc.spec)}) is confirmed.<br><br>
      📅 <strong>${escapeHtml(formData.dateStr)}</strong> at <strong>${escapeHtml(selectedSlot)}</strong><br>
      💰 Fee: <strong>₹${escapeHtml(selectedDoc.fee)}</strong> —
      ${isPaid ? `<span style="color:var(--green);font-weight:600">✅ Paid online${paymentDetails?.razorpay_payment_id ? ` · ${escapeHtml(paymentDetails.razorpay_payment_id)}` : ""}</span>`
               : `<span style="color:var(--amber);font-weight:600">🏥 Pay at clinic on arrival</span>`}<br><br>
      📲 Confirmation sent to <strong>${escapeHtml(formData.phone)}</strong><br>
      ⏰ Please arrive 10 minutes before your slot.<br>
      🆔 Bring any previous prescriptions or reports.
      ${lookupToken ? `
      <div style="margin-top:20px;padding:14px 16px;background:var(--teal-l);border-radius:var(--r-lg);text-align:left">
        <div style="font-weight:700;color:var(--navy);margin-bottom:6px">📌 Save your booking link</div>
        <div style="font-size:13px;color:var(--navy-m);margin-bottom:10px">View or share your appointment anytime — bookmark this link:</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="${myApptUrl}" class="btn-primary" style="font-size:13px;padding:8px 16px">📋 View My Appointment</a>
          <button onclick="copyMyApptLink('${lookupToken}')" class="btn-ghost" style="font-size:13px;padding:8px 16px">📋 Copy Link</button>
        </div>
      </div>` : ""}
    `;
    sv.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.copyMyApptLink = function (token) {
    const url = `${window.location.origin}${window.location.pathname.replace(/[^\/]*$/, "")}my-appointments.html?t=${token}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => alert("✅ Link copied! Save it somewhere safe — bookmark, notes app, or WhatsApp it to yourself."),
        () => prompt("Copy this link manually:", url)
      );
    } else {
      prompt("Copy this link manually:", url);
    }
  };

  window.bookAnother = function () {
    document.getElementById("successView").classList.remove("show");
    document.getElementById("doctorListView").style.display = "block";
    selectedDoc = null; selectedDateIdx = 0; selectedSlot = null;
    document.getElementById("summaryPanel").innerHTML = "No appointment selected yet.<br>Choose a doctor and time slot to begin.";
  };

  window.submitFeedback = async function () {
    if (!completedBookingForFeedback) { closeFbModal(); return; }
    const comment = document.getElementById("fbComment")?.value.trim();
    await saveFeedback({
      bookingId: completedBookingForFeedback.bookingId,
      patientName: completedBookingForFeedback.patientName,
      doctor: completedBookingForFeedback.doctor,
      specialty: completedBookingForFeedback.specialty,
      rating: selectedRating,
      comment: comment || "Great experience!"
    });
    closeFbModal();
    alert("✅ Thank you for your feedback! It helps other patients choose the right doctor.");
  };
}

/* ═══════════════════════════════════
   DOCTOR DASHBOARD — scoped to signed-in doctor
═══════════════════════════════════ */
if (document.getElementById("queue-upcoming")) {
  document.addEventListener("doctor-ready", loadTodayQueue);

  async function loadTodayQueue() {
    const today = new Date().toISOString().split("T")[0];
    const me = window._currentDoctor || {};
    const isAdmin = (me.email === ADMIN_EMAIL);

    // Update sidebar info to reflect current doctor
    const setText = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };
    setText(".sb-avatar", me.avatar || (isAdmin ? "🛡️" : "👨‍⚕️"));
    setText(".sb-name", me.name || "Doctor");
    setText(".sb-spec", me.specialty || (isAdmin ? "Admin view — all doctors" : ""));

    // Load bookings: admin sees all, doctor sees only their own
    const bookings = isAdmin
      ? await loadBookings(today)
      : await loadMyBookingsAsDoctor(me.email, today);

    const container = document.getElementById("queue-upcoming");

    if (bookings.length === 0) {
      container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No bookings for today yet.<br><br><a href="book.html" style="color:var(--teal);font-weight:600">Go to booking page →</a></div>`;
      return;
    }

    container.innerHTML = bookings.filter(b => b.status === "confirmed").map((b, i) => `
      <div class="appt-item" id="appt-${b.id}">
        <div class="ai-token">${i + 1}</div>
        <div class="ai-info">
          <div class="ai-name">${escapeHtml(b.patientName)} · ${escapeHtml(b.gender || "")}, ${escapeHtml(b.age || "")}</div>
          <div class="ai-detail">${escapeHtml(b.slot)} · ${escapeHtml(b.reason || "General consultation")} · Token ${escapeHtml(b.token)}
            &nbsp;<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px;${b.paymentMethod === "paid_online" ? "background:#ECFDF5;color:#065F46" : "background:#FFF3E0;color:#E65100"}">${b.paymentMethod === "paid_online" ? "✅ Paid" : "🏥 Pay at clinic"}</span>
          </div>
        </div>
        <div class="ai-actions">
          <button class="ai-btn done" onclick="markDone('${b.id}','${escapeHtml(b.patientName)}','${b.phone || ""}')">✓ Done</button>
          <button class="ai-btn cancel" onclick="cancelAppt('${b.id}')">✗ Cancel</button>
        </div>
      </div>`).join("");

    const countEl = document.getElementById("waitingCount");
    if (countEl) countEl.textContent = bookings.filter(b => b.status === "confirmed").length;
    const kpiEl = document.getElementById("kpiToday");
    if (kpiEl) kpiEl.textContent = bookings.length;
  }

  window.markDone = async function (id, patientName, phone) {
    await updateBookingStatus(id, "done");
    const row = document.getElementById("appt-" + id);
    if (row) row.querySelector(".ai-actions").innerHTML = '<span class="status-badge sb-done">✓ Done</span>';
    if (phone && phone.length >= 10) {
      const feedbackUrl = `${window.location.origin}/book.html?feedback=${id}`;
      const msg = encodeURIComponent(`Hi ${patientName}! Thank you for visiting HealthFirst today. Please share your feedback: ${feedbackUrl}`);
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

  const fbParam = getParam("feedback");
  if (fbParam) document.getElementById("fbModal") && document.getElementById("fbModal").classList.add("open");
}

/* ═══════════════════════════════════
   ADMIN PANEL — bookings + doctor management + applications
═══════════════════════════════════ */
if (document.getElementById("recentBookingsTable") || document.getElementById("docManageList")) {
  document.addEventListener("admin-ready", loadAdminData);

  async function loadAdminData() {
    const bookings = await loadBookings();
    const reviews = await loadReviews();
    const doctors = await loadDoctors();
    const applications = await loadDoctorApplications();

    const table = document.getElementById("recentBookingsTable");
    if (table) {
      table.innerHTML = bookings.length === 0
        ? `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No bookings yet.</div>`
        : bookings.slice(0, 20).map(b => `
            <div class="appt-item">
              <div class="ai-token" style="font-size:11px;background:var(--blue-l);color:var(--blue);width:36px;height:36px">${escapeHtml((b.patientName||"??").slice(0,2).toUpperCase())}</div>
              <div class="ai-info">
                <div class="ai-name">${escapeHtml(b.patientName)} → ${escapeHtml(b.doctor)}</div>
                <div class="ai-detail">${escapeHtml(b.specialty)} · ${escapeHtml(b.dateDisplay)} · ${escapeHtml(b.slot)} · ₹${escapeHtml(b.fee)} · Token ${escapeHtml(b.token)}
                  &nbsp;<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px;${b.paymentMethod==="paid_online"?"background:#ECFDF5;color:#065F46":"background:#FFF3E0;color:#E65100"}">${b.paymentMethod==="paid_online"?"✅ Paid":"🏥 Clinic"}</span>
                </div>
              </div>
              <span class="status-badge ${b.status==="done"?"sb-done":b.status==="cancelled"?"sb-cancelled":"sb-waiting"}">${escapeHtml(b.status)}</span>
            </div>`).join("");
    }

    const docList = document.getElementById("docManageList");
    if (docList) {
      docList.innerHTML = doctors.length === 0
        ? `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No doctors added yet. Use the form below to add your first doctor.</div>`
        : doctors.map(d => `
            <div class="appt-item">
              <div class="ai-token" style="background:var(--teal-l);color:var(--teal-d);font-size:18px">${escapeHtml(d.avatar||"👨‍⚕️")}</div>
              <div class="ai-info">
                <div class="ai-name">${escapeHtml(d.name)}</div>
                <div class="ai-detail">${escapeHtml(d.specialty)} · ${escapeHtml(d.qualification||"")} · ₹${escapeHtml(d.fee)}${d.city ? " · " + escapeHtml(d.city) : ""}</div>
                <div class="ai-detail" style="margin-top:3px;font-size:11px">${d.email ? "🔑 " + escapeHtml(d.email) : "<span style='color:var(--amber)'>⚠️ No login email — add one</span>"}</div>
              </div>
              <button class="ai-btn cancel" onclick="removeDoctorAdmin('${d.id}','${escapeHtml(d.name).replace(/'/g, "\\'")}')">Remove</button>
            </div>`).join("");

      const countEl = document.getElementById("docCount");
      if (countEl) countEl.textContent = doctors.length;
    }

    const appList = document.getElementById("docApplications");
    if (appList) {
      appList.innerHTML = applications.length === 0
        ? `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No doctor applications yet.</div>`
        : applications.map(a => {
            const location = [a.city, a.state].filter(Boolean).map(escapeHtml).join(", ");
            const pricingLabel = a.pricingModel === "commission" ? "10% per booking" : "₹2,000/mo subscription";
            const certs = Array.isArray(a.certifications) ? a.certifications : [];
            return `
            <div class="appt-item" style="flex-wrap:wrap;align-items:flex-start">
              <div class="ai-token" style="background:var(--amber-l);color:var(--amber);font-size:14px">${escapeHtml((a.name||"??").slice(0,2).toUpperCase())}</div>
              <div class="ai-info">
                <div class="ai-name">${escapeHtml(a.name)} · ${escapeHtml(a.specialty||"")}</div>
                <div class="ai-detail">📞 ${escapeHtml(a.phone||"")} · ✉️ ${escapeHtml(a.email||"")}${location ? " · 📍 " + location : ""}${a.experience ? " · " + escapeHtml(a.experience) + " yrs" : ""}${a.qualification ? " · 🎓 " + escapeHtml(a.qualification) : ""}</div>
                <div class="ai-detail" style="margin-top:3px">💳 Prefers: <strong>${pricingLabel}</strong></div>
                ${a.message ? `<div class="ai-detail" style="font-style:italic;margin-top:4px">"${escapeHtml(a.message)}"</div>` : ""}
                ${certs.length > 0 ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${certs.map(c => `<a href="${c.base64}" download="${escapeHtml(c.name)}" style="font-size:11px;color:var(--teal-d);font-weight:600;padding:4px 10px;background:var(--teal-l);border-radius:14px;text-decoration:none;border:1px solid var(--teal-ll)" title="Click to download">📎 ${escapeHtml(c.name)} <span style="opacity:.6">${(c.size/1024).toFixed(0)}KB</span></a>`).join("")}</div>` : `<div style="margin-top:6px;font-size:11px;color:var(--navy-h);font-style:italic">No certificates uploaded</div>`}
              </div>
              <span class="status-badge sb-waiting">${escapeHtml(a.status||"pending")}</span>
            </div>`;
          }).join("");

      const appCountEl = document.getElementById("appCount");
      if (appCountEl) appCountEl.textContent = applications.length;
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
    if (el("adminRevenue")) el("adminRevenue").textContent = "₹" + onlineRevenue.toLocaleString("hi-IN");
    if (el("adminTotalAll")) el("adminTotalAll").textContent = bookings.length;
    if (el("adminAvgRating")) el("adminAvgRating").textContent = avgRating + " ★ (" + reviews.length + " reviews)";
    if (el("adminDocCount")) el("adminDocCount").textContent = doctors.length;
  }

  window.adminAddDoctor = async function () {
    const get = id => document.getElementById(id)?.value.trim();
    const data = {
      name: get("ndName"),
      email: (get("ndEmail") || "").toLowerCase(),
      specialty: get("ndSpecialty"),
      specialtyCategory: get("ndCategory"),
      qualification: get("ndQual"),
      experience: get("ndExp"),
      fee: parseInt(get("ndFee")) || 0,
      city: get("ndCity"),
      avatar: get("ndAvatar") || "👨‍⚕️"
    };
    if (!data.name || !data.email || !data.specialty || !data.fee) {
      alert("Please fill in at least: Name, Email, Specialty, and Fee.\n\nThe email is the doctor's login email — you'll create their Firebase Auth account separately.");
      return;
    }
    if (!data.email.includes("@") || !data.email.includes(".")) {
      alert("Please enter a valid email address.");
      return;
    }
    const id = await saveDoctor(data);
    if (id) {
      alert(`✅ Dr. ${data.name} added.\n\n⚠️ NEXT STEP: Go to Firebase Console → Authentication → Add user → create login for ${data.email}, then share the password with the doctor on WhatsApp.`);
      ["ndName","ndEmail","ndSpecialty","ndQual","ndExp","ndFee","ndCity","ndAvatar"].forEach(f => {
        const el = document.getElementById(f); if (el) el.value = "";
      });
      loadAdminData();
    } else {
      alert("❌ Failed to add doctor. Please try again.");
    }
  };

  window.removeDoctorAdmin = async function (id, name) {
    if (!confirm(`Remove ${name} from HealthFirst?\n\nTheir profile will no longer be visible to patients. Past bookings stay intact.`)) return;
    await deleteDoctor(id);
    loadAdminData();
  };
}

/* ═══════════════════════════════════
   FOR-DOCTORS PAGE — application form
═══════════════════════════════════ */
if (document.getElementById("doctorApplicationForm")) {

  /* ─ State / City dropdowns ─ */
  const stateSel = document.getElementById("appState");
  if (stateSel) {
    Object.keys(INDIA_STATES_CITIES).sort().forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      stateSel.appendChild(opt);
    });
  }

  window.onStateChange = function () {
    const state = stateSel.value;
    const citySel = document.getElementById("appCity");
    citySel.innerHTML = '<option value="">Select city</option>';
    const otherWrap = document.getElementById("appOtherCityWrap");
    if (otherWrap) otherWrap.style.display = "none";
    const otherInput = document.getElementById("appOtherCity");
    if (otherInput) otherInput.value = "";
    if (!state) { citySel.disabled = true; return; }
    citySel.disabled = false;
    INDIA_STATES_CITIES[state].forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      citySel.appendChild(opt);
    });
  };

  window.onCityChange = function () {
    const city = document.getElementById("appCity").value;
    const wrap = document.getElementById("appOtherCityWrap");
    if (!wrap) return;
    if (city === "Other") {
      wrap.style.display = "block";
      setTimeout(() => document.getElementById("appOtherCity")?.focus(), 50);
    } else {
      wrap.style.display = "none";
      const inp = document.getElementById("appOtherCity"); if (inp) inp.value = "";
    }
  };

  window.onSpecialtyChange = function () {
    const spec = document.getElementById("appSpecialty").value;
    const wrap = document.getElementById("appOtherSpecWrap");
    if (!wrap) return;
    if (spec === "Other") {
      wrap.style.display = "block";
      setTimeout(() => document.getElementById("appOtherSpec")?.focus(), 50);
    } else {
      wrap.style.display = "none";
      const inp = document.getElementById("appOtherSpec"); if (inp) inp.value = "";
    }
  };

  /* ─ File upload ─ */
  let appUploadedFiles = [];
  const MAX_FILE_SIZE = 250 * 1024; // 250 KB per file
  const MAX_FILES = 3;

  window.handleAppFiles = function (input) {
    const files = Array.from(input.files);
    const errors = [];
    for (const file of files) {
      if (appUploadedFiles.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} files allowed. Skipped "${file.name}".`);
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" is too large (${(file.size/1024).toFixed(0)} KB). Max 250 KB per file.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = ((f) => (e) => {
        appUploadedFiles.push({
          name: f.name, type: f.type, size: f.size, base64: e.target.result
        });
        renderAppFileList();
      })(file);
      reader.onerror = () => alert(`Could not read "${file.name}".`);
      reader.readAsDataURL(file);
    }
    if (errors.length) alert(errors.join("\n"));
    input.value = "";
  };

  window.removeAppFile = function (idx) {
    appUploadedFiles.splice(idx, 1);
    renderAppFileList();
  };

  function renderAppFileList() {
    const list = document.getElementById("appFileList");
    if (!list) return;
    if (appUploadedFiles.length === 0) { list.innerHTML = ""; return; }
    list.innerHTML = appUploadedFiles.map((f, i) => `
      <div class="file-list-item">
        <span style="font-size:16px">📎</span>
        <span class="fli-name">${escapeHtml(f.name)}</span>
        <span class="fli-size">${(f.size/1024).toFixed(0)} KB</span>
        <button type="button" class="fli-remove" onclick="removeAppFile(${i})" title="Remove">×</button>
      </div>`).join("");
  }

  /* ─ Submit ─ */
  window.submitDoctorApplication = async function (e) {
    if (e) e.preventDefault();
    const get = id => document.getElementById(id)?.value.trim();

    let specialty = get("appSpecialty");
    if (specialty === "Other") {
      const otherSpec = get("appOtherSpec");
      if (!otherSpec) { alert("Please specify your specialty."); document.getElementById("appOtherSpec")?.focus(); return false; }
      specialty = otherSpec;
    }

    let city = get("appCity");
    if (city === "Other") {
      const otherCity = get("appOtherCity");
      if (!otherCity) { alert("Please specify your city."); document.getElementById("appOtherCity")?.focus(); return false; }
      city = otherCity;
    }

    const pricingModelEl = document.querySelector('input[name="pricingModel"]:checked');
    const pricingModel = pricingModelEl ? pricingModelEl.value : "subscription";

    const data = {
      name: get("appName"),
      email: get("appEmail"),
      phone: get("appPhone"),
      specialty: specialty,
      qualification: get("appQual"),
      experience: get("appExp"),
      state: get("appState"),
      city: city,
      pricingModel: pricingModel,
      message: get("appMessage"),
      certifications: appUploadedFiles
    };

    const required = [
      ["name", "Full Name", "appName"],
      ["email", "Email", "appEmail"],
      ["phone", "Phone", "appPhone"],
      ["specialty", "Specialty", "appSpecialty"],
      ["qualification", "Qualification", "appQual"],
      ["experience", "Years of Experience", "appExp"],
      ["state", "State of Practice", "appState"],
      ["city", "City of Practice", "appCity"],
      ["message", "The 'Anything else' field", "appMessage"]
    ];
    for (const [field, label, elId] of required) {
      if (!data[field]) {
        alert(`Please fill in: ${label}`);
        document.getElementById(elId)?.focus();
        return false;
      }
    }
    if (data.phone.length < 10) {
      alert("Please enter a valid 10-digit phone number.");
      document.getElementById("appPhone")?.focus();
      return false;
    }
    if (!data.certifications || data.certifications.length === 0) {
      alert("Please upload at least one certification (e.g., medical degree, registration certificate).");
      return false;
    }

    const submitBtn = document.getElementById("appSubmitBtn");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting..."; }
    const id = await saveDoctorApplication(data);
    if (id) {
      document.getElementById("doctorApplicationForm").style.display = "none";
      document.getElementById("doctorAppSuccess").style.display = "block";
      document.getElementById("doctorAppSuccess").scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      alert("Something went wrong. Your certificate files might be too large.\n\nPlease try smaller files (under 250 KB each), or email us directly at hello@healthfirst.in.");
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit Application →"; }
    }
    return false;
  };
}

/* ═══════════════════════════════════
   MY APPOINTMENTS PAGE
═══════════════════════════════════ */
if (document.getElementById("myAppointmentsList")) {
  document.addEventListener("firebase-ready", initMyAppointments);
  if (firebaseReady) initMyAppointments();

  async function initMyAppointments() {
    const list = document.getElementById("myAppointmentsList");
    const empty = document.getElementById("myAppointmentsEmpty");
    if (!list) return;

    // 1. Check URL for ?t=<lookupToken>
    const urlToken = getParam("t");
    let bookings = [];

    // 2. Pull saved tokens from localStorage
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem("hf_my_bookings") || "[]");
    } catch (e) { saved = []; }

    // 3. If URL has a token, fetch fresh data and add to saved (if not already there)
    if (urlToken) {
      const fresh = await loadPublicBooking(urlToken);
      if (fresh) {
        if (!saved.find(s => s.lookupToken === urlToken)) {
          saved.unshift({
            lookupToken: urlToken,
            doctor: fresh.doctor,
            specialty: fresh.specialty,
            dateDisplay: fresh.dateDisplay,
            date: fresh.date,
            slot: fresh.slot,
            token: fresh.token,
            fee: fresh.fee,
            savedAt: new Date().toISOString()
          });
          try { localStorage.setItem("hf_my_bookings", JSON.stringify(saved.slice(0, 50))); } catch (e) {}
        }
      } else {
        // Token in URL is invalid or expired
        list.innerHTML = `
          <div style="text-align:center;padding:40px 24px;background:white;border-radius:var(--r-xl);border:1px solid var(--border)">
            <div style="font-size:48px;margin-bottom:14px">⚠️</div>
            <h3 style="font-family:var(--ff-d);font-size:22px;color:var(--navy);margin-bottom:8px">Booking not found</h3>
            <p style="color:var(--navy-m);font-size:15px;margin-bottom:18px">The link may have expired or been mistyped. Try checking your saved bookings below.</p>
          </div>`;
      }
    }

    // 4. Try to fetch fresh data for each saved booking (so status reflects updates)
    bookings = await Promise.all(saved.map(async (s) => {
      const fresh = await loadPublicBooking(s.lookupToken);
      return fresh ? { ...s, ...fresh } : s;
    }));

    // Render
    if (bookings.length === 0) {
      if (empty) empty.style.display = "";
      list.style.display = "none";
      return;
    }
    if (empty) empty.style.display = "none";
    list.style.display = "";

    // Sort by date (upcoming first, then past)
    const today = new Date().toISOString().split("T")[0];
    bookings.sort((a, b) => {
      const aDate = a.date || "";
      const bDate = b.date || "";
      const aUpcoming = aDate >= today;
      const bUpcoming = bDate >= today;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      return aUpcoming ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
    });

    list.innerHTML = bookings.map(b => {
      const isUpcoming = (b.date || "") >= today;
      const status = b.status || "confirmed";
      const statusColor = status === "cancelled" ? "var(--red)" : (status === "done" ? "var(--navy-m)" : "var(--green)");
      const statusLabel = status === "cancelled" ? "Cancelled" : (status === "done" ? "Completed" : (isUpcoming ? "Upcoming" : "Past"));

      return `
        <div style="background:white;border-radius:var(--r-xl);padding:24px;border:1px solid var(--border);margin-bottom:16px;${status === "cancelled" ? "opacity:0.7" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px">
            <div>
              <div style="font-family:var(--ff-d);font-size:20px;font-weight:700;color:var(--navy);line-height:1.2">${escapeHtml(b.doctor || "—")}</div>
              <div style="font-size:14px;color:var(--teal);font-weight:600;margin-top:3px">${escapeHtml(b.specialty || "")}</div>
            </div>
            <span style="background:${statusColor};color:white;padding:5px 12px;border-radius:14px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap">${statusLabel}</span>
          </div>
          <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:14px;color:var(--navy-s);line-height:1.6;padding-top:14px;border-top:1px solid var(--border)">
            <div><strong>📅</strong> ${escapeHtml(b.dateDisplay || b.date || "—")}</div>
            <div><strong>⏰</strong> ${escapeHtml(b.slot || "—")}</div>
            <div><strong>🆔</strong> Token ${escapeHtml(b.token || "—")}</div>
            <div><strong>💰</strong> ₹${escapeHtml(b.fee || "—")}</div>
          </div>
          <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
            <button onclick="copyMyApptLink('${b.lookupToken}')" class="btn-ghost" style="font-size:12px;padding:7px 14px">🔗 Copy link</button>
            <button onclick="removeMyAppt('${b.lookupToken}')" class="btn-ghost" style="font-size:12px;padding:7px 14px;color:var(--navy-m)">🗑 Remove from this device</button>
          </div>
        </div>`;
    }).join("");
  }

  window.copyMyApptLink = function (token) {
    const url = `${window.location.origin}${window.location.pathname.replace(/[^\/]*$/, "")}my-appointments.html?t=${token}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => alert("✅ Link copied!"),
        () => prompt("Copy this link manually:", url)
      );
    } else {
      prompt("Copy this link manually:", url);
    }
  };

  window.removeMyAppt = function (token) {
    if (!confirm("Remove this booking from your device?\n\nThis only removes it from this browser — your actual appointment is NOT cancelled. To cancel, contact us directly.")) return;
    try {
      const saved = JSON.parse(localStorage.getItem("hf_my_bookings") || "[]");
      const filtered = saved.filter(s => s.lookupToken !== token);
      localStorage.setItem("hf_my_bookings", JSON.stringify(filtered));
    } catch (e) {}
    location.reload();
  };

  window.checkLookupCode = async function () {
    const code = document.getElementById("lookupCode")?.value.trim();
    if (!code) { alert("Please paste a booking link or code."); return; }
    // Extract token from URL or use directly
    let token = code;
    const match = code.match(/[?&]t=([^&\s]+)/);
    if (match) token = match[1];
    window.location.href = `my-appointments.html?t=${encodeURIComponent(token)}`;
  };
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
