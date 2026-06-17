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
   🔐 ADMIN EMAIL — this is YOUR email
   You created this account in:
   Firebase Console → Authentication → Users
   See SECURITY-SETUP.md for full instructions.
───────────────────────────────────────────── */
const ADMIN_EMAIL = "kannan.ag10@gmail.com";

/* Normalize emails for comparison: strips invisible characters, normalizes unicode, lowercases, trims */
function normEmail(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "") // zero-width spaces, BOM, non-breaking space
    .trim()
    .toLowerCase();
}

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

/* Map display-friendly specialty names (from for-doctors application form) → category keys */
const SPECIALTY_DISPLAY_TO_KEY = {
  "General Physician": "General",
  "Cardiologist": "Cardiology",
  "Pediatrician": "Pediatrics",
  "Dermatologist": "Dermatology",
  "Orthopedic Surgeon": "Ortho",
  "Gynecologist": "Gynecology",
  "ENT Specialist": "ENT",
  "Ophthalmologist": "Ophthalmology",
  "Dentist": "Dental",
  "Psychiatrist": "Psychiatry"
};

function mapSpecialtyToKey(displayName) {
  if (!displayName) return "Other";
  return SPECIALTY_DISPLAY_TO_KEY[displayName] || "Other";
}

/* ─── Global time slot pool & default weekly schedule ─── */
const ALL_SLOTS = [
  "9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "12:00 PM","12:30 PM",
  "2:00 PM","2:30 PM","3:00 PM","3:30 PM","4:00 PM","4:30 PM","5:00 PM","5:30 PM",
  "6:00 PM","6:30 PM","7:00 PM","7:30 PM","8:00 PM"
];

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function defaultWeeklyPattern() {
  // Default: Mon-Sat with working hours; Sun off
  // New schema per day: { isOff, workingStart, workingEnd, slotLength, excludedSlots }
  const standard = { isOff: false, workingStart: "09:00", workingEnd: "13:00", slotLength: 30, excludedSlots: [] };
  return {
    "0": { isOff: true, workingStart: "09:00", workingEnd: "13:00", slotLength: 30, excludedSlots: [] },
    "1": { ...standard },
    "2": { ...standard },
    "3": { ...standard },
    "4": { ...standard },
    "5": { ...standard },
    "6": { ...standard }
  };
}

/* ─── Time helpers ─── */
function time24ToMinutes(t24) {
  // "09:30" → 570
  if (!t24) return 0;
  const [h, m] = t24.split(":").map(n => parseInt(n) || 0);
  return h * 60 + m;
}

function minutesToSlotLabel(mins) {
  // 570 → "9:30 AM"
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function generateSlotsFromWindow(workingStart, workingEnd, slotMinutes) {
  // Returns array of slot label strings, e.g. ["9:00 AM","9:20 AM",...]
  const startMins = time24ToMinutes(workingStart);
  const endMins = time24ToMinutes(workingEnd);
  const step = parseInt(slotMinutes) || 30;
  if (startMins >= endMins || step <= 0) return [];
  const slots = [];
  for (let t = startMins; t + step <= endMins; t += step) {
    slots.push(minutesToSlotLabel(t));
  }
  return slots;
}

/* Backwards-compatible: returns the array of ACTIVE slot labels for a day.
   Handles both the old array format and the new object format. */
function getActiveSlotsForDay(dayData) {
  if (!dayData) return [];
  // Old format: array of slot strings (no day-off concept; empty array = off)
  if (Array.isArray(dayData)) return dayData;
  // New format: object with workingStart/workingEnd/slotLength/excludedSlots
  if (dayData.isOff) return [];
  const all = generateSlotsFromWindow(dayData.workingStart, dayData.workingEnd, dayData.slotLength);
  const excluded = new Set(dayData.excludedSlots || []);
  return all.filter(s => !excluded.has(s));
}

function slotToMinutes(slot) {
  // "9:30 AM" → 570 (used to sort and to compare against current time)
  if (!slot) return 0;
  const m = slot.match(/^(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const isPM = m[3].toUpperCase() === "PM";
  if (h === 12) h = isPM ? 12 : 0;
  else if (isPM) h += 12;
  return h * 60 + min;
}

/* ═══════════════════════════════════
   i18n — Simple multi-language support
═══════════════════════════════════ */
const TRANSLATIONS = {
  en: {
    "nav.doctors": "Doctors",
    "nav.specialties": "Specialties",
    "nav.how_it_works": "How it works",
    "nav.for_doctors": "For Doctors",
    "nav.my_appointments": "My Appointments",
    "nav.book_appointment": "Book Appointment",
    "hero.title_part1": "Your health,",
    "hero.title_part2": "our",
    "hero.title_part3": "priority.",
    "hero.subtitle": "Find the right doctor, book a slot, and get confirmed instantly. Quality healthcare at your fingertips — anytime, anywhere in India.",
    "hero.cta_book": "Book an Appointment →",
    "hero.cta_how": "How it works",
    "search.placeholder": "Search by doctor name, specialty, or city...",
    "search.button": "Search",
    "doctors.heading": "Featured Doctors",
    "doctors.tag": "Meet the team",
    "doctors.sub": "Verified, experienced medical professionals — all available for online booking.",
    "specialties.heading": "Specialties on HealthFirst",
    "specialties.tag": "What we cover",
    "specialties.sub": "From general checkups to specialist consultations — find the right doctor for every health need.",
    "btn.book": "Book Appointment",
    "btn.cancel": "Cancel",
    "btn.reschedule": "Reschedule",
    "btn.signin": "Sign In",
    "btn.signout": "Sign Out",
    "btn.forgot_password": "Forgot password?",
    "myappts.title": "My Appointments",
    "myappts.empty_title": "No saved appointments",
    "lang.label": "Language"
  },
  hi: {
    "nav.doctors": "डॉक्टर्स",
    "nav.specialties": "विशेषज्ञता",
    "nav.how_it_works": "यह कैसे काम करता है",
    "nav.for_doctors": "डॉक्टरों के लिए",
    "nav.my_appointments": "मेरी अपॉइंटमेंट्स",
    "nav.book_appointment": "अपॉइंटमेंट बुक करें",
    "hero.title_part1": "आपका स्वास्थ्य,",
    "hero.title_part2": "हमारी",
    "hero.title_part3": "प्राथमिकता।",
    "hero.subtitle": "सही डॉक्टर ढूंढें, स्लॉट बुक करें, और तुरंत पुष्टि प्राप्त करें। भारत में कहीं भी, कभी भी गुणवत्तापूर्ण स्वास्थ्य सेवा।",
    "hero.cta_book": "अपॉइंटमेंट बुक करें →",
    "hero.cta_how": "यह कैसे काम करता है",
    "search.placeholder": "डॉक्टर का नाम, विशेषज्ञता, या शहर खोजें...",
    "search.button": "खोजें",
    "doctors.heading": "विशेष डॉक्टर्स",
    "doctors.tag": "टीम से मिलें",
    "doctors.sub": "सत्यापित, अनुभवी चिकित्सा पेशेवर — सभी ऑनलाइन बुकिंग के लिए उपलब्ध।",
    "specialties.heading": "HealthFirst पर विशेषज्ञताएं",
    "specialties.tag": "हम क्या कवर करते हैं",
    "specialties.sub": "सामान्य जांच से लेकर विशेषज्ञ परामर्श तक — हर स्वास्थ्य आवश्यकता के लिए सही डॉक्टर ढूंढें।",
    "btn.book": "अपॉइंटमेंट बुक करें",
    "btn.cancel": "रद्द करें",
    "btn.reschedule": "पुनर्निर्धारित करें",
    "btn.signin": "साइन इन करें",
    "btn.signout": "साइन आउट",
    "btn.forgot_password": "पासवर्ड भूल गए?",
    "myappts.title": "मेरी अपॉइंटमेंट्स",
    "myappts.empty_title": "कोई सहेजी गई अपॉइंटमेंट नहीं",
    "lang.label": "भाषा"
  }
};

function getCurrentLang() {
  try { return localStorage.getItem("hf_lang") || "en"; } catch (e) { return "en"; }
}

function setCurrentLang(lang) {
  try { localStorage.setItem("hf_lang", lang); } catch (e) {}
  applyTranslations();
}

function t(key) {
  const lang = getCurrentLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || (TRANSLATIONS.en[key] || key);
}

function applyTranslations() {
  const lang = getCurrentLang();
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    const translated = t(key);
    if (translated) el.textContent = translated;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const translated = t(key);
    if (translated) el.placeholder = translated;
  });
  // Update language picker if present
  const picker = document.getElementById("langPicker");
  if (picker) picker.value = lang;
}

window.switchLang = function (lang) {
  setCurrentLang(lang);
};

// Apply translations once DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyTranslations);
} else {
  setTimeout(applyTranslations, 0);
}

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
    const { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    const auth = getAuth(app);
    firebaseReady = true;
    window._fs = { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, getDoc, setDoc, query, orderBy, where, serverTimestamp };
    window._auth = { auth, signInWithEmailAndPassword, signOut, sendPasswordResetEmail };
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

  // ── If URL has ?signout=1, force a sign-out so login screen shows ──
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("signout") === "1" && user) {
    try { await window._auth.signOut(window._auth.auth); } catch (e) {}
    // Remove the ?signout=1 from URL so refresh doesn't re-trigger it
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, "", newUrl);
    return; // onAuthStateChanged will fire again with user=null
  }

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
    const userEmail = normEmail(user.email);
    const adminEmail = normEmail(ADMIN_EMAIL);
    if (userEmail === adminEmail) {
      const emailEl = document.getElementById("authedEmail");
      if (emailEl) emailEl.textContent = user.email;
      try { localStorage.setItem('hf_admin_name', 'Kannan'); } catch (e) {}
      showContent();
      document.dispatchEvent(new Event("admin-ready"));
    } else {
      console.error("❌ Admin email mismatch:");
      console.error("   Signed-in email:", JSON.stringify(user.email), "→ normalized:", JSON.stringify(userEmail));
      console.error("   ADMIN_EMAIL in app.js:", JSON.stringify(ADMIN_EMAIL), "→ normalized:", JSON.stringify(adminEmail));
      if (errEl) errEl.textContent = "This account doesn't have admin access. Open browser console (F12) to see what's mismatched.";
      window._auth.signOut(window._auth.auth);
    }
    return;
  }

  // Doctor gate (allows admin too)
  if (requireWhat === "doctor") {
    const userEmail = normEmail(user.email);
    const adminEmail = normEmail(ADMIN_EMAIL);
    const isAdminUser = userEmail === adminEmail;

    // Show / hide Admin Panel links based on role
    const showIfAdmin = (id, displayValue) => {
      const el = document.getElementById(id);
      if (el) el.style.display = isAdminUser ? displayValue : "none";
    };
    showIfAdmin("navAdminLink", "");           // <li> in top nav (default inline list-item)
    showIfAdmin("mobileAdminLink", "block");   // mobile menu <a>
    showIfAdmin("sidebarAdminLink", "flex");   // sidebar <a>

    if (isAdminUser) {
      // Admin shouldn't be viewing the doctor dashboard. Redirect them to their own panel.
      console.log("[auth] Admin user landed on doctor.html — redirecting to admin.html");
      window.location.replace("admin.html");
      return;
    }
    const docMatch = await loadDoctorByEmail(userEmail);
    if (docMatch) {
      window._currentDoctor = docMatch;
      const emailEl = document.getElementById("authedEmail");
      if (emailEl) emailEl.textContent = user.email;
      // Cache doctor's name for personalized splash on next reload
      try {
        const friendlyName = docMatch.name ? (docMatch.name.startsWith('Dr.') ? docMatch.name : 'Dr. ' + docMatch.name) : '';
        if (friendlyName) localStorage.setItem('hf_doctor_name', friendlyName);
      } catch (e) {}
      // Apply availability toggle state from doctor record (defaults to available)
      if (typeof window.applyAvailabilityUI === "function") {
        window.applyAvailabilityUI(docMatch.available === false);
      }
      // Apply existing profile photo if doctor has uploaded one
      if (docMatch.photoUrl && typeof window._applyDoctorPhotoToSidebar === "function") {
        window._applyDoctorPhotoToSidebar(docMatch.photoUrl);
      }
      showContent();
      document.dispatchEvent(new Event("doctor-ready"));
    } else {
      console.error("❌ No doctor found with email:", user.email);
      if (errEl) errEl.textContent = "This email isn't registered as a doctor. Contact your admin.";
      window._auth.signOut(window._auth.auth);
    }
    return;
  }
}

// Tracks consecutive failed login attempts in this browser session
let _failedLoginAttempts = 0;

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
    _failedLoginAttempts = 0; // Reset counter on success
    // hide any nudge we previously showed
    const nudge = document.getElementById("loginNudge");
    if (nudge) nudge.style.display = "none";
    // success path handled by handleAuthStateChange
  } catch (e) {
    console.error("Login error:", e);
    if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found") {
      _failedLoginAttempts += 1;
    }
    if (errEl) {
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found") {
        errEl.textContent = "Wrong email or password. Please try again.";
      } else if (e.code === "auth/too-many-requests") {
        errEl.textContent = "Too many failed attempts. Try again in a few minutes, or use Forgot Password below.";
      } else {
        errEl.textContent = "Sign-in failed: " + (e.message || "unknown error");
      }
    }
    // After 2 failed attempts → show a prominent "Forgot password?" nudge
    if (_failedLoginAttempts >= 2) {
      _showForgotPasswordNudge();
    }
    if (btn) { btn.disabled = false; btn.textContent = "Sign In"; }
  }
};

// Inject a prominent "trouble signing in?" callout above the small Forgot Password link
function _showForgotPasswordNudge() {
  // Only inject once
  if (document.getElementById("loginNudge")) {
    document.getElementById("loginNudge").style.display = "block";
    return;
  }
  const forgotLink = document.querySelector('a.auth-back[href*="doForgotPassword"]');
  if (!forgotLink) return;
  const nudge = document.createElement("div");
  nudge.id = "loginNudge";
  nudge.style.cssText = "background:#FEF3C7;border:1.5px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-top:12px;font-size:13px;color:#78350F;line-height:1.5";
  nudge.innerHTML = `
    <div style="font-weight:700;margin-bottom:4px">🤔 Trouble signing in?</div>
    <div style="margin-bottom:8px;font-size:12px">Maybe you forgot your password. Click below to get a secure reset link sent to your email.</div>
    <button onclick="doForgotPassword()" style="width:100%;padding:9px;background:#F59E0B;color:white;border:none;border-radius:6px;font-family:var(--ff);font-weight:700;font-size:13px;cursor:pointer">🔑 Send Me a Reset Link</button>
  `;
  forgotLink.parentNode.insertBefore(nudge, forgotLink);
  // Hide the now-redundant small link below
  forgotLink.style.display = "none";
}

window.doAdminLogout = async function () {
  if (!confirm("Sign out of admin?")) return;
  try {
    await window._auth.signOut(window._auth.auth);
  } catch (e) { console.error(e); }
  // Clear cached names so next sign-in doesn't show wrong name in splash
  try { localStorage.removeItem('hf_doctor_name'); localStorage.removeItem('hf_admin_name'); } catch (e) {}
  location.reload();
};

window.doForgotPassword = function () {
  // Open the modal; pre-fill from sign-in field if user already typed an email
  const modal = document.getElementById("forgotPasswordModal");
  if (!modal) {
    // Modal not present on this page → fall back to the old prompt flow
    const email = prompt("Enter your email to receive a password reset link:");
    if (!email) return;
    return doForgotPasswordWith(email);
  }
  // Reset modal state
  document.getElementById("fpStep1").style.display = "block";
  document.getElementById("fpStep2").style.display = "none";
  document.getElementById("fpError").style.display = "none";
  document.getElementById("fpError").textContent = "";

  // Pre-fill email if user already typed it in the sign-in form
  const loginEmail = (document.getElementById("loginEmail")?.value || "").trim();
  const emailInput = document.getElementById("fpEmail");
  emailInput.value = loginEmail;
  // Reset submit button
  const submitBtn = document.getElementById("fpSubmitBtn");
  submitBtn.disabled = false;
  submitBtn.textContent = "Send Reset Link";

  modal.style.display = "flex";
  // Auto-focus the email field
  setTimeout(() => emailInput.focus(), 50);
};

window.closeForgotPasswordModal = function () {
  const modal = document.getElementById("forgotPasswordModal");
  if (modal) modal.style.display = "none";
};

// Close forgot-password modal on Escape key
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    const modal = document.getElementById("forgotPasswordModal");
    if (modal && modal.style.display === "flex") {
      window.closeForgotPasswordModal();
    }
  }
});

window.submitForgotPassword = async function () {
  const emailInput = document.getElementById("fpEmail");
  const errorEl = document.getElementById("fpError");
  const submitBtn = document.getElementById("fpSubmitBtn");
  const email = (emailInput.value || "").trim();

  // Hide previous errors
  errorEl.style.display = "none";

  // Validation
  if (!email) {
    errorEl.textContent = "Please enter your email address.";
    errorEl.style.display = "block";
    emailInput.focus();
    return;
  }
  if (!email.includes("@") || !email.includes(".")) {
    errorEl.textContent = "That doesn't look like a valid email. Please check and try again.";
    errorEl.style.display = "block";
    emailInput.focus();
    return;
  }
  if (!window._auth) {
    errorEl.textContent = "Still connecting to our servers — please try again in a moment.";
    errorEl.style.display = "block";
    return;
  }

  // Show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  try {
    // After resetting, send them back to the doctor sign-in page on our site
    const actionCodeSettings = {
      url: window.location.origin + window.location.pathname.replace(/[^/]*$/, "") + "doctor.html",
      handleCodeInApp: false
    };
    await window._auth.sendPasswordResetEmail(window._auth.auth, email, actionCodeSettings);
    // Show success step
    document.getElementById("fpStep1").style.display = "none";
    document.getElementById("fpStep2").style.display = "block";
    document.getElementById("fpSentTo").textContent = email;
  } catch (e) {
    console.error("Reset error:", e);
    let msg;
    if (e.code === "auth/user-not-found") {
      msg = "No account found with this email. Double-check the spelling, or contact your admin if you think this is a mistake.";
    } else if (e.code === "auth/invalid-email") {
      msg = "That email format isn't valid. Please check and try again.";
    } else if (e.code === "auth/too-many-requests") {
      msg = "Too many attempts. Please wait a few minutes before trying again.";
    } else if (e.code === "auth/network-request-failed") {
      msg = "Network error. Please check your internet connection and try again.";
    } else {
      msg = "Could not send reset email: " + (e.message || "unknown error");
    }
    errorEl.textContent = msg;
    errorEl.style.display = "block";
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Reset Link";
  }
};

// Legacy function kept for backwards compatibility (other callers)
async function doForgotPasswordWith(email) {
  if (!window._auth) { alert("Connecting... try again in a moment."); return; }
  if (!email.includes("@")) { alert("Please enter a valid email."); return; }
  try {
    await window._auth.sendPasswordResetEmail(window._auth.auth, email);
    alert(`✅ Password reset email sent to ${email}.\n\nCheck your inbox (and spam folder) for the reset link.`);
  } catch (e) {
    console.error("Reset error:", e);
    if (e.code === "auth/user-not-found") {
      alert("No account found with that email. Double-check the spelling, or contact your admin.");
    } else if (e.code === "auth/invalid-email") {
      alert("That doesn't look like a valid email. Please try again.");
    } else {
      alert("Could not send reset email: " + (e.message || "unknown error"));
    }
  }
}

// ── Firebase helpers ──
async function saveBooking(data) {
  if (!firebaseReady) return null;
  const { collection, addDoc, doc, setDoc, updateDoc, serverTimestamp } = window._fs;
  try {
    // Generate lookupToken FIRST so we can store it in both bookings and publicBookings
    const lookupToken = "tk_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    // 1. Save full booking with lookupToken (admin + doctor-only readable)
    const ref = await addDoc(collection(db, "bookings"), { ...data, lookupToken, createdAt: serverTimestamp() });

    // 2. Save lightweight public slot record
    try {
      await addDoc(collection(db, "bookedSlots"), {
        doctorDate: data.doctorDate,
        slot: data.slot,
        bookingId: ref.id,
        lookupToken: lookupToken,
        doctorEmail: data.doctorEmail || "",
        status: "confirmed",
        createdAt: serverTimestamp()
      });
    } catch (slotErr) { console.warn("bookedSlots write failed:", slotErr); }

    // 3. Save patient-safe public lookup record
    try {
      await setDoc(doc(db, "publicBookings", lookupToken), {
        bookingId: ref.id,
        patientNameMasked: maskName(data.patientName),
        doctor: data.doctor,
        doctorId: data.doctorId || "",
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

/* Cancel a booking from the patient side (My Appointments page).
   Uses lookupToken to authorize the cancellation. */
async function cancelBookingAsPatient(lookupToken, bookingId) {
  if (!firebaseReady || !lookupToken || !bookingId) return false;
  const { doc, updateDoc, collection, getDocs, query, where, serverTimestamp } = window._fs;
  let allOk = true;

  // Update bookings.status with lookupToken match (Firestore rule verifies)
  try {
    await updateDoc(doc(db, "bookings", bookingId), {
      status: "cancelled",
      lookupToken: lookupToken,
      cancelledAt: serverTimestamp(),
      cancelledBy: "patient"
    });
  } catch (e) { console.error("cancelBookingAsPatient bookings:", e); allOk = false; }

  // Update publicBookings.status
  try {
    await updateDoc(doc(db, "publicBookings", lookupToken), {
      status: "cancelled",
      cancelledAt: serverTimestamp()
    });
  } catch (e) { console.error("cancelBookingAsPatient publicBookings:", e); }

  // Free up the slot in bookedSlots
  try {
    const q = query(collection(db, "bookedSlots"), where("bookingId", "==", bookingId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await updateDoc(doc(db, "bookedSlots", d.id), { status: "cancelled", lookupToken: lookupToken });
    }
  } catch (e) { console.error("cancelBookingAsPatient bookedSlots:", e); }

  return allOk;
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

async function loadDoctorById(id) {
  if (!firebaseReady || !id) return null;
  const { doc, getDoc } = window._fs;
  try {
    const snap = await getDoc(doc(db, "doctors", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) { console.error("loadDoctorById:", e); return null; }
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

/* ─── Doctor schedules ─── */
async function loadDoctorSchedule(doctorId) {
  if (!firebaseReady || !doctorId) {
    return { weeklyPattern: defaultWeeklyPattern(), blockedDates: [], bookingHorizonDays: 7 };
  }
  const { doc, getDoc } = window._fs;
  try {
    const snap = await getDoc(doc(db, "doctorSchedules", doctorId));
    if (!snap.exists()) {
      return { weeklyPattern: defaultWeeklyPattern(), blockedDates: [], bookingHorizonDays: 7 };
    }
    const data = snap.data();
    // Clamp horizon to allowed values; default to 7
    const allowed = [7, 14, 30];
    const horizon = allowed.includes(data.bookingHorizonDays) ? data.bookingHorizonDays : 7;
    return {
      weeklyPattern: data.weeklyPattern || defaultWeeklyPattern(),
      blockedDates: data.blockedDates || [],
      bookingHorizonDays: horizon
    };
  } catch (e) {
    console.error("loadDoctorSchedule:", e);
    return { weeklyPattern: defaultWeeklyPattern(), blockedDates: [], bookingHorizonDays: 7 };
  }
}

async function saveDoctorSchedule(doctorId, scheduleData) {
  if (!firebaseReady || !doctorId) return false;
  const { doc, setDoc, serverTimestamp } = window._fs;
  try {
    const allowed = [7, 14, 30];
    const horizon = allowed.includes(scheduleData.bookingHorizonDays) ? scheduleData.bookingHorizonDays : 7;
    await setDoc(doc(db, "doctorSchedules", doctorId), {
      weeklyPattern: scheduleData.weeklyPattern || defaultWeeklyPattern(),
      blockedDates: scheduleData.blockedDates || [],
      bookingHorizonDays: horizon,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (e) { console.error("saveDoctorSchedule:", e); return false; }
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
  if (!firebaseReady) return { ok: false, error: "Database not ready. Please refresh the page." };
  const { doc, updateDoc, collection, getDocs, query, where, getDoc } = window._fs;
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
    return { ok: true };
  } catch (e) {
    console.error("updateStatus:", e);
    // Fetch diagnostic info so the user can see why permission was denied
    let diag = "";
    try {
      const authEmail = (window._auth && window._auth.auth && window._auth.auth.currentUser && window._auth.auth.currentUser.email) || "(not signed in)";
      const bookingSnap = await getDoc(doc(db, "bookings", id));
      const bookingData = bookingSnap.exists() ? bookingSnap.data() : null;
      const bookingDoctorEmail = bookingData ? (bookingData.doctorEmail || "(empty)") : "(booking not found)";
      const isMatch = authEmail.toLowerCase().trim() === String(bookingDoctorEmail).toLowerCase().trim();
      diag = `\n\n── DIAGNOSTIC ──\nYou're logged in as: ${authEmail}\nBooking's doctor email: ${bookingDoctorEmail}\nEmails match: ${isMatch ? "YES" : "NO ❌"}\n\nFix: Make sure the doctor record's email field exactly matches the email you log in with (lowercase, no spaces).`;
    } catch (diagErr) { diag = "\n\n(Could not fetch diagnostic info: " + diagErr.message + ")"; }
    return { ok: false, error: (e.message || String(e)) + diag };
  }
}

/* ─── Doctor CRUD ─── */
async function loadDoctors(opts = {}) {
  if (!firebaseReady) return [];
  const { collection, getDocs } = window._fs;
  try {
    const snap = await getDocs(collection(db, "doctors"));
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.active !== false);
    // For public-facing pages (booking page, homepage), hide doctors who marked themselves offline.
    // Admin and doctor's own dashboard pass {includeUnavailable: true}.
    if (!opts.includeUnavailable) list = list.filter(d => d.available !== false);
    return list;
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
    window._homeAllDoctors = doctors; // cache for search filter
    renderHomeDoctors(doctors);
    renderHomeSpecialties(doctors);
    renderHomeStats(doctors);
    if (document.getElementById("liveReviewsGrid")) loadLiveReviews();

    // Handle ?q= URL param (when arriving from a search elsewhere)
    const qParam = getParam("q");
    const searchInput = document.getElementById("homeSearchInput");
    if (qParam && searchInput) {
      searchInput.value = qParam;
      filterHomeDoctors();
    }
  }

  window.filterHomeDoctors = function () {
    const q = (document.getElementById("homeSearchInput")?.value || "").trim().toLowerCase();
    const all = window._homeAllDoctors || [];
    if (!q) { renderHomeDoctors(all); return; }
    const filtered = all.filter(d =>
      (d.name || "").toLowerCase().includes(q) ||
      (d.specialty || "").toLowerCase().includes(q) ||
      (d.city || "").toLowerCase().includes(q) ||
      (d.state || "").toLowerCase().includes(q)
    );
    renderHomeDoctors(filtered);
  };

  window.searchAndGoToBook = function () {
    const q = (document.getElementById("homeSearchInput")?.value || "").trim();
    window.location.href = q ? `book.html?q=${encodeURIComponent(q)}` : "book.html";
  };

  function renderHomeStats(doctors) {
    // Legacy hero stat IDs (kept for backward compatibility)
    const el = document.getElementById("homeDoctorCount");
    if (el) el.textContent = doctors.length;
    const specCount = new Set(doctors.map(d => d.specialtyCategory || "Other")).size;
    const sEl = document.getElementById("homeSpecCount");
    if (sEl) sEl.textContent = specCount;

    // New hero card live stats (replaces old "Verified Doctors / ONLINE" header)
    const heroDoc = document.getElementById("heroDoctorCount");
    if (heroDoc) heroDoc.textContent = doctors.length || 0;
    const heroSpec = document.getElementById("heroSpecialtyCount");
    if (heroSpec) heroSpec.textContent = specCount || 0;
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
          <h3 style="font-family:var(--ff-d);font-size:22px;color:var(--navy);margin-bottom:8px">No doctors found</h3>
          <p style="color:var(--navy-m);font-size:15px;margin-bottom:18px;max-width:480px;margin-left:auto;margin-right:auto">Try a different search, or browse all doctors on the booking page.</p>
          <a href="for-doctors.html" class="btn-primary">Join as a Doctor →</a>
        </div>`;
      return;
    }
    // Show up to 8 when filtered, 4 when default view
    const searchActive = (document.getElementById("homeSearchInput")?.value || "").trim().length > 0;
    const featured = doctors.slice(0, searchActive ? 12 : 4);
    grid.innerHTML = featured.map(d => `
      <div class="doc-card">
        <a href="doctor-profile.html?id=${d.id}" style="text-decoration:none;color:inherit">
          <div class="doc-photo" style="${d.photoUrl ? "padding:0;overflow:hidden" : ""}">${d.photoUrl ? `<img src="${escapeHtml(d.photoUrl)}" alt="Dr. ${escapeHtml(d.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : escapeHtml(d.avatar || "👨‍⚕️")}</div>
        </a>
        <div class="doc-info">
          <a href="doctor-profile.html?id=${d.id}" style="text-decoration:none;color:inherit">
            <div class="doc-name">${escapeHtml(d.name)}</div>
            <div class="doc-spec">${escapeHtml(d.specialty || "")}</div>
            <div class="doc-cred">${escapeHtml(d.qualification || "")}${d.experience ? " · " + escapeHtml(d.experience) : ""}${d.city ? " · " + escapeHtml(d.city) : ""}</div>
          </a>
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
    const qParam = getParam("q");
    const feedbackParam = getParam("feedback");

    // If user arrived via a "leave feedback" link from WhatsApp, fetch that booking and open the rating modal
    if (feedbackParam) {
      await openFeedbackFlow(feedbackParam);
      return; // skip the rest of the booking-page setup
    }

    if (qParam) {
      const q = qParam.toLowerCase();
      const filtered = allDoctors.filter(d =>
        (d.name || "").toLowerCase().includes(q) ||
        (d.specialty || "").toLowerCase().includes(q) ||
        (d.city || "").toLowerCase().includes(q) ||
        (d.state || "").toLowerCase().includes(q)
      );
      renderDoctorList(filtered);
    }
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

  // Fetches a booking by ID, primes the feedback modal, and opens it.
  async function openFeedbackFlow(bookingId) {
    if (!firebaseReady) {
      alert("⏳ Loading… please try again in a moment.");
      return;
    }
    const { doc, getDoc } = window._fs;
    let bookingData = null;
    try {
      const snap = await getDoc(doc(db, "bookings", bookingId));
      if (snap.exists()) bookingData = snap.data();
    } catch (e) {
      console.warn("openFeedbackFlow getDoc failed (likely permissions). Falling back to publicBookings.", e);
    }
    // Fallback: try publicBookings (patient-safe summary, doesn't require auth)
    if (!bookingData) {
      try {
        const { collection, query, where, getDocs } = window._fs;
        const q = query(collection(db, "publicBookings"), where("bookingId", "==", bookingId));
        const qs = await getDocs(q);
        if (!qs.empty) bookingData = qs.docs[0].data();
      } catch (e) { console.warn("publicBookings query failed:", e); }
    }
    if (!bookingData) {
      alert("Sorry, we couldn't find your appointment. The feedback link may have expired.");
      return;
    }

    // Hide the rest of the booking page so the user focuses on feedback
    const layout = document.querySelector(".book-layout");
    const pageHeader = document.querySelector(".page-header");
    if (layout) layout.style.display = "none";
    if (pageHeader) {
      const ph = pageHeader.querySelector(".ph-title");
      const phs = pageHeader.querySelector(".ph-sub");
      if (ph) ph.textContent = "How was your visit?";
      if (phs) phs.textContent = `Share your experience with Dr. ${bookingData.doctor || "your doctor"}.`;
    }

    completedBookingForFeedback = {
      bookingId: bookingId,
      patientName: bookingData.patientName || "Patient",
      doctor: bookingData.doctor || "—",
      specialty: bookingData.specialty || ""
    };
    const sub = document.getElementById("fbModalSub");
    if (sub) sub.textContent = `Share your experience with Dr. ${bookingData.doctor || "—"}`;
    document.getElementById("fbModal").classList.add("open");
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
          <div class="dla" style="${d.photoUrl ? "padding:0;overflow:hidden" : ""}">${d.photoUrl ? `<img src="${escapeHtml(d.photoUrl)}" alt="${sName}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : sAvatar}</div>
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

  async function buildDatePicker() {
    const scroller = document.getElementById("dateScroller");
    if (!scroller) return;
    scroller.innerHTML = `<div style="padding:8px 4px;font-size:13px;color:var(--navy-m)">⏳ Loading available dates...</div>`;
    if (!selectedDoc) { scroller.innerHTML = ""; return; }

    // Load this doctor's schedule so we only show dates they actually work
    const schedule = await loadDoctorSchedule(selectedDoc.id);
    const blockedSet = new Set(schedule.blockedDates || []);

    const today = new Date();
    const availableDates = []; // {idx, date}
    // Use this doctor's chosen booking horizon (7, 14, or 30 days). Default 7.
    const horizon = [7, 14, 30].includes(schedule.bookingHorizonDays) ? schedule.bookingHorizonDays : 7;
    for (let i = 0; i < horizon; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const weekday = String(d.getDay());
      const dayPattern = schedule.weeklyPattern[weekday];
      const slots = getActiveSlotsForDay(dayPattern);
      if (slots.length === 0) continue; // day off / no slots configured
      const dateKey = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
      if (blockedSet.has(dateKey)) continue;
      availableDates.push({ idx: i, date: d });
    }

    // If the current selectedDateIdx is no longer in the available list, snap to the first one
    if (!availableDates.find(x => x.idx === selectedDateIdx) && availableDates.length > 0) {
      selectedDateIdx = availableDates[0].idx;
      selectedSlot = null;
    }

    scroller.innerHTML = "";
    if (availableDates.length === 0) {
      scroller.innerHTML = `<div style="padding:18px;text-align:center;font-size:14px;color:var(--navy-m);width:100%">📅 This doctor has not set their availability yet. Please check back later.</div>`;
      return;
    }

    availableDates.forEach(({ idx, date: d }) => {
      const chip = document.createElement("button");
      chip.className = "date-chip" + (idx === selectedDateIdx ? " selected" : "");
      chip.innerHTML = `<span class="dc-day">${DAYS[d.getDay()]}</span><span class="dc-num">${d.getDate()}</span>`;
      chip.addEventListener("click", () => {
        selectedDateIdx = idx; selectedSlot = null;
        buildDatePicker(); buildTimeSlots(); updateSummaryPanel();
      });
      scroller.appendChild(chip);
    });
  }

  async function buildTimeSlots() {
    const grid = document.getElementById("timeGrid");
    if (!grid) return;
    grid.innerHTML = `<div style="grid-column:1/-1;padding:14px;text-align:center;font-size:13px;color:var(--navy-m)">⏳ Loading doctor's schedule...</div>`;
    if (!selectedDoc) { grid.innerHTML = ""; return; }

    // 1. Get this doctor's schedule
    const schedule = await loadDoctorSchedule(selectedDoc.id);

    // 2. Get selected date info
    const dateKey = getSelectedDateKey();
    const dateObj = new Date(); dateObj.setDate(dateObj.getDate() + selectedDateIdx);
    const weekday = String(dateObj.getDay());

    // 3. Check if date is blocked
    if (schedule.blockedDates && schedule.blockedDates.includes(dateKey)) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;font-size:14px;color:var(--navy-m);background:var(--bg);border-radius:var(--r-lg)">🚫 Doctor is not available on this date. Please pick another date.</div>`;
      return;
    }

    // 4. Get available slots for this weekday (already returns slots in chronological order)
    const allowedSlots = getActiveSlotsForDay(schedule.weeklyPattern[weekday]);
    if (allowedSlots.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;font-size:14px;color:var(--navy-m);background:var(--bg);border-radius:var(--r-lg)">📅 Doctor doesn't see patients on ${DAY_NAMES[parseInt(weekday)]}s. Please pick another date.</div>`;
      return;
    }

    // 5. Get booked slots
    const bookedSlots = await getBookedSlots(selectedDoc.name, dateKey);

    // 6. Filter out past slots if booking for today
    const isToday = selectedDateIdx === 0;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const futureSlots = isToday
      ? allowedSlots.filter(s => slotToMinutes(s) > nowMins)
      : allowedSlots;

    if (futureSlots.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;font-size:14px;color:var(--navy-m);background:var(--bg);border-radius:var(--r-lg)">⏰ All of today's slots have already passed. Please pick another date.</div>`;
      return;
    }

    // 7. Render — use the doctor's actual slot list, sorted chronologically
    grid.innerHTML = "";
    futureSlots.forEach(slot => {
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
      theme: { color: "#4F46E5" },
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
/* ═══════════════════════════════════════════════════════════════════════
   BILLING SYSTEM — Doctor subscriptions & per-booking commissions
   Two plans (matching for-doctors.html pricing radios):
     - 'subscription' → ₹2,000 / month flat
     - 'commission'   → 10% per completed booking
   Invoice schema (Firestore collection "invoices"):
     { doctorId, doctorEmail, doctorName, plan, periodMonth (YYYY-MM),
       amount, bookingCount, bookingRevenue,
       status: 'pending' | 'paid' | 'overdue' | 'cancelled',
       generatedAt, dueDate (YYYY-MM-DD), paidAt, paymentMethod,
       paymentReference, notes }
   ═══════════════════════════════════════════════════════════════════════ */

// PLAN RATES — change here if pricing ever changes (also update for-doctors.html)
const BILLING_RATES = {
  subscription: { monthly: 2000, label: "₹2,000/mo Subscription" },
  commission:   { percent: 10,   label: "10% per Booking" }
};

// ADMIN's payment receiving details — shown on invoices for doctors to pay you.
// These are the DEFAULT values. They get overridden at runtime by what's stored
// in Firestore at `settings/billing` (admin can edit via the admin panel).
let BILLING_PAYMENT_INFO = {
  upiId:     "kannan@upi",
  accountHolder: "HealthFirst",
  bankName:  "[Your Bank Name]",
  accountNo: "[Your Account Number]",
  ifsc:      "[Your IFSC]",
  contactEmail: "hello@healthfirst.in"
};

// Load admin-configured payment info from Firestore (runs early on every page).
// Falls back to the hardcoded defaults above if Firestore doc doesn't exist.
async function _loadBillingSettings() {
  if (!firebaseReady) return;
  try {
    const { doc, getDoc } = window._fs;
    const snap = await getDoc(doc(db, "settings", "billing"));
    if (snap.exists()) {
      BILLING_PAYMENT_INFO = { ...BILLING_PAYMENT_INFO, ...snap.data() };
    }
  } catch (e) { console.warn("Billing settings load:", e); }
}

// Admin saves new settings to Firestore + updates local cache
window.saveBillingSettings = async function () {
  const fields = ['upiId', 'accountHolder', 'bankName', 'accountNo', 'ifsc', 'contactEmail'];
  const data = {};
  for (const f of fields) {
    const el = document.getElementById('bs_' + f);
    if (el) data[f] = (el.value || "").trim();
  }
  if (!data.upiId) { alert("UPI ID is required."); return; }

  const btn = document.getElementById('bsSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }

  try {
    const { doc, setDoc, serverTimestamp } = window._fs;
    await setDoc(doc(db, "settings", "billing"), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    BILLING_PAYMENT_INFO = { ...BILLING_PAYMENT_INFO, ...data };
    if (btn) { btn.disabled = false; btn.textContent = "✓ Saved"; setTimeout(() => { btn.textContent = "💾 Save Payment Details"; }, 2000); }
    // Re-render billing so any visible amounts pick up updated contactEmail etc.
    if (typeof window.renderAdminBilling === 'function') window.renderAdminBilling();
  } catch (e) {
    alert("❌ Could not save: " + e.message + "\n\nMake sure the firestore.rules includes the /settings/{settingId} rule.");
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save Payment Details"; }
  }
};

// ── Helper: format YYYY-MM into "June 2026"
function _formatPeriodLabel(periodMonth) {
  if (!periodMonth) return "—";
  const [y, m] = periodMonth.split("-");
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
}

// ── Helper: current period YYYY-MM
function _currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ── Helper: days since a YYYY-MM-DD date
function _daysSince(yyyymmdd) {
  if (!yyyymmdd) return 0;
  const d = new Date(yyyymmdd + "T00:00:00");
  const diff = (new Date() - d) / (1000 * 60 * 60 * 24);
  return Math.floor(diff);
}

// ── Calculates this month's commission amount for a doctor (sum of fees × 10%)
async function _calculateCommissionForPeriod(doctorEmail, periodMonth) {
  if (!firebaseReady) return { amount: 0, bookingCount: 0, bookingRevenue: 0 };
  try {
    const { collection, query, where, getDocs } = window._fs;
    const q = query(collection(db, "bookings"), where("doctorEmail", "==", doctorEmail), where("status", "==", "done"));
    const snap = await getDocs(q);
    let revenue = 0, count = 0;
    snap.forEach(d => {
      const b = d.data();
      if (!b.date) return;
      const bookingMonth = b.date.substring(0, 7); // YYYY-MM
      if (bookingMonth === periodMonth) {
        revenue += parseInt(b.fee) || 0;
        count += 1;
      }
    });
    return { amount: Math.round(revenue * BILLING_RATES.commission.percent / 100), bookingCount: count, bookingRevenue: revenue };
  } catch (e) {
    console.error("Commission calc failed:", e); return { amount: 0, bookingCount: 0, bookingRevenue: 0 };
  }
}

// ── Load all invoices (admin) or filter to one doctor (doctor view)
async function _loadInvoices(filterDoctorEmail) {
  if (!firebaseReady) return [];
  try {
    const { collection, query, where, getDocs } = window._fs;
    let q;
    if (filterDoctorEmail) {
      q = query(collection(db, "invoices"), where("doctorEmail", "==", filterDoctorEmail));
    } else {
      q = collection(db, "invoices");
    }
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.periodMonth || "").localeCompare(a.periodMonth || ""));
    return list;
  } catch (e) {
    console.error("Load invoices:", e); return [];
  }
}

// ── Auto-suspend doctors with invoices overdue 30+ days
async function _autoSuspendOverdueDoctors(invoices, doctorsMap) {
  if (!firebaseReady) return 0;
  const { doc, updateDoc } = window._fs;
  let suspendedCount = 0;
  // Group: doctorEmail → has 30+ day overdue invoice
  const flagged = new Set();
  invoices.forEach(inv => {
    if (inv.status === "paid" || inv.status === "cancelled") return;
    const days = _daysSince(inv.dueDate);
    if (days >= 30) flagged.add(inv.doctorEmail);
  });
  for (const email of flagged) {
    const d = doctorsMap[email];
    if (d && d.available !== false) {
      try {
        await updateDoc(doc(db, "doctors", d.id), { available: false });
        d.available = false;
        suspendedCount += 1;
      } catch (e) { console.warn("Auto-suspend failed for", email, e); }
    }
  }
  return suspendedCount;
}

// ────────────────────────────────────────────────────────────
// ADMIN BILLING VIEW
// ────────────────────────────────────────────────────────────

window.renderAdminBilling = async function () {
  const list = document.getElementById("billingDoctorList");
  if (!list) return;
  list.innerHTML = `<div style="text-align:center;color:var(--navy-m);font-size:13px;padding:14px">Loading…</div>`;

  // Load latest billing settings from Firestore so PDFs use the right UPI/bank info
  await _loadBillingSettings();

  // Render the admin settings form (collapsible) at top of list
  const settingsHTML = `
    <details style="margin-bottom:14px;background:#FEF9F0;border:1px solid #F5E8C5;border-radius:var(--r);overflow:hidden">
      <summary style="cursor:pointer;padding:12px 16px;font-weight:700;color:#92400E;font-size:13px;display:flex;justify-content:space-between;align-items:center;list-style:none">
        <span>⚙️ Payment Receiving Details <span style="font-weight:500;color:var(--navy-m);font-size:12px;margin-left:6px">(shown on every invoice)</span></span>
        <span style="font-size:11px;color:var(--navy-m);font-weight:500">Click to edit ▾</span>
      </summary>
      <div style="padding:14px 16px;border-top:1px solid #F5E8C5">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="grid-column:1/-1">
            <label style="display:block;font-size:11px;font-weight:700;color:var(--navy-s);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">UPI ID *</label>
            <input id="bs_upiId" type="text" value="${escapeHtml(BILLING_PAYMENT_INFO.upiId || '')}" placeholder="yourname@bank" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:6px;font-family:'Courier New',monospace;font-size:13px;background:white;outline:none">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:var(--navy-s);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Account Holder</label>
            <input id="bs_accountHolder" type="text" value="${escapeHtml(BILLING_PAYMENT_INFO.accountHolder || '')}" placeholder="HealthFirst" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:6px;font-family:var(--ff);font-size:13px;background:white;outline:none">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:var(--navy-s);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Bank Name</label>
            <input id="bs_bankName" type="text" value="${escapeHtml(BILLING_PAYMENT_INFO.bankName || '')}" placeholder="SBI / HDFC / etc." style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:6px;font-family:var(--ff);font-size:13px;background:white;outline:none">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:var(--navy-s);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Account Number</label>
            <input id="bs_accountNo" type="text" value="${escapeHtml(BILLING_PAYMENT_INFO.accountNo || '')}" placeholder="XXXXXXXX1234" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:6px;font-family:'Courier New',monospace;font-size:13px;background:white;outline:none">
          </div>
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:var(--navy-s);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">IFSC Code</label>
            <input id="bs_ifsc" type="text" value="${escapeHtml(BILLING_PAYMENT_INFO.ifsc || '')}" placeholder="SBIN0001234" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:6px;font-family:'Courier New',monospace;font-size:13px;background:white;outline:none">
          </div>
          <div style="grid-column:1/-1">
            <label style="display:block;font-size:11px;font-weight:700;color:var(--navy-s);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Contact Email for Payment Queries</label>
            <input id="bs_contactEmail" type="email" value="${escapeHtml(BILLING_PAYMENT_INFO.contactEmail || '')}" placeholder="hello@healthfirst.in" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:6px;font-family:var(--ff);font-size:13px;background:white;outline:none">
          </div>
        </div>
        <button id="bsSaveBtn" onclick="saveBillingSettings()" style="margin-top:12px;width:100%;padding:10px;background:var(--teal);color:white;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-family:var(--ff);font-size:13px">💾 Save Payment Details</button>
        <div style="margin-top:8px;font-size:11px;color:var(--navy-m);text-align:center">Saved once — appears on all future invoices automatically</div>
      </div>
    </details>
  `;

  const doctors = window._allDoctors || (await loadDoctors());
  const invoices = await _loadInvoices();

  // Build per-doctor billing summary
  const doctorsMap = {};
  doctors.forEach(d => { doctorsMap[(d.email || "").toLowerCase()] = d; });

  // Update invoice statuses (anything past due date → mark as overdue in display)
  invoices.forEach(inv => {
    if (inv.status === "pending" && _daysSince(inv.dueDate) > 0) inv.status = "overdue";
  });

  // Auto-suspend any doctor with 30+ day overdue invoice
  const suspendedNow = await _autoSuspendOverdueDoctors(invoices, doctorsMap);
  if (suspendedNow > 0) {
    console.log(`Auto-suspended ${suspendedNow} doctor(s) with 30+ day overdue invoices.`);
  }

  // Summary calculations for the cards
  const currentPeriod = _currentPeriod();
  let sumInvoiced = 0, sumCollected = 0, sumPending = 0, sumOverdue = 0;
  let countPending = 0, countOverdue = 0;
  invoices.forEach(inv => {
    const amt = inv.amount || 0;
    if (inv.periodMonth === currentPeriod) sumInvoiced += amt;
    if (inv.status === "paid" && inv.paidAt) {
      const paidDate = inv.paidAt.toDate ? inv.paidAt.toDate() : new Date(inv.paidAt);
      if (paidDate.toISOString().substring(0, 7) === currentPeriod) sumCollected += amt;
    }
    if (inv.status === "pending") { sumPending += amt; countPending += 1; }
    if (inv.status === "overdue") { sumOverdue += amt; countOverdue += 1; }
  });

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl("billSumInvoiced", sumInvoiced.toLocaleString("en-IN"));
  setEl("billSumCollected", sumCollected.toLocaleString("en-IN"));
  setEl("billSumPending", sumPending.toLocaleString("en-IN"));
  setEl("billSumOverdue", sumOverdue.toLocaleString("en-IN"));
  setEl("billCountPending", countPending);
  setEl("billCountOverdue", countOverdue);

  // Filter
  const filterStatus = document.getElementById("billingFilterStatus")?.value || "all";

  // Per-doctor rows
  if (doctors.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--navy-m);font-size:13px;padding:24px">No doctors on the platform yet. Approve applications to get started.</div>`;
    return;
  }

  const rows = doctors.map(d => {
    const email = (d.email || "").toLowerCase();
    const docInvoices = invoices.filter(i => (i.doctorEmail || "").toLowerCase() === email);
    const currentInv = docInvoices.find(i => i.periodMonth === currentPeriod);
    const lastPaid = docInvoices.filter(i => i.status === "paid").sort((a, b) => {
      const ad = a.paidAt?.toDate ? a.paidAt.toDate() : new Date(a.paidAt || 0);
      const bd = b.paidAt?.toDate ? b.paidAt.toDate() : new Date(b.paidAt || 0);
      return bd - ad;
    })[0];
    const overdueInvoices = docInvoices.filter(i => i.status === "overdue" || (i.status === "pending" && _daysSince(i.dueDate) > 0));
    const oldestOverdue = overdueInvoices.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))[0];

    // Determine status pill
    let statusPill;
    if (oldestOverdue && _daysSince(oldestOverdue.dueDate) >= 30) {
      statusPill = `<span style="background:#FEE2E2;color:#991B1B;font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px">🔴 OVERDUE ${_daysSince(oldestOverdue.dueDate)}d</span>`;
    } else if (overdueInvoices.length > 0) {
      statusPill = `<span style="background:#FEF3C7;color:#92400E;font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px">🟡 OVERDUE</span>`;
    } else if (currentInv && currentInv.status === "pending") {
      statusPill = `<span style="background:#FEF3C7;color:#92400E;font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px">⏳ PENDING</span>`;
    } else if (currentInv && currentInv.status === "paid") {
      statusPill = `<span style="background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px">✓ PAID</span>`;
    } else {
      statusPill = `<span style="background:var(--bg);color:var(--navy-m);font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px">— NO INVOICE</span>`;
    }

    // Filter check
    if (filterStatus !== "all") {
      if (filterStatus === "pending" && !(currentInv && currentInv.status === "pending")) return "";
      if (filterStatus === "overdue" && overdueInvoices.length === 0) return "";
      if (filterStatus === "paid" && !(currentInv && currentInv.status === "paid")) return "";
    }

    const planLabel = d.pricingModel === "commission"
      ? BILLING_RATES.commission.label
      : BILLING_RATES.subscription.label;
    const dueText = currentInv
      ? `₹${(currentInv.amount || 0).toLocaleString("en-IN")} <span style="font-size:11px;color:var(--navy-m)">· ${currentInv.id}</span>`
      : `<span style="font-size:12px;color:var(--navy-m);font-style:italic">Not generated yet</span>`;
    const lastPaidText = lastPaid
      ? `₹${(lastPaid.amount || 0).toLocaleString("en-IN")} <span style="font-size:11px;color:var(--navy-m)">· ${_formatPeriodLabel(lastPaid.periodMonth)}</span>`
      : `<span style="font-size:12px;color:var(--navy-m);font-style:italic">No payments yet</span>`;
    const isSuspended = d.available === false;

    return `
      <div style="background:var(--bg);border-radius:var(--r);padding:14px 16px;margin-bottom:10px;border:1px solid var(--border)${isSuspended ? ';opacity:0.7' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:220px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
              <div style="font-family:var(--ff-d);font-weight:700;color:var(--navy);font-size:15px">${escapeHtml(d.name || "Unnamed")}</div>
              ${statusPill}
              ${isSuspended ? '<span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">SUSPENDED</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--navy-m);margin-bottom:3px">📋 Plan: <strong style="color:var(--navy-s)">${planLabel}</strong></div>
            <div style="font-size:12px;color:var(--navy-m);margin-bottom:3px">📧 ${escapeHtml(d.email || "")}</div>
            <div style="display:flex;gap:20px;margin-top:6px;flex-wrap:wrap">
              <div style="font-size:12px"><span style="color:var(--navy-m)">${_formatPeriodLabel(currentPeriod)} due:</span> <strong>${dueText}</strong></div>
              <div style="font-size:12px"><span style="color:var(--navy-m)">Last paid:</span> ${lastPaidText}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${!currentInv ? `<button onclick="openGenerateInvoice('${d.id}','${escapeHtml(d.email || "")}')" style="padding:6px 12px;background:var(--teal);color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--ff)">🧾 Generate</button>` : ""}
            ${currentInv && currentInv.status !== "paid" ? `<button onclick="openMarkPaid('${currentInv.id}')" style="padding:6px 12px;background:#10B981;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--ff)">✓ Mark Paid</button>` : ""}
            ${currentInv ? `<button onclick="downloadInvoicePDF('${currentInv.id}')" style="padding:6px 12px;background:var(--navy);color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--ff)" title="Open invoice PDF">📄 PDF</button>` : ""}
            ${currentInv ? `<button onclick="shareInvoiceWhatsApp('${currentInv.id}')" style="padding:6px 12px;background:#25D366;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--ff)">📱 WhatsApp</button>` : ""}
            <button onclick="toggleDoctorHistory('${d.id}')" style="padding:6px 12px;background:transparent;color:var(--navy-s);border:1px solid var(--border-md);border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--ff)">📜 History</button>
            ${isSuspended ? `<button onclick="reactivateDoctor('${d.id}')" style="padding:6px 12px;background:#10B981;color:white;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--ff)">🔓 Reactivate</button>` : ""}
          </div>
        </div>
        <div id="docHistory-${d.id}" style="display:none;margin-top:12px;border-top:1px dashed var(--border-md);padding-top:12px">
          ${docInvoices.length === 0 ? '<div style="font-size:12px;color:var(--navy-m);text-align:center;padding:10px">No invoices yet for this doctor.</div>' : docInvoices.map(inv => `
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:7px 0;border-bottom:1px solid var(--border)">
              <div>
                <strong style="color:var(--navy)">${_formatPeriodLabel(inv.periodMonth)}</strong>
                <span style="color:var(--navy-m);margin-left:8px">${inv.id}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-weight:700">₹${(inv.amount || 0).toLocaleString("en-IN")}</span>
                <span style="font-size:10px;padding:2px 7px;border-radius:8px;font-weight:700;${inv.status === 'paid' ? 'background:#D1FAE5;color:#065F46' : inv.status === 'overdue' ? 'background:#FEE2E2;color:#991B1B' : 'background:#FEF3C7;color:#92400E'}">${inv.status.toUpperCase()}</span>
                <button onclick="downloadInvoicePDF('${inv.id}')" style="background:none;border:1px solid var(--border-md);color:var(--navy-s);padding:3px 8px;border-radius:5px;font-size:10px;cursor:pointer;font-family:var(--ff)">PDF</button>
                ${inv.status !== 'paid' ? `<button onclick="openMarkPaid('${inv.id}')" style="background:#10B981;border:none;color:white;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--ff)">Mark Paid</button>` : ''}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).filter(Boolean).join("");

  list.innerHTML = settingsHTML + (rows || `<div style="text-align:center;color:var(--navy-m);font-size:13px;padding:24px">No doctors match the current filter.</div>`);

  // Cache for downstream operations
  window._allInvoices = invoices;
  window._billingDoctorsMap = doctorsMap;
};

window.toggleDoctorHistory = function (docId) {
  const el = document.getElementById(`docHistory-${docId}`);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
};

window.reactivateDoctor = async function (docId) {
  if (!confirm("Reactivate this doctor? They'll be visible to patients again.\n\nMake sure they've paid before doing this.")) return;
  try {
    const { doc, updateDoc } = window._fs;
    await updateDoc(doc(db, "doctors", docId), { available: true });
    alert("✅ Doctor reactivated.");
    renderAdminBilling();
  } catch (e) { alert("❌ Could not reactivate: " + e.message); }
};

// ── Open Generate Invoice modal
window.openGenerateInvoice = async function (doctorId, doctorEmail) {
  const doctors = window._allDoctors || (await loadDoctors());
  const d = doctors.find(x => x.id === doctorId);
  if (!d) { alert("Doctor not found."); return; }

  const period = _currentPeriod();
  const periodLabel = _formatPeriodLabel(period);
  const plan = d.pricingModel || "subscription";

  let amount, breakdown;
  if (plan === "commission") {
    const calc = await _calculateCommissionForPeriod(doctorEmail.toLowerCase(), period);
    amount = calc.amount;
    breakdown = `${calc.bookingCount} completed booking${calc.bookingCount !== 1 ? "s" : ""} · ₹${calc.bookingRevenue.toLocaleString("en-IN")} revenue · 10% = ₹${amount.toLocaleString("en-IN")}`;
  } else {
    amount = BILLING_RATES.subscription.monthly;
    breakdown = `Flat monthly subscription`;
  }

  const body = document.getElementById("genInvoiceBody");
  body.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--r);padding:14px;margin-bottom:14px;font-size:13px;line-height:1.6">
      <div><strong>Doctor:</strong> ${escapeHtml(d.name)}</div>
      <div><strong>Email:</strong> ${escapeHtml(d.email)}</div>
      <div><strong>Plan:</strong> ${plan === "commission" ? BILLING_RATES.commission.label : BILLING_RATES.subscription.label}</div>
      <div><strong>Period:</strong> ${periodLabel}</div>
      <div style="margin-top:6px;color:var(--navy-m);font-size:12px">${breakdown}</div>
    </div>
    <div style="margin-bottom:12px">
      <label style="display:block;font-size:12px;font-weight:700;color:var(--navy-s);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">Amount (₹)</label>
      <input id="genInvAmount" type="number" value="${amount}" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:15px;font-weight:700;background:white;outline:none">
    </div>
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:12px;font-weight:700;color:var(--navy-s);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">Due in (days from now)</label>
      <input id="genInvDueDays" type="number" value="7" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:14px;background:white;outline:none">
    </div>
    <div style="margin-bottom:16px">
      <label style="display:block;font-size:12px;font-weight:700;color:var(--navy-s);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">Notes (optional)</label>
      <textarea id="genInvNotes" placeholder="e.g., Special offer applied" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:13px;background:white;outline:none;min-height:60px;resize:vertical"></textarea>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="closeGenInvoiceModal()" style="flex:1;padding:11px;background:var(--bg);border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-weight:600;color:var(--navy);cursor:pointer">Cancel</button>
      <button onclick="confirmGenerateInvoice('${doctorId}','${escapeHtml(doctorEmail.toLowerCase())}','${escapeHtml(d.name)}','${plan}','${period}')" style="flex:2;padding:11px;background:var(--teal);color:white;border:none;border-radius:var(--r);font-family:var(--ff);font-weight:700;cursor:pointer">Generate Invoice</button>
    </div>
  `;
  document.getElementById("genInvoiceModal").style.display = "flex";
};

window.closeGenInvoiceModal = function () {
  document.getElementById("genInvoiceModal").style.display = "none";
};

window.confirmGenerateInvoice = async function (doctorId, doctorEmail, doctorName, plan, period) {
  const amount = parseInt(document.getElementById("genInvAmount").value) || 0;
  const dueDays = parseInt(document.getElementById("genInvDueDays").value) || 7;
  const notes = (document.getElementById("genInvNotes").value || "").trim();
  if (amount <= 0) { alert("Amount must be greater than zero."); return; }

  const now = new Date();
  const due = new Date(now); due.setDate(now.getDate() + dueDays);
  const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;

  // Generate invoice ID
  const invId = `INV-${period.replace("-", "")}-${doctorId.substring(0, 6).toUpperCase()}`;

  let bookingCount = 0, bookingRevenue = 0;
  if (plan === "commission") {
    const calc = await _calculateCommissionForPeriod(doctorEmail, period);
    bookingCount = calc.bookingCount;
    bookingRevenue = calc.bookingRevenue;
  }

  try {
    const { doc, setDoc, serverTimestamp } = window._fs;
    await setDoc(doc(db, "invoices", invId), {
      doctorId, doctorEmail, doctorName,
      plan, periodMonth: period,
      amount, bookingCount, bookingRevenue,
      status: "pending",
      generatedAt: serverTimestamp(),
      dueDate,
      paidAt: null,
      paymentMethod: null,
      paymentReference: null,
      notes
    });
    closeGenInvoiceModal();
    alert(`✅ Invoice ${invId} generated for ₹${amount.toLocaleString("en-IN")}.\n\nDue date: ${dueDate}`);
    renderAdminBilling();
  } catch (e) {
    alert("❌ Could not save invoice: " + e.message + "\n\nMake sure firestore.rules includes the /invoices collection rule.");
  }
};

// ── Mark invoice as paid
window.openMarkPaid = function (invoiceId) {
  const inv = (window._allInvoices || []).find(i => i.id === invoiceId);
  if (!inv) { alert("Invoice not found. Refresh and try again."); return; }

  const today = new Date().toISOString().split("T")[0];
  document.getElementById("markPaidBody").innerHTML = `
    <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:var(--r);padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.6">
      <div><strong>Doctor:</strong> ${escapeHtml(inv.doctorName)}</div>
      <div><strong>Invoice:</strong> ${inv.id}</div>
      <div><strong>Period:</strong> ${_formatPeriodLabel(inv.periodMonth)}</div>
      <div><strong>Amount:</strong> ₹${(inv.amount || 0).toLocaleString("en-IN")}</div>
    </div>
    <div style="margin-bottom:12px">
      <label style="display:block;font-size:12px;font-weight:700;color:var(--navy-s);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">Payment Method</label>
      <select id="paidMethod" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:14px;background:white;outline:none">
        <option value="UPI">UPI</option>
        <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
        <option value="Cash">Cash</option>
        <option value="Cheque">Cheque</option>
        <option value="Other">Other</option>
      </select>
    </div>
    <div style="margin-bottom:12px">
      <label style="display:block;font-size:12px;font-weight:700;color:var(--navy-s);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">Payment Date</label>
      <input id="paidDate" type="date" value="${today}" max="${today}" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:14px;background:white;outline:none">
    </div>
    <div style="margin-bottom:16px">
      <label style="display:block;font-size:12px;font-weight:700;color:var(--navy-s);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px">Reference / Transaction ID (optional)</label>
      <input id="paidRef" type="text" placeholder="e.g., UPI ref no, cheque no" style="width:100%;padding:11px 14px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:14px;background:white;outline:none">
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="closeMarkPaidModal()" style="flex:1;padding:11px;background:var(--bg);border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-weight:600;color:var(--navy);cursor:pointer">Cancel</button>
      <button onclick="confirmMarkPaid('${invoiceId}')" style="flex:2;padding:11px;background:#10B981;color:white;border:none;border-radius:var(--r);font-family:var(--ff);font-weight:700;cursor:pointer">✓ Mark as Paid</button>
    </div>
  `;
  document.getElementById("markPaidModal").style.display = "flex";
};

window.closeMarkPaidModal = function () {
  document.getElementById("markPaidModal").style.display = "none";
};

window.confirmMarkPaid = async function (invoiceId) {
  const method = document.getElementById("paidMethod").value;
  const date = document.getElementById("paidDate").value;
  const ref = (document.getElementById("paidRef").value || "").trim();
  if (!date) { alert("Please pick a payment date."); return; }
  try {
    const { doc, updateDoc } = window._fs;
    await updateDoc(doc(db, "invoices", invoiceId), {
      status: "paid",
      paidAt: new Date(date + "T12:00:00"),
      paymentMethod: method,
      paymentReference: ref || null
    });
    closeMarkPaidModal();
    alert("✅ Invoice marked as paid.");
    renderAdminBilling();
  } catch (e) {
    alert("❌ Could not update: " + e.message);
  }
};

// ── Generate all monthly invoices at once (one-click bulk creation)
window.generateAllMonthlyInvoices = async function () {
  const doctors = window._allDoctors || (await loadDoctors());
  const period = _currentPeriod();
  if (!confirm(`Generate invoices for ${doctors.length} doctor(s) for ${_formatPeriodLabel(period)}?\n\nFor subscription doctors: ₹2,000 each\nFor commission doctors: 10% of completed bookings this month\n\nSkips doctors who already have an invoice this month.`)) return;

  const invoices = await _loadInvoices();
  let created = 0, skipped = 0;
  const { doc, setDoc, serverTimestamp } = window._fs;

  for (const d of doctors) {
    const email = (d.email || "").toLowerCase();
    const existing = invoices.find(i => i.doctorEmail === email && i.periodMonth === period);
    if (existing) { skipped += 1; continue; }

    const plan = d.pricingModel || "subscription";
    let amount, bookingCount = 0, bookingRevenue = 0;
    if (plan === "commission") {
      const calc = await _calculateCommissionForPeriod(email, period);
      amount = calc.amount;
      bookingCount = calc.bookingCount;
      bookingRevenue = calc.bookingRevenue;
      if (amount === 0) { skipped += 1; continue; } // skip if no bookings = nothing to invoice
    } else {
      amount = BILLING_RATES.subscription.monthly;
    }

    const due = new Date(); due.setDate(due.getDate() + 7);
    const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    const invId = `INV-${period.replace("-", "")}-${d.id.substring(0, 6).toUpperCase()}`;

    try {
      await setDoc(doc(db, "invoices", invId), {
        doctorId: d.id, doctorEmail: email, doctorName: d.name,
        plan, periodMonth: period,
        amount, bookingCount, bookingRevenue,
        status: "pending",
        generatedAt: serverTimestamp(),
        dueDate,
        paidAt: null, paymentMethod: null, paymentReference: null, notes: ""
      });
      created += 1;
    } catch (e) { console.error("Bulk gen failed for", email, e); }
  }

  alert(`✅ Done!\n\n${created} invoice(s) created\n${skipped} skipped (already exist or no bookings)`);
  renderAdminBilling();
};

// ── Invoice PDF (opens print-ready view in new window)
window.downloadInvoicePDF = async function (invoiceId) {
  // Make sure we have the latest payment details
  await _loadBillingSettings();
  const inv = (window._allInvoices || []).find(i => i.id === invoiceId);
  if (!inv) { alert("Invoice not found."); return; }

  const periodLabel = _formatPeriodLabel(inv.periodMonth);
  const planLabel = inv.plan === "commission" ? BILLING_RATES.commission.label : BILLING_RATES.subscription.label;
  const generatedDate = inv.generatedAt?.toDate ? inv.generatedAt.toDate() : new Date();
  const dueDate = inv.dueDate || "—";
  const isPaid = inv.status === "paid";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${inv.id}</title>
<style>
@page { size: A4; margin: 14mm; }
body { font-family: Georgia, serif; color: #1F2F26; padding: 70px 20px 20px 20px; background: white; margin: 0; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3D5A4C; padding-bottom: 18px; margin-bottom: 24px; }
.brand-name { font-size: 28px; font-weight: 800; color: #3D5A4C; letter-spacing: -0.5px; }
.brand-sub { font-size: 12px; color: #888; margin-top: 4px; }
.inv-meta { text-align: right; }
.inv-meta .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
.inv-meta .value { font-size: 16px; color: #1F2F26; font-weight: 700; margin-bottom: 8px; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 28px; }
.party { background: #F5F1EA; padding: 14px 18px; border-radius: 8px; }
.party .heading { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 5px; }
.party .body { font-size: 13px; line-height: 1.6; color: #1F2F26; }
.line-table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
.line-table th { background: #3D5A4C; color: white; text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
.line-table th.right, .line-table td.right { text-align: right; }
.line-table td { padding: 14px; border-bottom: 1px solid #DDE5DB; font-size: 13px; }
.line-table tr.total td { border-top: 2px solid #3D5A4C; border-bottom: none; font-weight: 800; font-size: 16px; padding: 14px; background: #EEF1ED; }
.pay-info { background: #F5F1EA; border-left: 4px solid #3D5A4C; border-radius: 6px; padding: 18px 22px; margin: 22px 0; }
.pay-info h3 { font-size: 14px; font-weight: 800; color: #3D5A4C; margin-bottom: 10px; }
.pay-info p { font-size: 13px; line-height: 1.75; color: #1F2F26; margin: 0; }
.pay-info .upi { font-family: 'Courier New', monospace; background: white; padding: 4px 8px; border-radius: 4px; border: 1px dashed #3D5A4C; display: inline-block; font-weight: 700; }
.paid-stamp { position: absolute; top: 220px; right: 80px; transform: rotate(-12deg); border: 4px solid #065F46; color: #065F46; font-family: 'Georgia', serif; font-size: 40px; font-weight: 800; padding: 8px 24px; border-radius: 8px; opacity: 0.7; }
.footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #DDE5DB; font-size: 11px; color: #888; display: flex; justify-content: space-between; }
@media print { body { padding: 0; } .print-toolbar { display: none; } }
.print-toolbar { position: fixed; top: 12px; right: 12px; z-index: 1000; }
.print-toolbar button { padding: 9px 18px; background: #3D5A4C; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 700; }
</style></head><body>
${isPaid ? '<div class="paid-stamp">PAID ✓</div>' : ''}
<div class="print-toolbar"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
<div class="header">
<div>
  <div class="brand-name">🏥 HealthFirst</div>
  <div class="brand-sub">India's doctor booking platform</div>
</div>
<div class="inv-meta">
  <div class="label">Invoice</div>
  <div class="value">${escapeHtml(inv.id)}</div>
  <div class="label">Issued</div>
  <div style="font-size:13px">${generatedDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
</div>
</div>

<div class="parties">
<div class="party">
  <div class="heading">Billed To</div>
  <div class="body">
    <strong>${escapeHtml(inv.doctorName || "—")}</strong><br>
    ${escapeHtml(inv.doctorEmail || "")}<br>
    <span style="color:#888;font-size:11px">Doctor ID: ${escapeHtml(inv.doctorId || "—")}</span>
  </div>
</div>
<div class="party">
  <div class="heading">From</div>
  <div class="body">
    <strong>HealthFirst</strong><br>
    ${escapeHtml(BILLING_PAYMENT_INFO.contactEmail)}<br>
    <span style="color:#888;font-size:11px">${escapeHtml(periodLabel)} statement</span>
  </div>
</div>
</div>

<table class="line-table">
<thead>
  <tr><th>Description</th><th class="right">Amount</th></tr>
</thead>
<tbody>
  <tr>
    <td>
      <strong>${escapeHtml(planLabel)}</strong><br>
      <span style="font-size:11px;color:#888">For period: ${escapeHtml(periodLabel)}</span>
      ${inv.plan === "commission" ? `<br><span style="font-size:11px;color:#888">${inv.bookingCount} completed booking${inv.bookingCount !== 1 ? "s" : ""} · ₹${(inv.bookingRevenue || 0).toLocaleString("en-IN")} revenue × 10%</span>` : ""}
      ${inv.notes ? `<br><span style="font-size:11px;color:#888;font-style:italic">Note: ${escapeHtml(inv.notes)}</span>` : ""}
    </td>
    <td class="right">₹${(inv.amount || 0).toLocaleString("en-IN")}</td>
  </tr>
  <tr class="total">
    <td>TOTAL DUE${isPaid ? " (PAID)" : ""}</td>
    <td class="right">₹${(inv.amount || 0).toLocaleString("en-IN")}</td>
  </tr>
</tbody>
</table>

${!isPaid ? `
<div class="pay-info">
<h3>How to pay</h3>
<p>
  <strong>UPI:</strong> <span class="upi">${escapeHtml(BILLING_PAYMENT_INFO.upiId)}</span><br>
  <strong>Bank Transfer:</strong> ${escapeHtml(BILLING_PAYMENT_INFO.accountHolder)} · ${escapeHtml(BILLING_PAYMENT_INFO.bankName)}<br>
  A/C No: ${escapeHtml(BILLING_PAYMENT_INFO.accountNo)} · IFSC: ${escapeHtml(BILLING_PAYMENT_INFO.ifsc)}<br><br>
  <strong>Due by:</strong> ${dueDate}<br>
  After paying, please share the UPI reference number or transaction ID via WhatsApp or email to <strong>${escapeHtml(BILLING_PAYMENT_INFO.contactEmail)}</strong>.
</p>
</div>` : `
<div class="pay-info" style="background:#ECFDF5;border-left-color:#065F46">
<h3 style="color:#065F46">Payment received ✓</h3>
<p>
  Paid on: <strong>${inv.paidAt?.toDate ? inv.paidAt.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}</strong><br>
  Method: <strong>${escapeHtml(inv.paymentMethod || "—")}</strong>
  ${inv.paymentReference ? `<br>Reference: <strong>${escapeHtml(inv.paymentReference)}</strong>` : ""}
</p>
</div>`}

<div class="footer">
<div>Invoice generated by HealthFirst · ${new Date().toLocaleDateString("en-IN")}</div>
<div>Questions? ${escapeHtml(BILLING_PAYMENT_INFO.contactEmail)}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { alert("⚠️ Pop-up blocked. Allow pop-ups and try again."); return; }
  w.document.open(); w.document.write(html); w.document.close();
};

// ── Share invoice via WhatsApp
window.shareInvoiceWhatsApp = async function (invoiceId) {
  const inv = (window._allInvoices || []).find(i => i.id === invoiceId);
  if (!inv) { alert("Invoice not found."); return; }

  const doctors = window._allDoctors || (await loadDoctors());
  const d = doctors.find(x => (x.email || "").toLowerCase() === (inv.doctorEmail || "").toLowerCase());
  const phone = (d?.phone || "").replace(/\D/g, "");
  if (!phone) { alert("Doctor has no phone number on file."); return; }
  const normalized = phone.length === 10 ? "91" + phone : phone;

  const msg = `Hi Dr. ${inv.doctorName.replace(/^Dr\.?\s*/i, "")},\n\nYour HealthFirst invoice for ${_formatPeriodLabel(inv.periodMonth)} is ready:\n\n*Invoice ${inv.id}*\nAmount: ₹${(inv.amount || 0).toLocaleString("en-IN")}\nDue: ${inv.dueDate}\n\n*How to pay:*\nUPI: ${BILLING_PAYMENT_INFO.upiId}\nor Bank: ${BILLING_PAYMENT_INFO.accountHolder} · ${BILLING_PAYMENT_INFO.accountNo} · ${BILLING_PAYMENT_INFO.ifsc}\n\nAfter payment, please send the reference number to confirm.\n\nThank you!\n— HealthFirst Team`;
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`, "_blank");
};

// ────────────────────────────────────────────────────────────
// DOCTOR BILLING VIEW (their personal billing tab)
// ────────────────────────────────────────────────────────────

window.loadDoctorBilling = async function () {
  const wrap = document.getElementById("doctorBillingWrap");
  if (!wrap) return;
  const me = window._currentDoctor || {};
  if (!me.id || !me.email) {
    wrap.innerHTML = `<div style="padding:32px;text-align:center;color:var(--navy-m)">Loading…</div>`;
    return;
  }

  wrap.innerHTML = `<div style="padding:32px;text-align:center;color:var(--navy-m)">Loading your billing…</div>`;
  // Load latest settings so doctor sees current UPI/bank info
  await _loadBillingSettings();
  const invoices = await _loadInvoices(me.email.toLowerCase());

  // Compute statuses
  invoices.forEach(inv => {
    if (inv.status === "pending" && _daysSince(inv.dueDate) > 0) inv.status = "overdue";
  });

  const currentPeriod = _currentPeriod();
  const currentInv = invoices.find(i => i.periodMonth === currentPeriod);
  const overdue = invoices.filter(i => i.status === "overdue");
  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount || 0), 0);

  const plan = me.pricingModel || "subscription";
  const planLabel = plan === "commission" ? BILLING_RATES.commission.label : BILLING_RATES.subscription.label;
  const planDescription = plan === "commission"
    ? "You pay 10% of consultation fees from completed bookings. No bookings = no charge."
    : "Flat ₹2,000 per month, regardless of bookings. Keep 100% of consultation fees.";

  wrap.innerHTML = `
    <!-- Plan summary card -->
    <div class="panel" style="margin-bottom:18px">
      <div class="panel-head"><div class="panel-title">💳 Your Plan</div></div>
      <div style="padding:18px 22px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;margin-bottom:10px">
          <div>
            <div style="font-family:var(--ff-d);font-size:24px;font-weight:700;color:var(--navy)">${planLabel}</div>
            <div style="font-size:13px;color:var(--navy-m);margin-top:4px">${planDescription}</div>
          </div>
          <div style="background:var(--teal-l);padding:10px 16px;border-radius:var(--r);text-align:right">
            <div style="font-size:10px;color:var(--navy-m);text-transform:uppercase;font-weight:700;letter-spacing:0.5px">Total Paid</div>
            <div style="font-family:var(--ff-d);font-size:22px;font-weight:700;color:var(--teal-d)">₹${totalPaid.toLocaleString("en-IN")}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--navy-m);background:var(--bg);padding:10px 12px;border-radius:6px;margin-top:8px">
          💡 To change your plan, email <a href="mailto:${BILLING_PAYMENT_INFO.contactEmail}" style="color:var(--teal);font-weight:600">${BILLING_PAYMENT_INFO.contactEmail}</a>
        </div>
      </div>
    </div>

    <!-- Current dues -->
    ${currentInv ? `
      <div class="panel" style="margin-bottom:18px;${currentInv.status === 'overdue' ? 'border:2px solid #DC2626' : currentInv.status === 'paid' ? 'border:2px solid #10B981' : 'border:2px solid #F59E0B'}">
        <div class="panel-head" style="${currentInv.status === 'overdue' ? 'background:#FEE2E2' : currentInv.status === 'paid' ? 'background:#D1FAE5' : 'background:#FEF3C7'}">
          <div class="panel-title" style="${currentInv.status === 'overdue' ? 'color:#991B1B' : currentInv.status === 'paid' ? 'color:#065F46' : 'color:#92400E'}">
            ${currentInv.status === 'paid' ? '✓' : currentInv.status === 'overdue' ? '⚠️' : '⏳'} ${_formatPeriodLabel(currentPeriod)} Invoice
          </div>
          <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;${currentInv.status === 'overdue' ? 'background:#991B1B;color:white' : currentInv.status === 'paid' ? 'background:#065F46;color:white' : 'background:#92400E;color:white'}">${currentInv.status.toUpperCase()}</span>
        </div>
        <div style="padding:22px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:18px">
            <div>
              <div style="font-family:var(--ff-d);font-size:36px;font-weight:800;color:var(--navy);line-height:1">₹${(currentInv.amount || 0).toLocaleString("en-IN")}</div>
              <div style="font-size:12px;color:var(--navy-m);margin-top:6px">Invoice ${currentInv.id} · Due ${currentInv.dueDate}</div>
            </div>
            <button onclick="downloadInvoicePDF('${currentInv.id}')" style="padding:10px 18px;background:var(--navy);color:white;border:none;border-radius:var(--r);font-family:var(--ff);font-size:13px;font-weight:700;cursor:pointer">📄 Download Invoice PDF</button>
          </div>
          ${currentInv.status !== 'paid' ? `
            <div style="background:var(--bg);border-radius:var(--r);padding:18px 20px;border-left:4px solid var(--teal)">
              <div style="font-family:var(--ff-d);font-weight:700;color:var(--navy);margin-bottom:10px;font-size:15px">💸 How to pay</div>
              <div style="font-size:13px;line-height:1.85;color:var(--navy-s)">
                <div><strong>UPI ID:</strong> <span style="font-family:'Courier New',monospace;background:white;padding:3px 8px;border-radius:4px;border:1px dashed var(--teal);font-weight:700;color:var(--teal-d)">${escapeHtml(BILLING_PAYMENT_INFO.upiId)}</span></div>
                <div style="margin-top:6px"><strong>Or Bank Transfer:</strong></div>
                <div style="margin-left:14px;font-size:12px">
                  A/C Name: ${escapeHtml(BILLING_PAYMENT_INFO.accountHolder)}<br>
                  Bank: ${escapeHtml(BILLING_PAYMENT_INFO.bankName)}<br>
                  A/C No: ${escapeHtml(BILLING_PAYMENT_INFO.accountNo)}<br>
                  IFSC: ${escapeHtml(BILLING_PAYMENT_INFO.ifsc)}
                </div>
              </div>
              <div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--border-md);font-size:12px;color:var(--navy-m)">
                After payment, send the UPI reference / transaction ID to <strong style="color:var(--teal-d)">${escapeHtml(BILLING_PAYMENT_INFO.contactEmail)}</strong> or WhatsApp the admin to confirm.
              </div>
            </div>` : `
            <div style="background:#ECFDF5;border-radius:var(--r);padding:14px 18px;border-left:4px solid #10B981">
              <div style="font-size:13px;color:#065F46">
                ✓ Paid on <strong>${currentInv.paidAt?.toDate ? currentInv.paidAt.toDate().toLocaleDateString("en-IN") : "—"}</strong> via <strong>${escapeHtml(currentInv.paymentMethod || "—")}</strong>
                ${currentInv.paymentReference ? `<br><span style="font-size:11px;color:var(--navy-m)">Reference: ${escapeHtml(currentInv.paymentReference)}</span>` : ""}
              </div>
            </div>`}
        </div>
      </div>` : `
      <div class="panel" style="margin-bottom:18px">
        <div style="padding:32px 22px;text-align:center;color:var(--navy-m);font-size:14px">
          📭 No invoice for ${_formatPeriodLabel(currentPeriod)} yet.<br>
          <span style="font-size:12px">You'll be notified when admin generates your monthly invoice.</span>
        </div>
      </div>`}

    ${overdue.length > 0 ? `
      <div class="panel" style="margin-bottom:18px;border:2px solid #DC2626">
        <div class="panel-head" style="background:#FEE2E2">
          <div class="panel-title" style="color:#991B1B">⚠️ Overdue invoices (${overdue.length})</div>
        </div>
        <div style="padding:14px 22px;font-size:13px;color:#7F1D1D">
          ${overdue.map(o => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #FCA5A5">
              <div><strong>${_formatPeriodLabel(o.periodMonth)}</strong> · ₹${(o.amount || 0).toLocaleString("en-IN")} · ${_daysSince(o.dueDate)} days overdue</div>
              <button onclick="downloadInvoicePDF('${o.id}')" style="background:#991B1B;color:white;border:none;padding:4px 10px;border-radius:5px;font-size:11px;cursor:pointer;font-weight:700">View PDF</button>
            </div>
          `).join("")}
          <div style="margin-top:12px;font-size:12px;color:#7F1D1D">
            Pay these as soon as possible to avoid account suspension (30+ days overdue → automatic).
          </div>
        </div>
      </div>` : ""}

    <!-- Payment history -->
    <div class="panel">
      <div class="panel-head"><div class="panel-title">📜 Payment History</div></div>
      <div style="padding:14px 22px">
        ${invoices.filter(i => i.status === "paid").length === 0
          ? `<div style="text-align:center;color:var(--navy-m);font-size:13px;padding:20px">No paid invoices yet.</div>`
          : `
            <table style="width:100%;font-size:13px;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:2px solid var(--border)">
                  <th style="text-align:left;padding:8px 6px;font-size:11px;color:var(--navy-m);text-transform:uppercase;letter-spacing:0.5px">Period</th>
                  <th style="text-align:left;padding:8px 6px;font-size:11px;color:var(--navy-m);text-transform:uppercase;letter-spacing:0.5px">Invoice ID</th>
                  <th style="text-align:right;padding:8px 6px;font-size:11px;color:var(--navy-m);text-transform:uppercase;letter-spacing:0.5px">Amount</th>
                  <th style="text-align:left;padding:8px 6px;font-size:11px;color:var(--navy-m);text-transform:uppercase;letter-spacing:0.5px">Paid on</th>
                  <th style="text-align:left;padding:8px 6px;font-size:11px;color:var(--navy-m);text-transform:uppercase;letter-spacing:0.5px">Method</th>
                  <th style="text-align:right;padding:8px 6px;font-size:11px;color:var(--navy-m);text-transform:uppercase;letter-spacing:0.5px"></th>
                </tr>
              </thead>
              <tbody>
                ${invoices.filter(i => i.status === "paid").map(i => `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:10px 6px;font-weight:600;color:var(--navy)">${_formatPeriodLabel(i.periodMonth)}</td>
                    <td style="padding:10px 6px;color:var(--navy-m);font-size:11px;font-family:'Courier New',monospace">${escapeHtml(i.id)}</td>
                    <td style="padding:10px 6px;text-align:right;font-weight:700">₹${(i.amount || 0).toLocaleString("en-IN")}</td>
                    <td style="padding:10px 6px;color:var(--navy-s)">${i.paidAt?.toDate ? i.paidAt.toDate().toLocaleDateString("en-IN") : "—"}</td>
                    <td style="padding:10px 6px;color:var(--navy-s)">${escapeHtml(i.paymentMethod || "—")}</td>
                    <td style="padding:10px 6px;text-align:right"><button onclick="downloadInvoicePDF('${i.id}')" style="background:none;border:1px solid var(--border-md);color:var(--navy-s);padding:4px 10px;border-radius:5px;font-size:11px;cursor:pointer;font-family:var(--ff)">📄 PDF</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>`}
      </div>
    </div>
  `;

  // Cache for PDF generation
  window._allInvoices = invoices;
};
if (document.getElementById("queue-upcoming")) {
  document.addEventListener("doctor-ready", loadTodayQueue);

  async function loadTodayQueue() {
    const today = new Date().toISOString().split("T")[0];
    const me = window._currentDoctor || {};
    const isAdmin = (me.email === ADMIN_EMAIL);

    // Update sidebar + greeting
    const setText = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };
    // Only overwrite the avatar with emoji if the doctor has NOT uploaded a profile photo
    if (me.photoUrl && typeof window._applyDoctorPhotoToSidebar === "function") {
      window._applyDoctorPhotoToSidebar(me.photoUrl);
    } else {
      setText(".sb-avatar", me.avatar || (isAdmin ? "🛡️" : "👨‍⚕️"));
    }
    setText(".sb-name", me.name || "Doctor");
    setText(".sb-spec", me.specialty || (isAdmin ? "Admin view — all doctors" : ""));

    // Greeting based on time of day + name
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const shortName = me.name ? me.name.replace(/^Dr\.?\s*/i, "Dr. ").split(/\s+/).slice(0, 2).join(" ") : "Doctor";
    const greetEl = document.getElementById("dashGreeting");
    if (greetEl) greetEl.textContent = `${greeting}, ${shortName} 👋`;

    // Load bookings: admin sees all, doctor sees only their own
    const allMyBookings = isAdmin
      ? await loadBookings()
      : await loadMyBookingsAsDoctor(me.email);

    const todayBookings = allMyBookings.filter(b => b.date === today);
    const reviews = await loadReviews();
    const myReviews = isAdmin ? reviews : reviews.filter(r => r.doctor === me.name);

    renderTodayQueue(todayBookings);
    renderQueueStatus(todayBookings);
    renderKPIs(todayBookings, allMyBookings, myReviews);
    renderTodaysScheduleBox(me);
    renderEarnings(allMyBookings);
    renderPatientRecords(allMyBookings);
    renderNextPatient(todayBookings);
    renderTimeline(todayBookings, me);
    renderNotifications(allMyBookings, myReviews);

    // Store globally for tab switching / searching
    window._myAllBookings = allMyBookings;
  }

  function renderTodayQueue(todayBookings) {
    const container = document.getElementById("queue-upcoming");
    if (!container) return;
    const confirmed = todayBookings.filter(b => b.status === "confirmed");
    const done = todayBookings.filter(b => b.status === "done");
    const cancelled = todayBookings.filter(b => b.status === "cancelled" || b.status === "no_show");

    if (confirmed.length === 0) {
      container.innerHTML = `<div style="padding:32px 24px;text-align:center;color:var(--navy-m);font-size:14px"><div style="font-size:40px;margin-bottom:10px">📭</div>No appointments scheduled for today.</div>`;
    } else {
    container.innerHTML = confirmed.map((b, i) => {
      const phoneAttr = (b.phone || "").replace(/\D/g, "");
      return `
      <div class="appt-item" id="appt-${b.id}">
        <div class="ai-token">${i + 1}</div>
        <div class="ai-info patient-history-trigger" style="cursor:pointer" data-phone="${escapeHtml(phoneAttr)}" data-name="${escapeHtml(b.patientName || "Patient")}">
          <div class="ai-name">${escapeHtml(b.patientName)} · ${escapeHtml(b.gender || "")}, ${escapeHtml(b.age || "")} <span style="font-size:11px;color:var(--teal);font-weight:600;margin-left:6px">📋 history</span></div>
          <div class="ai-detail">${escapeHtml(b.slot)} · ${escapeHtml(b.reason || "General consultation")} · Token ${escapeHtml(b.token)} · 📞 ${escapeHtml(b.phone || "—")}
            &nbsp;<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px;${b.paymentMethod === "paid_online" ? "background:#ECFDF5;color:#065F46" : "background:#FFF3E0;color:#E65100"}">${b.paymentMethod === "paid_online" ? "✅ Paid" : "🏥 Pay at clinic"}</span>
          </div>
        </div>
        <div class="ai-actions">
          <button type="button" class="ai-btn done queue-done-btn" data-id="${escapeHtml(b.id)}" data-name="${escapeHtml(b.patientName || "")}" data-phone="${escapeHtml(phoneAttr)}">✓ Done</button>
          <button type="button" class="ai-btn queue-noshow-btn" data-id="${escapeHtml(b.id)}" style="background:#FEF3C7;color:#92400E;border:1px solid #FBBF24" title="Patient didn't show up">⊘ No-Show</button>
          <button type="button" class="ai-btn cancel queue-cancel-btn" data-id="${escapeHtml(b.id)}">✗ Cancel</button>
        </div>
      </div>`;
    }).join("");
    }

    // ─── Render the "Completed" tab with real data ───
    const doneContainer = document.getElementById("queue-done");
    if (doneContainer) {
      const doneAndCancelled = [...done, ...cancelled].sort((a, b) => (a.slot || "").localeCompare(b.slot || ""));
      if (doneAndCancelled.length === 0) {
        doneContainer.innerHTML = `<div style="padding:32px;text-align:center;color:var(--navy-m);font-size:14px"><div style="font-size:36px;margin-bottom:8px">✓</div>No completed appointments yet today.</div>`;
      } else {
        doneContainer.innerHTML = doneAndCancelled.map(b => {
          const isDone = b.status === "done";
          const isCancelled = b.status === "cancelled" || b.status === "no_show";
          const tokenStyle = isDone ? "background:var(--green-l);color:var(--green)" : "background:var(--red-l);color:var(--red)";
          const tokenIcon = isDone ? "✓" : "✗";
          const badgeClass = isDone ? "sb-done" : "sb-cancelled";
          const badgeText = isDone ? "Done" : (b.status === "no_show" ? "No-Show" : "Cancelled");
          return `
            <div class="appt-item">
              <div class="ai-token" style="${tokenStyle}">${tokenIcon}</div>
              <div class="ai-info">
                <div class="ai-name">${escapeHtml(b.patientName)} · ${escapeHtml(b.gender || "")}, ${escapeHtml(b.age || "")}</div>
                <div class="ai-detail">${escapeHtml(b.slot || "—")} · ${escapeHtml(b.reason || "—")} · Token ${escapeHtml(b.token || "—")}</div>
              </div>
              <span class="status-badge ${badgeClass}">${badgeText}</span>
            </div>`;
        }).join("");
      }
    }

    // ─── Render the "All" tab: everything chronologically ───
    const allContainer = document.getElementById("queue-all");
    if (allContainer) {
      const sortedAll = [...todayBookings].sort((a, b) => (a.slot || "").localeCompare(b.slot || ""));
      if (sortedAll.length === 0) {
        allContainer.innerHTML = `<div style="padding:32px;text-align:center;color:var(--navy-m);font-size:14px"><div style="font-size:36px;margin-bottom:8px">📅</div>No appointments today.</div>`;
      } else {
        allContainer.innerHTML = `<div style="padding:14px 20px;font-size:13px;color:var(--navy-m);border-bottom:1px solid var(--border)">Showing all ${sortedAll.length} appointment${sortedAll.length === 1 ? "" : "s"} for today.</div>` + sortedAll.map((b, i) => {
          const status = b.status || "confirmed";
          const tokenStyle = status === "done" ? "background:var(--green-l);color:var(--green)" :
                             (status === "cancelled" || status === "no_show") ? "background:var(--red-l);color:var(--red)" :
                             "";
          const tokenIcon = status === "done" ? "✓" : (status === "cancelled" || status === "no_show") ? "✗" : (i + 1);
          const badgeClass = status === "done" ? "sb-done" : (status === "cancelled" || status === "no_show") ? "sb-cancelled" : "sb-waiting";
          const badgeText = status === "done" ? "Done" : status === "no_show" ? "No-Show" : status === "cancelled" ? "Cancelled" : "Confirmed";
          return `
            <div class="appt-item">
              <div class="ai-token" style="${tokenStyle}">${tokenIcon}</div>
              <div class="ai-info">
                <div class="ai-name">${escapeHtml(b.patientName)} · ${escapeHtml(b.gender || "")}, ${escapeHtml(b.age || "")}</div>
                <div class="ai-detail">${escapeHtml(b.slot || "—")} · ${escapeHtml(b.reason || "—")} · Token ${escapeHtml(b.token || "—")}</div>
              </div>
              <span class="status-badge ${badgeClass}">${badgeText}</span>
            </div>`;
        }).join("");
      }
    }

    // Skip the rest of upcoming-tab setup if there are no confirmed bookings
    if (confirmed.length === 0) return;

    // Attach click listener DIRECTLY to each button (most reliable)
    container.querySelectorAll(".queue-done-btn").forEach(btn => {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        const id = btn.getAttribute("data-id");
        const name = btn.getAttribute("data-name");
        const phone = btn.getAttribute("data-phone");
        console.log("[Done clicked]", { id, name, phone });
        window.markDone(id, name, phone);
      });
    });
    container.querySelectorAll(".queue-cancel-btn").forEach(btn => {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        const id = btn.getAttribute("data-id");
        console.log("[Cancel clicked]", { id });
        window.cancelAppt(id);
      });
    });
    container.querySelectorAll(".queue-noshow-btn").forEach(btn => {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        const id = btn.getAttribute("data-id");
        console.log("[No-Show clicked]", { id });
        window.markNoShow(id);
      });
    });
    container.querySelectorAll(".patient-history-trigger").forEach(el => {
      el.addEventListener("click", function () {
        const phone = el.getAttribute("data-phone");
        const name = el.getAttribute("data-name");
        if (window.showPatientHistory) window.showPatientHistory(phone, name);
      });
    });
  }

  function renderQueueStatus(todayBookings) {
    const upcoming = todayBookings.filter(b => b.status === "confirmed").length;
    const done = todayBookings.filter(b => b.status === "done").length;
    const cancelled = todayBookings.filter(b => b.status === "cancelled").length;
    const total = upcoming + done + cancelled;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const el = id => document.getElementById(id);
    if (el("waitingCount")) el("waitingCount").textContent = upcoming;
    if (el("completedCount")) el("completedCount").textContent = done;
    if (el("cancelledCount")) el("cancelledCount").textContent = cancelled;
    if (el("progressBar")) el("progressBar").style.width = pct + "%";
    if (el("progressText")) el("progressText").textContent = `${done} of ${total} completed (${pct}%)`;
  }

  function renderKPIs(todayBookings, allBookings, myReviews) {
    const el = id => document.getElementById(id);
    const todayCompleted = todayBookings.filter(b => b.status === "done");
    const todayRevenue = todayCompleted.reduce((s, b) => s + (parseInt(b.fee) || 0), 0);
    const avgRating = myReviews.length ? (myReviews.reduce((s, r) => s + (r.rating || 5), 0) / myReviews.length).toFixed(1) : "—";
    const totalAll = allBookings.length;
    const allCompleted = allBookings.filter(b => b.status === "done").length;
    const allCancelled = allBookings.filter(b => b.status === "cancelled").length;
    const showRate = (allCompleted + allCancelled) > 0 ? Math.round((allCompleted / (allCompleted + allCancelled)) * 100) : null;

    if (el("kpiToday")) el("kpiToday").textContent = todayBookings.length;
    if (el("kpiTodayDelta")) el("kpiTodayDelta").textContent = todayBookings.length === 0 ? "No bookings yet" : `${todayCompleted.length} completed so far`;
    if (el("kpiRevenue")) el("kpiRevenue").textContent = "₹" + todayRevenue.toLocaleString("en-IN");
    if (el("kpiRevenueDelta")) el("kpiRevenueDelta").textContent = todayCompleted.length === 0 ? "No completed visits yet" : `From ${todayCompleted.length} visit${todayCompleted.length === 1 ? "" : "s"}`;
    if (el("kpiRating")) el("kpiRating").textContent = avgRating === "—" ? "— ★" : avgRating + " ★";
    if (el("kpiRatingDelta")) el("kpiRatingDelta").textContent = myReviews.length === 0 ? "No reviews yet" : `From ${myReviews.length} review${myReviews.length === 1 ? "" : "s"}`;
    if (el("kpiShowRate")) el("kpiShowRate").textContent = showRate === null ? "—" : showRate + "%";
    if (el("kpiShowRateDelta")) el("kpiShowRateDelta").textContent = showRate === null ? "Need more data" : `${allCompleted} of ${allCompleted + allCancelled} visits completed`;
  }

  async function renderTodaysScheduleBox(me) {
    const box = document.getElementById("todaysScheduleBox");
    if (!box) return;
    if (!me.id) {
      box.innerHTML = `<div style="padding:14px 16px;font-size:13px;color:var(--navy-m);text-align:center">🛡️ Admin view — pick a doctor in "My Schedule" tab to view their schedule.</div>`;
      return;
    }
    const sched = await loadDoctorSchedule(me.id);
    const today = new Date().toISOString().split("T")[0];
    const weekday = String(new Date().getDay());
    const slots = getActiveSlotsForDay(sched.weeklyPattern[weekday]);
    const isBlocked = (sched.blockedDates || []).includes(today);

    if (isBlocked) {
      box.innerHTML = `<div style="padding:14px 16px;font-size:13px;color:var(--red);text-align:center">🚫 Today is a blocked day. No bookings allowed.</div>`;
      return;
    }
    if (slots.length === 0) {
      box.innerHTML = `<div style="padding:14px 16px;font-size:13px;color:var(--navy-m);text-align:center">📅 You don't see patients on ${DAY_NAMES[parseInt(weekday)]}s.</div>`;
      return;
    }
    box.innerHTML = `
      <div style="padding:12px 16px;font-size:12px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border)"><span style="color:var(--navy-m)">Available slots today</span><span style="font-weight:700;color:var(--teal)">${slots.length}</span></div>
      <div style="padding:12px 16px;font-size:12px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border)"><span style="color:var(--navy-m)">First slot</span><span style="font-weight:600;color:var(--navy)">${slots[0]}</span></div>
      <div style="padding:12px 16px;font-size:12px;display:flex;justify-content:space-between"><span style="color:var(--navy-m)">Last slot</span><span style="font-weight:600;color:var(--navy)">${slots[slots.length - 1]}</span></div>`;
  }

  function renderEarnings(allBookings) {
    const el = id => document.getElementById(id);
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const weekStart = (function () { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]; })();

    const completed = allBookings.filter(b => b.status === "done");
    const sum = arr => arr.reduce((s, b) => s + (parseInt(b.fee) || 0), 0);
    const earnMonth = sum(completed.filter(b => b.date >= monthStart));
    const earnWeek = sum(completed.filter(b => b.date >= weekStart));
    const earnToday = sum(completed.filter(b => b.date === today));
    const uniquePatients = new Set(completed.map(b => (b.phone || "").replace(/\D/g, "")).filter(Boolean)).size;

    if (el("earnMonth")) el("earnMonth").textContent = "₹" + earnMonth.toLocaleString("en-IN");
    if (el("earnWeek")) el("earnWeek").textContent = "₹" + earnWeek.toLocaleString("en-IN");
    if (el("earnToday")) el("earnToday").textContent = "₹" + earnToday.toLocaleString("en-IN");
    if (el("earnPatients")) el("earnPatients").textContent = uniquePatients;

    const breakdown = el("earningsBreakdown");
    if (breakdown) {
      if (completed.length === 0) {
        breakdown.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px"><div style="font-size:36px;margin-bottom:10px">💰</div>No completed visits yet. Earnings will appear here as you mark patients as "Done".</div>`;
      } else {
        breakdown.innerHTML = `<div style="padding:0">` + completed.slice(0, 20).map(b => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);font-size:13px">
            <div><strong>${escapeHtml(b.patientName)}</strong> · ${escapeHtml(b.dateDisplay || b.date)} · ${escapeHtml(b.slot)}</div>
            <div style="font-weight:700;color:var(--teal)">₹${escapeHtml(b.fee || 0)}</div>
          </div>`).join("") + `</div>`;
      }
    }
  }

  function renderPatientRecords(allBookings) {
    const list = document.getElementById("patientList");
    if (!list) return;
    // Group by phone number (unique patients)
    const byPhone = {};
    allBookings.forEach(b => {
      const k = (b.phone || "").replace(/\D/g, "");
      if (!k) return;
      if (!byPhone[k] || (b.date > byPhone[k].date)) byPhone[k] = b;
    });
    const patients = Object.values(byPhone).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    if (patients.length === 0) {
      list.innerHTML = `<div style="padding:32px 24px;text-align:center;color:var(--navy-m);font-size:14px"><div style="font-size:36px;margin-bottom:10px">👥</div>Patient records will appear here as you see patients.</div>`;
      return;
    }
    list.innerHTML = patients.map(p => {
      const initials = (p.patientName || "??").split(/\s+/).slice(0, 2).map(s => s[0] || "").join("").toUpperCase();
      const phoneAttr = (p.phone || "").replace(/\D/g, "");
      const nameAttr = escapeHtml(p.patientName || "Patient").replace(/'/g, "&#39;");
      return `
        <div class="appt-item" style="cursor:pointer" data-phone="${phoneAttr}" data-name="${nameAttr}" onclick="showPatientHistory('${phoneAttr}','${nameAttr}')">
          <div class="ai-token" style="background:var(--blue-l);color:var(--blue);font-size:11px;width:36px;height:36px">${escapeHtml(initials)}</div>
          <div class="ai-info">
            <div class="ai-name">${escapeHtml(p.patientName)}${p.gender ? " · " + escapeHtml(p.gender) : ""}${p.age ? ", " + escapeHtml(p.age) : ""}</div>
            <div class="ai-detail">Last visit: ${escapeHtml(p.dateDisplay || p.date)} · ${escapeHtml(p.reason || "Consultation")} · 📞 ${escapeHtml(p.phone)}</div>
          </div>
          <span style="font-size:11px;font-weight:600;color:var(--teal);white-space:nowrap;padding:4px 10px;background:var(--teal-l);border-radius:14px">View History →</span>
        </div>`;
    }).join("");
  }

  window.searchPatientRecords = function (query) {
    const all = window._myAllBookings || [];
    const q = (query || "").trim().toLowerCase();
    if (!q) { renderPatientRecords(all); return; }
    const filtered = all.filter(b =>
      (b.patientName || "").toLowerCase().includes(q) ||
      (b.phone || "").toLowerCase().includes(q)
    );
    renderPatientRecords(filtered);

    // Clicking a patient name should open their history
  };

  /* ─────────────────────────────────────────────
     FEATURE 1 — TODAY'S TIMELINE
  ───────────────────────────────────────────── */

  async function renderTimeline(todayBookings, me) {
    const wrap = document.getElementById("timelineView");
    if (!wrap) return;

    // For admin view (no me.id), show a generic timeline of today's bookings only
    if (!me.id) {
      if (todayBookings.length === 0) {
        wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--navy-m);font-size:14px">📭 No bookings today across all doctors.</div>`;
        return;
      }
      const sortedSlots = [...new Set(todayBookings.map(b => b.slot))].filter(Boolean).sort((a, b) => slotToMinutes(a) - slotToMinutes(b));
      const bookingsBySlot = {};
      todayBookings.forEach(b => { if (b.slot) { if (!bookingsBySlot[b.slot]) bookingsBySlot[b.slot] = []; bookingsBySlot[b.slot].push(b); } });
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();

      wrap.innerHTML = `
        <div style="background:var(--amber-l);padding:10px 14px;border-radius:var(--r);font-size:12px;color:#92400E;margin-bottom:14px">🛡️ Admin view — showing all doctors' bookings today.</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${sortedSlots.map(slot => {
          const slotMins = slotToMinutes(slot);
          const isPast = slotMins < nowMins - 15;
          const isCurrent = !isPast && slotMins <= nowMins + 30;
          const bookings = bookingsBySlot[slot];
          const count = bookings.length;
          const bg = isCurrent ? "var(--teal)" : (isPast ? "var(--navy-m)" : "var(--teal-d)");
          return `<div title="${escapeHtml(slot)} — ${count} booking${count === 1 ? "" : "s"}" style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:62px">
            <div style="width:100%;height:36px;background:${bg};color:white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">${count}</div>
            <div style="font-size:10px;color:${isPast ? 'var(--navy-h)' : 'var(--navy-m)'};font-weight:600;white-space:nowrap">${escapeHtml(slot)}</div>
          </div>`;
        }).join("")}</div>
        <div style="margin-top:10px;font-size:11px;color:var(--navy-m);text-align:center">Numbers show how many bookings at each slot</div>`;
      return;
    }

    const sched = await loadDoctorSchedule(me.id);
    const today = new Date().toISOString().split("T")[0];
    const weekday = String(new Date().getDay());
    const todaySlots = getActiveSlotsForDay(sched.weeklyPattern[weekday]);
    const isBlocked = (sched.blockedDates || []).includes(today);

    if (isBlocked) {
      wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--red);font-size:14px">🚫 Today is a blocked day. No bookings allowed.</div>`;
      return;
    }
    if (todaySlots.length === 0) {
      wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--navy-m);font-size:14px">📅 You don't see patients on ${DAY_NAMES[parseInt(weekday)]}s. Edit your schedule in "My Schedule" tab.</div>`;
      return;
    }

    // Build a map of slot → booking
    const bookingsBySlot = {};
    todayBookings.forEach(b => { if (b.slot) bookingsBySlot[b.slot] = b; });

    // Current time
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // Sort slots by time
    const sortedSlots = [...todaySlots].sort((a, b) => slotToMinutes(a) - slotToMinutes(b));

    // Determine slot length for this day so past/current/future is accurate
    const dayPattern = sched.weeklyPattern[weekday];
    let slotLengthMins = 30;
    if (dayPattern && typeof dayPattern === "object" && !Array.isArray(dayPattern)) {
      slotLengthMins = parseInt(dayPattern.slotLength) || 30;
    } else if (sortedSlots.length >= 2) {
      // Fallback for legacy array format — infer from gap between first two slots
      slotLengthMins = Math.max(5, slotToMinutes(sortedSlots[1]) - slotToMinutes(sortedSlots[0]));
    }

    // Store bookings globally so the slot click handler can find them
    window._timelineBookings = bookingsBySlot;

    let bookedCount = 0;
    const slotsHtml = sortedSlots.map(slot => {
      const slotMins = slotToMinutes(slot);
      const slotEndMins = slotMins + slotLengthMins;
      const isPast = slotEndMins <= nowMins;          // slot already ended
      const isCurrent = !isPast && slotMins <= nowMins; // we're inside the slot window
      const b = bookingsBySlot[slot];
      let bg, color, label, hoverContent = "";

      if (b && b.status === "confirmed") {
        bookedCount++;
        bg = isCurrent ? "var(--teal)" : (isPast ? "var(--navy-m)" : "var(--teal-d)");
        color = "white";
        label = "●";
        hoverContent = `${b.patientName} · Token ${b.token}`;
      } else if (b && b.status === "done") {
        bookedCount++;
        bg = "var(--green-l)";
        color = "var(--green)";
        label = "✓";
        hoverContent = `${b.patientName} · Done`;
      } else if (b && b.status === "cancelled") {
        bg = "var(--red-l)";
        color = "var(--red)";
        label = "✗";
        hoverContent = `${b.patientName} · Cancelled`;
      } else {
        bg = isPast ? "#F1F5F9" : "white";
        color = isPast ? "var(--navy-h)" : "var(--navy-s)";
        label = "";
        hoverContent = "Available";
      }

      const borderStyle = isCurrent && !b ? "border:2px solid var(--teal);" : "border:1px solid var(--border);";

      return `<div data-slot="${escapeHtml(slot)}" class="timeline-slot-click" title="${escapeHtml(slot)} — ${escapeHtml(hoverContent)} (click for details)" style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:62px;cursor:pointer">
        <div style="width:100%;height:36px;background:${bg};color:${color};${borderStyle}border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;transition:transform .1s" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform=''">${label}</div>
        <div style="font-size:10px;color:${isPast ? 'var(--navy-h)' : 'var(--navy-m)'};font-weight:600;white-space:nowrap">${escapeHtml(slot)}</div>
      </div>`;
    }).join("");

    wrap.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px" id="timelineSlots">${slotsHtml}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--navy-m);padding-top:10px;border-top:1px solid var(--border)">
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:var(--teal);border-radius:3px;display:inline-block"></span>Booked</span>
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:var(--teal);border:2px solid var(--teal);border-radius:3px;display:inline-block"></span>Now</span>
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:var(--green-l);border:1px solid var(--green);border-radius:3px;display:inline-block"></span>Done</span>
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:white;border:1px solid var(--border);border-radius:3px;display:inline-block"></span>Available</span>
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:#F1F5F9;border:1px solid var(--border);border-radius:3px;display:inline-block"></span>Past</span>
        <span style="margin-left:auto;font-weight:600">${bookedCount}/${sortedSlots.length} booked</span>
      </div>`;

    // Wire up click handler via event delegation (avoids issues with special chars in slot labels)
    const slotsWrap = document.getElementById("timelineSlots");
    if (slotsWrap) {
      slotsWrap.addEventListener("click", function (ev) {
        const card = ev.target.closest(".timeline-slot-click");
        if (!card) return;
        const slotLabel = card.getAttribute("data-slot");
        if (slotLabel) window.openSlotDetail(slotLabel);
      });
    }
  }

  // Click handler — opens a modal with booking details for the tapped slot
  window.openSlotDetail = function (slot) {
    const bookings = window._timelineBookings || {};
    const b = bookings[slot];

    // Build modal HTML based on booking state
    let body;
    if (!b) {
      body = `
        <div style="text-align:center;padding:10px 0">
          <div style="font-size:36px;margin-bottom:8px">📭</div>
          <div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:6px">Slot ${escapeHtml(slot)}</div>
          <div style="font-size:13px;color:var(--navy-m)">This slot is available — no booking yet.</div>
        </div>`;
    } else if (b.status === "cancelled") {
      body = `
        <div style="text-align:center;padding:10px 0">
          <div style="font-size:36px;margin-bottom:8px">✗</div>
          <div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:6px">${escapeHtml(b.patientName)} · ${escapeHtml(slot)}</div>
          <div style="font-size:13px;color:var(--red);font-weight:600;margin-bottom:14px">CANCELLED</div>
          <div style="font-size:13px;color:var(--navy-m);text-align:left;background:var(--bg);padding:10px 14px;border-radius:8px">
            📞 ${escapeHtml(b.phone || "—")}<br>
            🎟️ Token: ${escapeHtml(b.token || "—")}<br>
            💰 ${escapeHtml(b.paymentMethod || "—")}
          </div>
        </div>`;
    } else if (b.status === "done") {
      body = `
        <div style="text-align:center;padding:10px 0">
          <div style="font-size:36px;margin-bottom:8px">✓</div>
          <div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:6px">${escapeHtml(b.patientName)} · ${escapeHtml(slot)}</div>
          <div style="font-size:13px;color:var(--green);font-weight:600;margin-bottom:14px">COMPLETED</div>
          <div style="font-size:13px;color:var(--navy-m);text-align:left;background:var(--bg);padding:10px 14px;border-radius:8px">
            📞 ${escapeHtml(b.phone || "—")}<br>
            🎟️ Token: ${escapeHtml(b.token || "—")}
          </div>
        </div>`;
    } else {
      // confirmed
      const phoneClean = (b.phone || "").replace(/\D/g, "");
      const reminderText = encodeURIComponent(`Hi ${b.patientName}! Just a reminder — your appointment is at ${slot} today (Token #${b.token || "—"}). See you soon. — HealthFirst`);
      const waUrl = phoneClean ? `https://wa.me/91${phoneClean}?text=${reminderText}` : null;
      const callUrl = phoneClean ? `tel:+91${phoneClean}` : null;
      body = `
        <div style="padding:6px 0">
          <div style="text-align:center;margin-bottom:14px">
            <div style="font-size:16px;font-weight:700;color:var(--navy);margin-bottom:4px">${escapeHtml(b.patientName)}</div>
            <div style="font-size:13px;color:var(--teal-d);font-weight:600">${escapeHtml(slot)} · Token #${escapeHtml(b.token || "—")}</div>
          </div>
          <div style="background:var(--bg);padding:12px 14px;border-radius:10px;font-size:13px;color:var(--navy-s);margin-bottom:14px;line-height:1.7">
            ${b.age ? `👤 ${escapeHtml(b.age)} ${escapeHtml(b.gender || "")}<br>` : ""}
            📞 ${escapeHtml(b.phone || "—")}<br>
            💰 ${escapeHtml(b.paymentMethod === "online" ? "Paid online" : "Pay at clinic")}<br>
            ${b.reason ? `📝 ${escapeHtml(b.reason)}` : ""}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${waUrl ? `<a href="${waUrl}" target="_blank" style="flex:1;min-width:90px;text-align:center;padding:9px;background:#25D366;color:white;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">💬 Send Reminder</a>` : ""}
            ${callUrl ? `<a href="${callUrl}" style="flex:1;min-width:90px;text-align:center;padding:9px;background:var(--blue);color:white;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">📞 Call</a>` : ""}
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button onclick="closeSlotDetail(); markDone('${b.id}', '${(b.patientName || '').replace(/'/g, "\\'")}', '${phoneClean}')" style="flex:1;min-width:100px;padding:10px;background:var(--green);color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--ff)">✓ Done</button>
            <button onclick="closeSlotDetail(); markNoShow('${b.id}')" style="flex:1;min-width:100px;padding:10px;background:#FBBF24;color:#7C2D12;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--ff)" title="Patient didn't show up">⊘ No-Show</button>
            <button onclick="closeSlotDetail(); cancelAppt('${b.id}')" style="flex:1;min-width:100px;padding:10px;background:var(--red);color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--ff)">✗ Cancel</button>
          </div>
        </div>`;
    }

    // Build modal
    const existing = document.getElementById("slotDetailModal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "slotDetailModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(31,47,38,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;animation:fadeIn .2s";
    modal.onclick = (e) => { if (e.target === modal) window.closeSlotDetail(); };
    modal.innerHTML = `
      <div style="background:white;border-radius:var(--r-lg);max-width:420px;width:100%;padding:22px;box-shadow:var(--shadow-xl);position:relative">
        <button onclick="closeSlotDetail()" style="position:absolute;top:10px;right:10px;background:none;border:none;font-size:22px;cursor:pointer;color:var(--navy-m);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center" aria-label="Close">×</button>
        ${body}
      </div>`;
    document.body.appendChild(modal);
  };

  window.closeSlotDetail = function () {
    const m = document.getElementById("slotDetailModal");
    if (m) m.remove();
  };

  /* ─────────────────────────────────────────────
     FEATURE 2 — NEXT PATIENT HERO CARD
  ───────────────────────────────────────────── */
  function renderNextPatient(todayBookings) {
    const card = document.getElementById("nextPatientCard");
    if (!card) return;

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const today = now.toISOString().split("T")[0];

    // Find next upcoming confirmed booking (today, slot in future or current)
    const upcoming = todayBookings
      .filter(b => b.status === "confirmed" && b.date === today)
      .map(b => ({ ...b, mins: slotToMinutes(b.slot) }))
      .filter(b => b.mins >= nowMins - 5)
      .sort((a, b) => a.mins - b.mins);

    if (upcoming.length === 0) {
      card.style.display = "none";
      return;
    }

    const next = upcoming[0];
    const minsUntil = next.mins - nowMins;
    let urgencyLabel, urgencyColor;
    if (minsUntil <= 5) { urgencyLabel = "Now"; urgencyColor = "#DC2626"; }
    else if (minsUntil <= 30) { urgencyLabel = `In ${minsUntil} min`; urgencyColor = "#D97706"; }
    else { urgencyLabel = `In ${Math.floor(minsUntil/60)}h ${minsUntil%60}m`; urgencyColor = "var(--teal-d)"; }

    const phoneClean = (next.phone || "").replace(/\D/g, "");
    const reminderMsg = encodeURIComponent(`Hi ${next.patientName}! Just a reminder — your appointment is at ${next.slot} today (Token #${next.token}). See you soon. — HealthFirst`);
    const waLink = phoneClean.length >= 10 ? `https://wa.me/91${phoneClean}?text=${reminderMsg}` : "";

    card.style.display = "block";
    card.innerHTML = `
      <div style="background:linear-gradient(135deg, var(--teal) 0%, var(--teal-d) 100%);border-radius:var(--r-xl);padding:24px;margin-bottom:20px;color:white;position:relative;overflow:hidden;box-shadow:0 8px 24px rgba(79,70,229,0.25)">
        <div style="position:absolute;top:-30px;right:-30px;width:140px;height:140px;background:rgba(255,255,255,0.08);border-radius:50%"></div>
        <div style="position:relative;z-index:1">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px">
            <div style="flex:1;min-width:240px">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85;margin-bottom:6px">Next Patient</div>
              <div style="font-family:var(--ff-d);font-size:30px;font-weight:700;line-height:1.1;margin-bottom:4px">${escapeHtml(next.patientName)}</div>
              <div style="font-size:14px;opacity:0.92">${escapeHtml(next.gender || "")}${next.age ? ", " + escapeHtml(next.age) + " yrs" : ""} · ${escapeHtml(next.reason || "General consultation")}</div>
            </div>
            <div style="text-align:right">
              <div style="background:${urgencyColor};color:white;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:700;display:inline-block;margin-bottom:8px">⏰ ${urgencyLabel}</div>
              <div style="font-family:var(--ff-d);font-size:24px;font-weight:700">${escapeHtml(next.slot)}</div>
              <div style="font-size:12px;opacity:0.85">Token ${escapeHtml(next.token)}</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.15);flex-wrap:wrap;align-items:center">
            <div style="font-size:13px;opacity:0.9">📞 ${escapeHtml(next.phone || "—")}</div>
            <div style="font-size:13px;opacity:0.9">${next.paymentMethod === "paid_online" ? "✅ Paid online" : "🏥 Pay at clinic"}</div>
            <div style="margin-left:auto;display:flex;gap:8px">
              ${phoneClean ? `<a href="${waLink}" target="_blank" style="background:rgba(255,255,255,0.2);color:white;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:1px solid rgba(255,255,255,0.3)">💬 Send Reminder</a>` : ""}
              ${phoneClean ? `<a href="tel:${escapeHtml(next.phone)}" style="background:rgba(255,255,255,0.2);color:white;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:1px solid rgba(255,255,255,0.3)">📞 Call</a>` : ""}
              <button onclick="showPatientHistory('${escapeHtml(next.phone || "")}','${escapeHtml(next.patientName).replace(/'/g, "\\'")}')" style="background:white;color:var(--teal-d);padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;border:none;cursor:pointer;font-family:var(--ff)">📋 View History</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ─────────────────────────────────────────────
     FEATURE 3 — PATIENT HISTORY MODAL
  ───────────────────────────────────────────── */
  window.showPatientHistory = async function (phone, name) {
    const modal = document.getElementById("patientHistoryModal");
    if (!modal) return;
    const all = window._myAllBookings || [];
    const phoneClean = (phone || "").replace(/\D/g, "");
    const visits = all.filter(b => (b.phone || "").replace(/\D/g, "") === phoneClean)
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    document.getElementById("phmName").textContent = name || "Patient History";
    document.getElementById("phmSub").textContent = `📞 ${phone || "—"} · ${visits.length} visit${visits.length === 1 ? "" : "s"} on record`;

    const content = document.getElementById("phmContent");

    // Fetch prescriptions for this patient (matching phone)
    let prescriptions = [];
    try {
      const { collection, query, where, getDocs } = window._fs;
      const me = window._currentDoctor || {};
      // Match by phone; also restrict to this doctor's prescriptions for safety
      const q = query(
        collection(db, "prescriptions"),
        where("patientPhone", "==", phoneClean),
        where("doctorEmail", "==", (window._auth?.auth?.currentUser?.email) || "")
      );
      const qs = await getDocs(q);
      qs.forEach(d => prescriptions.push({ id: d.id, ...d.data() }));
      prescriptions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    } catch (e) {
      console.warn("Could not fetch prescriptions for patient history:", e);
    }

    // Render prescription section HTML
    const prescriptionsHtml = prescriptions.length === 0 ? "" : `
      <div style="font-family:var(--ff-d);font-size:16px;font-weight:700;color:var(--navy);margin:22px 0 10px">💊 Prescriptions Written (${prescriptions.length})</div>
      ${prescriptions.map(p => `
        <div style="padding:12px 14px;border:1px solid var(--border);border-radius:var(--r);margin-bottom:10px;background:var(--cream)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
            <div style="font-weight:700;color:var(--navy);font-size:14px">📅 ${escapeHtml(p.date || "—")}${p.token ? ' · ' + escapeHtml(p.token) : ''}</div>
            <button onclick="reprintPrescription('${p.id}')" style="background:var(--teal);color:white;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--ff)">🖨 Reprint</button>
          </div>
          ${p.diagnosis ? `<div style="font-size:13px;color:var(--navy-s);margin-bottom:6px"><strong>Diagnosis:</strong> ${escapeHtml(p.diagnosis)}</div>` : ""}
          ${p.medicines && p.medicines.length > 0 ? `
            <div style="font-size:13px;color:var(--navy-s);line-height:1.6">
              <strong>Medicines:</strong>
              <ul style="margin:4px 0 0 18px;padding:0">
                ${p.medicines.map(m => `<li>${escapeHtml(m.name)}${m.dose ? ' — ' + escapeHtml(m.dose) : ''}${m.frequency ? ' (' + escapeHtml(m.frequency) + ')' : ''}</li>`).join("")}
              </ul>
            </div>` : ""}
          ${p.notes ? `<div style="font-size:13px;color:var(--navy-s);margin-top:6px"><strong>Advice:</strong> ${escapeHtml(p.notes)}</div>` : ""}
          ${p.followup && p.followup !== "No follow-up needed" ? `<div style="font-size:12px;color:var(--teal-d);margin-top:6px;font-weight:600">🔁 Follow-up in: ${escapeHtml(p.followup)}</div>` : ""}
        </div>
      `).join("")}
    `;

    if (visits.length === 0 && prescriptions.length === 0) {
      content.innerHTML = `<div style="text-align:center;padding:32px;color:var(--navy-m);font-size:14px"><div style="font-size:40px;margin-bottom:10px">🆕</div>This is the patient's first visit.</div>`;
    } else if (visits.length === 0) {
      content.innerHTML = prescriptionsHtml;
    } else {
      // Patient summary
      const completed = visits.filter(v => v.status === "done");
      const cancelled = visits.filter(v => v.status === "cancelled");
      const totalPaid = completed.reduce((s, v) => s + (parseInt(v.fee) || 0), 0);
      const firstVisit = visits[visits.length - 1];
      const lastVisit = visits[0];
      const age = firstVisit.age || "—";
      const gender = firstVisit.gender || "—";

      content.innerHTML = `
        <div style="background:var(--bg);border-radius:var(--r-lg);padding:14px 16px;margin-bottom:18px;font-size:13px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
          <div><div style="color:var(--navy-m);font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:2px">Age</div><div style="color:var(--navy);font-weight:700">${escapeHtml(age)}</div></div>
          <div><div style="color:var(--navy-m);font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:2px">Gender</div><div style="color:var(--navy);font-weight:700">${escapeHtml(gender)}</div></div>
          <div><div style="color:var(--navy-m);font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:2px">First Visit</div><div style="color:var(--navy);font-weight:700">${escapeHtml(firstVisit.date || "—")}</div></div>
          <div><div style="color:var(--navy-m);font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:2px">Total Visits</div><div style="color:var(--teal);font-weight:700">${completed.length} done${cancelled.length ? " · " + cancelled.length + " cancelled" : ""}</div></div>
          <div><div style="color:var(--navy-m);font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:2px">Total Paid</div><div style="color:var(--teal);font-weight:700">₹${totalPaid.toLocaleString("en-IN")}</div></div>
          <div><div style="color:var(--navy-m);font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:2px">Prescriptions</div><div style="color:var(--teal);font-weight:700">${prescriptions.length}</div></div>
        </div>
        ${prescriptionsHtml}
        <div style="font-family:var(--ff-d);font-size:16px;font-weight:700;color:var(--navy);margin:22px 0 10px">📋 Visit History</div>
        ${visits.map(v => {
          const statusColor = v.status === "done" ? "var(--green)" : v.status === "cancelled" ? "var(--red)" : "var(--amber)";
          return `
            <div style="padding:12px 0;border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:4px">
                <div style="font-weight:700;color:var(--navy);font-size:14px">${escapeHtml(v.dateDisplay || v.date || "—")} at ${escapeHtml(v.slot || "")}</div>
                <span style="background:${statusColor};color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase">${escapeHtml(v.status || "—")}</span>
              </div>
              <div style="font-size:13px;color:var(--navy-m);line-height:1.5">
                ${v.reason ? `<strong>Reason:</strong> ${escapeHtml(v.reason)}<br>` : ""}
                <strong>Fee:</strong> ₹${escapeHtml(v.fee || "0")} · <strong>Token:</strong> ${escapeHtml(v.token || "—")} · ${v.paymentMethod === "paid_online" ? "✅ Paid online" : "🏥 Pay at clinic"}
              </div>
            </div>`;
        }).join("")}
      `;
    }

    // Cache prescriptions so reprint can find them
    window._cachedPrescriptions = window._cachedPrescriptions || {};
    prescriptions.forEach(p => { window._cachedPrescriptions[p.id] = p; });

    modal.style.display = "flex";
  };

  window.closePatientHistory = function () {
    document.getElementById("patientHistoryModal").style.display = "none";
  };

  // Reprint a saved prescription (opens print-ready window)
  window.reprintPrescription = function (prescriptionId) {
    const cache = window._cachedPrescriptions || {};
    const p = cache[prescriptionId];
    if (!p) { alert("Could not load prescription details."); return; }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Prescription — ${escapeHtml(p.patientName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Georgia, serif; color: #1F2F26; padding: 24px; background: white; }
  .clinic-header { border-bottom: 3px solid #3D5A4C; padding-bottom: 16px; margin-bottom: 22px; }
  .clinic-name { font-size: 30px; font-weight: 800; color: #3D5A4C; }
  .clinic-sub { font-size: 13px; color: #888; margin-top: 2px; }
  .doctor-block { display: flex; justify-content: space-between; margin-top: 16px; font-size: 13px; flex-wrap: wrap; gap: 10px; }
  .doc-name { font-weight: 700; font-size: 15px; }
  .patient-block { background: #F5F1EA; padding: 12px 16px; border-radius: 8px; margin-bottom: 22px; font-size: 13px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  h3 { color: #3D5A4C; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; border-bottom: 1px solid #DDE5DB; padding-bottom: 5px; margin-top: 22px; }
  .med-list { list-style: none; padding: 0; counter-reset: med; }
  .med-list li { padding: 9px 0 9px 30px; border-bottom: 1px dashed #DDE5DB; font-size: 14px; position: relative; counter-increment: med; }
  .med-list li::before { content: counter(med) "."; position: absolute; left: 0; font-weight: 700; color: #3D5A4C; }
  .med-name { font-weight: 700; }
  .med-detail { color: #666; font-size: 12px; margin-top: 2px; }
  .notes { font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
  .followup-tag { display: inline-block; background: #EEF1ED; color: #3D5A4C; padding: 8px 14px; border-radius: 6px; font-weight: 700; font-size: 13px; margin-top: 12px; }
  .footer { margin-top: 70px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; }
  .sign-line { border-top: 1px solid #1F2F26; padding-top: 6px; min-width: 220px; text-align: center; font-size: 12px; font-weight: 600; }
  @media print { body { padding: 0; } .print-toolbar { display: none; } }
  .print-toolbar { position: fixed; top: 12px; right: 12px; }
  .print-toolbar button { padding: 8px 16px; background: #3D5A4C; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style></head><body>
<div class="print-toolbar"><button onclick="window.print()">🖨 Print Now</button></div>
<div class="clinic-header">
  <div class="clinic-name">HealthFirst</div>
  <div class="clinic-sub">Quality healthcare, when you need it</div>
  <div class="doctor-block">
    <div>
      <div class="doc-name">Dr. ${escapeHtml(p.doctorName || '—')}</div>
      <div style="color:#666">${escapeHtml(p.doctorSpecialty || '')}${p.doctorQualification ? ' · ' + escapeHtml(p.doctorQualification) : ''}</div>
    </div>
    <div style="text-align:right">
      <div><strong>Date:</strong> ${escapeHtml(p.date)}</div>
      ${p.token ? `<div><strong>Token:</strong> ${escapeHtml(p.token)}</div>` : ''}
    </div>
  </div>
</div>
<div class="patient-block">
  <div><strong>Patient:</strong> ${escapeHtml(p.patientName)}</div>
  ${p.age ? `<div><strong>Age:</strong> ${escapeHtml(p.age)} yrs</div>` : ''}
  ${p.gender ? `<div><strong>Gender:</strong> ${escapeHtml(p.gender)}</div>` : ''}
  ${p.patientPhone ? `<div><strong>Phone:</strong> ${escapeHtml(p.patientPhone)}</div>` : ''}
</div>
${p.diagnosis ? `<h3>Diagnosis</h3><div class="notes">${escapeHtml(p.diagnosis)}</div>` : ''}
${p.medicines && p.medicines.length > 0 ? `<h3>℞ Medicines</h3><ol class="med-list">${p.medicines.map(m => `<li><div class="med-name">${escapeHtml(m.name)}</div><div class="med-detail">${escapeHtml(m.dose||'')}${m.dose&&m.frequency?' · ':''}${escapeHtml(m.frequency||'')}</div></li>`).join('')}</ol>` : ''}
${p.notes ? `<h3>Doctor's Advice</h3><div class="notes">${escapeHtml(p.notes)}</div>` : ''}
${p.followup && p.followup !== 'No follow-up needed' ? `<div class="followup-tag">🔁 Next follow-up in: ${escapeHtml(p.followup)}</div>` : ''}
<div class="footer">
  <div>Generated by HealthFirst</div>
  <div class="sign-line">Doctor's Signature</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { alert('⚠️ Pop-up blocked. Allow pop-ups and try again.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  // Print today's appointment queue in a clean, focused layout (only the queue, not the whole page)
  window.printTodayQueue = function () {
    const me = window._currentDoctor || {};
    const today = new Date().toISOString().split("T")[0];
    const all = window._myAllBookings || [];
    const todays = all.filter(b => b.date === today && b.status !== "cancelled")
                      .sort((a, b) => (a.slot || "").localeCompare(b.slot || ""));
    const todayDisplay = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const rowsHtml = todays.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">No appointments scheduled for today.</td></tr>`
      : todays.map((b, i) => `
          <tr>
            <td style="font-weight:700;color:#3D5A4C">${escapeHtml(b.slot || '—')}</td>
            <td style="font-weight:700">#${escapeHtml(b.token || '—')}</td>
            <td>${escapeHtml(b.patientName || '—')}</td>
            <td>${escapeHtml(b.age || '—')} ${escapeHtml(b.gender || '')}</td>
            <td>${escapeHtml(b.phone || '—')}</td>
            <td><span style="text-transform:uppercase;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:${b.status==='done'?'#DCFCE7':b.status==='confirmed'?'#FEF3C7':'#FEE2E2'};color:${b.status==='done'?'#166534':b.status==='confirmed'?'#92400E':'#991B1B'}">${escapeHtml(b.status || '—')}</span></td>
          </tr>
        `).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Today's Queue — Dr. ${escapeHtml(me.name || '')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Georgia, serif; color: #1F2F26; padding: 20px; background: white; margin: 0; }
  .header { border-bottom: 3px solid #3D5A4C; padding-bottom: 14px; margin-bottom: 22px; }
  .clinic-name { font-size: 26px; font-weight: 800; color: #3D5A4C; }
  .meta { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; font-size: 13px; }
  .meta strong { color: #3D5A4C; }
  h2 { font-size: 16px; color: #3D5A4C; margin: 18px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #F5F1EA; color: #3D5A4C; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #3D5A4C; }
  td { padding: 10px 12px; border-bottom: 1px solid #DDE5DB; }
  tr:nth-child(even) td { background: #FAF6EF; }
  .summary { display: flex; gap: 24px; margin-top: 18px; font-size: 12px; color: #555; padding-top: 12px; border-top: 1px solid #DDE5DB; }
  .summary strong { color: #1F2F26; }
  @media print { body { padding: 0; } .print-toolbar { display: none; } }
  .print-toolbar { position: fixed; top: 12px; right: 12px; }
  .print-toolbar button { padding: 8px 16px; background: #3D5A4C; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style></head><body>
<div class="print-toolbar"><button onclick="window.print()">🖨 Print Now</button></div>
<div class="header">
  <div class="clinic-name">HealthFirst — Today's Queue</div>
  <div class="meta">
    <div><strong>Dr. ${escapeHtml(me.name || '—')}</strong>${me.specialty ? ' · ' + escapeHtml(me.specialty) : ''}</div>
    <div><strong>Date:</strong> ${escapeHtml(todayDisplay)}</div>
  </div>
</div>
<h2>Appointment List (${todays.length})</h2>
<table>
  <thead>
    <tr>
      <th>Time</th>
      <th>Token</th>
      <th>Patient Name</th>
      <th>Age / Gender</th>
      <th>Phone</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="summary">
  <div>Total Booked: <strong>${todays.length}</strong></div>
  <div>Completed: <strong>${todays.filter(b => b.status === 'done').length}</strong></div>
  <div>Pending: <strong>${todays.filter(b => b.status === 'confirmed').length}</strong></div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { alert('⚠️ Pop-up blocked. Allow pop-ups and try again.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* ─── DOCTOR EXPORTS: Earnings (CSV / PDF) and Patient Records (CSV) ─── */

  function _csvEsc(v) {
    if (v == null) return "";
    return '"' + String(v).replace(/"/g, '""') + '"';
  }

  function _downloadCSV(csv, filename) {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.exportEarningsCSV = function () {
    const me = window._currentDoctor || {};
    const all = window._myAllBookings || [];
    const completed = all.filter(b => b.status === "done").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (completed.length === 0) { alert("No completed visits to export yet."); return; }

    const headers = ["Date", "Time", "Token", "Patient Name", "Phone", "Age", "Gender", "Reason", "Fee (₹)", "Payment Method", "Booking ID"];
    const lines = [headers.map(_csvEsc).join(",")];
    let total = 0;
    completed.forEach(b => {
      const fee = parseInt(b.fee) || 0;
      total += fee;
      lines.push([
        b.date || "", b.slot || "", b.token || "", b.patientName || "", b.phone || "",
        b.age || "", b.gender || "", b.reason || "", fee,
        b.paymentMethod === "paid_online" ? "Paid Online" : b.paymentMethod === "cash" ? "Cash / Walk-in" : "Pay at Clinic",
        b.id || ""
      ].map(_csvEsc).join(","));
    });
    lines.push(["", "", "", "", "", "", "", "TOTAL", total, "", ""].map(_csvEsc).join(","));

    const stamp = new Date().toISOString().split("T")[0];
    const safeName = (me.name || "doctor").toLowerCase().replace(/[^a-z0-9]/g, "-");
    _downloadCSV(lines.join("\r\n"), `earnings-${safeName}-${stamp}.csv`);
  };

  window.exportEarningsPDF = function () {
    const me = window._currentDoctor || {};
    const all = window._myAllBookings || [];
    const completed = all.filter(b => b.status === "done").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (completed.length === 0) { alert("No completed visits to export yet."); return; }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
    const totalAll = completed.reduce((s, b) => s + (parseInt(b.fee) || 0), 0);
    const monthTotal = completed.filter(b => { if (!b.date) return false; const d = new Date(b.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, b) => s + (parseInt(b.fee) || 0), 0);
    const weekTotal = completed.filter(b => { if (!b.date) return false; return new Date(b.date) >= sevenDaysAgo; }).reduce((s, b) => s + (parseInt(b.fee) || 0), 0);
    const todayTotal = completed.filter(b => b.date === todayStr).reduce((s, b) => s + (parseInt(b.fee) || 0), 0);

    const rowsHtml = completed.map(b => {
      const fee = parseInt(b.fee) || 0;
      return `<tr>
        <td>${escapeHtml(b.date || "—")}</td>
        <td>${escapeHtml(b.slot || "—")}</td>
        <td>${escapeHtml(b.token || "—")}</td>
        <td>${escapeHtml(b.patientName || "—")}</td>
        <td>${escapeHtml(b.phone || "—")}</td>
        <td>${escapeHtml(b.paymentMethod === "paid_online" ? "Online" : b.paymentMethod === "cash" ? "Cash" : "Clinic")}</td>
        <td style="text-align:right;font-weight:700;color:#3D5A4C">₹${fee.toLocaleString("en-IN")}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Earnings Report — Dr. ${escapeHtml(me.name || "")}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Georgia, serif; color: #1F2F26; padding: 20px; background: white; margin: 0; }
  .header { border-bottom: 3px solid #3D5A4C; padding-bottom: 14px; margin-bottom: 22px; }
  .clinic-name { font-size: 26px; font-weight: 800; color: #3D5A4C; }
  .clinic-sub { font-size: 13px; color: #888; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; font-size: 13px; flex-wrap: wrap; gap: 10px; }
  .meta strong { color: #3D5A4C; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 22px 0; }
  .summary-card { background: #F5F1EA; border-radius: 8px; padding: 14px; text-align: center; border: 1px solid #DDE5DB; }
  .summary-card .lbl { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; font-weight: 700; }
  .summary-card .val { font-size: 20px; font-weight: 800; color: #3D5A4C; }
  h2 { font-size: 16px; color: #3D5A4C; margin: 18px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #3D5A4C; color: white; text-align: left; padding: 9px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
  th:last-child { text-align: right; }
  td { padding: 9px 10px; border-bottom: 1px solid #DDE5DB; }
  tr:nth-child(even) td { background: #FAF6EF; }
  .total-row { background: #EEF1ED !important; font-weight: 700; }
  .total-row td { border-top: 2px solid #3D5A4C; padding: 12px 10px; font-size: 13px; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #DDE5DB; font-size: 11px; color: #888; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } .print-toolbar { display: none; } }
  .print-toolbar { position: fixed; top: 12px; right: 12px; }
  .print-toolbar button { padding: 8px 16px; background: #3D5A4C; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style></head><body>
<div class="print-toolbar"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
<div class="header">
  <div class="clinic-name">HealthFirst — Earnings Report</div>
  <div class="clinic-sub">Quality healthcare, when you need it</div>
  <div class="meta">
    <div><strong>Dr. ${escapeHtml(me.name || "—")}</strong>${me.specialty ? " · " + escapeHtml(me.specialty) : ""}${me.qualification ? " · " + escapeHtml(me.qualification) : ""}</div>
    <div><strong>Generated:</strong> ${new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</div>
  </div>
</div>
<div class="summary-grid">
  <div class="summary-card"><div class="lbl">All-Time</div><div class="val">₹${totalAll.toLocaleString("en-IN")}</div></div>
  <div class="summary-card"><div class="lbl">This Month</div><div class="val">₹${monthTotal.toLocaleString("en-IN")}</div></div>
  <div class="summary-card"><div class="lbl">This Week</div><div class="val">₹${weekTotal.toLocaleString("en-IN")}</div></div>
  <div class="summary-card"><div class="lbl">Today</div><div class="val">₹${todayTotal.toLocaleString("en-IN")}</div></div>
</div>
<h2>Completed Visits (${completed.length})</h2>
<table>
  <thead><tr><th>Date</th><th>Time</th><th>Token</th><th>Patient</th><th>Phone</th><th>Payment</th><th>Fee</th></tr></thead>
  <tbody>${rowsHtml}<tr class="total-row"><td colspan="6">TOTAL</td><td style="text-align:right">₹${totalAll.toLocaleString("en-IN")}</td></tr></tbody>
</table>
<div class="footer">
  <div>Generated by HealthFirst on ${new Date().toLocaleString("en-IN")}</div>
  <div>End of Report</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { alert("⚠️ Pop-up blocked. Allow pop-ups and try again."); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  window.exportPatientsCSV = function () {
    const me = window._currentDoctor || {};
    const all = window._myAllBookings || [];
    if (all.length === 0) { alert("No patient records to export yet."); return; }

    const patientsByPhone = {};
    all.forEach(b => {
      const phone = (b.phone || "").replace(/\D/g, "");
      if (!phone) return;
      if (!patientsByPhone[phone]) {
        patientsByPhone[phone] = {
          name: b.patientName || "—", phone: phone,
          age: b.age || "", gender: b.gender || "",
          visits: [], totalPaid: 0,
          firstVisit: b.date || "", lastVisit: b.date || ""
        };
      }
      const p = patientsByPhone[phone];
      p.visits.push(b);
      if (b.status === "done") p.totalPaid += parseInt(b.fee) || 0;
      if (b.date) {
        if (!p.firstVisit || b.date < p.firstVisit) p.firstVisit = b.date;
        if (!p.lastVisit || b.date > p.lastVisit) p.lastVisit = b.date;
      }
    });

    const patients = Object.values(patientsByPhone).sort((a, b) => (b.lastVisit || "").localeCompare(a.lastVisit || ""));

    const headers = ["Patient Name", "Phone", "Age", "Gender", "First Visit", "Last Visit", "Total Visits", "Completed", "Cancelled", "No-Shows", "Total Paid (₹)"];
    const lines = [headers.map(_csvEsc).join(",")];
    patients.forEach(p => {
      const done = p.visits.filter(v => v.status === "done").length;
      const cancelled = p.visits.filter(v => v.status === "cancelled").length;
      const noShows = p.visits.filter(v => v.status === "no_show").length;
      lines.push([
        p.name, p.phone, p.age, p.gender,
        p.firstVisit, p.lastVisit, p.visits.length,
        done, cancelled, noShows, p.totalPaid
      ].map(_csvEsc).join(","));
    });

    const stamp = new Date().toISOString().split("T")[0];
    const safeName = (me.name || "doctor").toLowerCase().replace(/[^a-z0-9]/g, "-");
    _downloadCSV(lines.join("\r\n"), `patients-${safeName}-${stamp}.csv`);
  };

  /* ─── PRESCRIPTION HISTORY (search + view past prescriptions doctor has written) ─── */

  window.loadPrescriptionHistory = async function () {
    const wrap = document.getElementById("rxHistoryResults");
    if (!wrap) return;

    const authEmail = window._auth?.auth?.currentUser?.email;
    if (!authEmail) { wrap.innerHTML = `<div style="text-align:center;color:var(--navy-m);font-size:13px;padding:14px">Not signed in.</div>`; return; }

    // Avoid re-loading if we already have data
    if (window._myPrescriptions && window._myPrescriptions.length > 0) {
      renderPrescriptionHistory(window._myPrescriptions);
      return;
    }

    try {
      const { collection, query, where, getDocs } = window._fs;
      const q = query(collection(db, "prescriptions"), where("doctorEmail", "==", authEmail));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      window._myPrescriptions = list;
      renderPrescriptionHistory(list);
      // Cache for reprint via window._cachedPrescriptions too
      window._cachedPrescriptions = window._cachedPrescriptions || {};
      list.forEach(p => { window._cachedPrescriptions[p.id] = p; });
    } catch (err) {
      console.error("Prescription history load failed:", err);
      wrap.innerHTML = `<div style="text-align:center;color:#991B1B;font-size:13px;padding:14px">Could not load: ${escapeHtml(err.message || String(err))}</div>`;
    }
  };

  function renderPrescriptionHistory(list) {
    const wrap = document.getElementById("rxHistoryResults");
    const hint = document.getElementById("rxHistoryHint");
    if (!wrap) return;
    if (hint) hint.textContent = `${list.length} prescription${list.length === 1 ? "" : "s"}`;

    if (list.length === 0) {
      wrap.innerHTML = `<div style="text-align:center;color:var(--navy-m);font-size:13px;padding:14px">No prescriptions yet. Saved prescriptions will appear here.</div>`;
      return;
    }

    wrap.innerHTML = list.slice(0, 50).map(p => {
      const medsLine = (p.medicines || []).slice(0, 3).map(m => m.name).filter(Boolean).join(", ") + ((p.medicines || []).length > 3 ? "…" : "");
      return `
        <div style="padding:11px 12px;border:1px solid var(--border);border-radius:var(--r);margin-bottom:8px;background:var(--cream);display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;color:var(--navy);font-size:13px;margin-bottom:2px">${escapeHtml(p.patientName || "—")} <span style="font-weight:400;color:var(--navy-m);font-size:12px;margin-left:6px">${escapeHtml(p.date || "")}</span></div>
            <div style="font-size:12px;color:var(--navy-m);line-height:1.4">${p.diagnosis ? `<strong>Dx:</strong> ${escapeHtml(p.diagnosis.substring(0, 80))}${p.diagnosis.length > 80 ? "…" : ""}` : ""}${p.diagnosis && medsLine ? " · " : ""}${medsLine ? `💊 ${escapeHtml(medsLine)}` : ""}</div>
          </div>
          <button onclick="reprintPrescription('${p.id}')" style="background:var(--teal);color:white;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--ff);white-space:nowrap">🖨 View</button>
        </div>`;
    }).join("");
  }

  // Live search across patient name, phone, diagnosis, medicine names
  window.searchPrescriptionHistory = function () {
    const q = (document.getElementById("rxHistorySearch")?.value || "").trim().toLowerCase();
    const all = window._myPrescriptions || [];
    if (!q) { renderPrescriptionHistory(all); return; }
    const filtered = all.filter(p => {
      if ((p.patientName || "").toLowerCase().includes(q)) return true;
      if ((p.patientPhone || "").includes(q)) return true;
      if ((p.diagnosis || "").toLowerCase().includes(q)) return true;
      if ((p.medicines || []).some(m => (m.name || "").toLowerCase().includes(q))) return true;
      if ((p.notes || "").toLowerCase().includes(q)) return true;
      return false;
    });
    renderPrescriptionHistory(filtered);
  };

  /* ─── PRIVATE NOTES (per-doctor journal, auto-saved with debounce) ─── */

  let _notesSaveTimer = null;
  let _notesLoaded = false;
  let _notesLastSavedContent = null;

  window.loadMyNotes = async function () {
    const me = window._currentDoctor || {};
    if (!me.id) return;
    const txt = document.getElementById("myNotesTextarea");
    const status = document.getElementById("notesSaveStatus");
    if (!txt) return;

    if (_notesLoaded) { _updateNotesCharCount(); return; } // already loaded once this session

    try {
      const { doc, getDoc } = window._fs;
      const snap = await getDoc(doc(db, "doctorNotes", me.id));
      const content = snap.exists() ? (snap.data().content || "") : "";
      txt.value = content;
      _notesLastSavedContent = content;
      _notesLoaded = true;
      if (status) status.textContent = content ? "✓ Loaded" : "Start typing…";
      _updateNotesCharCount();
    } catch (err) {
      console.warn("Notes load failed:", err);
      if (status) { status.textContent = "Could not load"; status.style.color = "#991B1B"; }
    }
  };

  function _updateNotesCharCount() {
    const txt = document.getElementById("myNotesTextarea");
    const cnt = document.getElementById("notesCharCount");
    if (txt && cnt) cnt.textContent = `${txt.value.length} character${txt.value.length === 1 ? "" : "s"}`;
  }

  // Triggered on every keystroke — debounces save by 1 second
  window.onNotesChange = function () {
    _updateNotesCharCount();
    const status = document.getElementById("notesSaveStatus");
    if (status) { status.textContent = "Saving…"; status.style.color = "var(--navy-m)"; }

    if (_notesSaveTimer) clearTimeout(_notesSaveTimer);
    _notesSaveTimer = setTimeout(_doSaveNotes, 1000);
  };

  async function _doSaveNotes() {
    const me = window._currentDoctor || {};
    if (!me.id) return;
    const txt = document.getElementById("myNotesTextarea");
    const status = document.getElementById("notesSaveStatus");
    if (!txt) return;
    const content = txt.value;

    // Skip save if nothing changed since last save
    if (content === _notesLastSavedContent) {
      if (status) { status.textContent = "✓ Saved"; status.style.color = "var(--teal)"; }
      return;
    }

    if (content.length > 100000) {
      if (status) { status.textContent = "⚠️ Too long (100k char max)"; status.style.color = "#991B1B"; }
      return;
    }

    try {
      const { doc, setDoc, serverTimestamp } = window._fs;
      await setDoc(doc(db, "doctorNotes", me.id), {
        content: content,
        doctorEmail: (window._auth?.auth?.currentUser?.email) || me.email || "",
        updatedAt: serverTimestamp()
      });
      _notesLastSavedContent = content;
      if (status) { status.textContent = "✓ Saved " + new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); status.style.color = "var(--teal)"; }
    } catch (err) {
      console.error("Notes save failed:", err);
      if (status) { status.textContent = "❌ Save failed — check rules"; status.style.color = "#991B1B"; }
    }
  }


  /* ─── DOCTOR PROFILE PHOTO UPLOAD ─── */
  // Resizes a File to a 400x400 JPEG dataURL under ~150KB for Firestore storage
  function _resizeImageToDataURL(file, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          const ratio = Math.min(maxDim / w, maxDim / h, 1);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          // Try qualities until under 150KB
          let quality = 0.85;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > 200_000 && quality > 0.4) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  window.uploadDoctorPhoto = async function (file) {
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      alert('⚠️ Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('⚠️ Image is too large (over 8 MB). Please pick a smaller photo.');
      return;
    }
    const me = window._currentDoctor || {};
    if (!me.id) { alert('⚠️ Profile not loaded. Please refresh and try again.'); return; }

    // Show "Uploading..." state
    const av = document.getElementById('sbAvatar');
    let oldHTML = '';
    if (av) {
      oldHTML = av.innerHTML;
      av.innerHTML = '<div style="font-size:12px;color:white;font-weight:600">Uploading…</div>';
      av.style.background = 'var(--teal)';
    }

    try {
      const photoDataUrl = await _resizeImageToDataURL(file, 400);

      const { doc, updateDoc } = window._fs;
      await updateDoc(doc(db, 'doctors', me.id), { photoUrl: photoDataUrl });

      window._currentDoctor = { ...me, photoUrl: photoDataUrl };
      _applyDoctorPhotoToSidebar(photoDataUrl);
      alert('✅ Photo updated! Patients will see it on the booking page.');
    } catch (err) {
      console.error('Photo upload failed:', err);
      if (av) { av.innerHTML = oldHTML; av.style.background = ''; }
      alert('❌ Could not upload: ' + (err.message || err) + '\n\nIf this says "permission denied", make sure you published the latest firestore.rules.');
    }
  };

  // Renders the uploaded photo into the sidebar circle
  function _applyDoctorPhotoToSidebar(photoUrl) {
    const av = document.getElementById('sbAvatar');
    if (!av) return;
    av.style.background = '';
    av.innerHTML = `<img src="${photoUrl}" alt="Profile" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit"><div class="photo-edit-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.55);color:white;display:none;align-items:center;justify-content:center;font-size:11px;font-weight:600;text-align:center;line-height:1.3;border-radius:inherit">📷<br>Change<br>photo</div>`;
    // Re-bind hover listeners since we replaced innerHTML
    const overlay = av.querySelector('.photo-edit-overlay');
    if (overlay) {
      av.addEventListener('mouseenter', () => { overlay.style.display = 'flex'; });
      av.addEventListener('mouseleave', () => { overlay.style.display = 'none'; });
    }
  }
  window._applyDoctorPhotoToSidebar = _applyDoctorPhotoToSidebar;

  // Opens the confirmation modal, populating with the doctor's stats
  window.openDeleteAccountModal = function () {
    const me = window._currentDoctor || {};
    if (!me.id) { alert("⚠️ Profile not loaded. Please refresh."); return; }

    // Count upcoming bookings (today + future, not yet completed/cancelled)
    const all = window._myAllBookings || [];
    const todayStr = new Date().toISOString().split("T")[0];
    const upcoming = all.filter(b => (b.date || "") >= todayStr && b.status === "confirmed");

    const upLi = document.getElementById("delModalUpcoming");
    if (upLi) {
      upLi.textContent = upcoming.length === 0
        ? "You have no upcoming appointments — nothing to cancel"
        : `Your ${upcoming.length} upcoming appointment${upcoming.length === 1 ? "" : "s"} will be cancelled automatically`;
    }
    const inp = document.getElementById("delConfirmInput");
    if (inp) inp.value = "";
    const btn = document.getElementById("delConfirmBtn");
    if (btn) { btn.disabled = true; btn.style.opacity = ".5"; btn.textContent = "Delete Forever"; }
    const status = document.getElementById("delStatus");
    if (status) status.style.display = "none";

    const m = document.getElementById("deleteAccountModal");
    if (m) m.style.display = "flex";
  };

  window.closeDeleteAccountModal = function () {
    const m = document.getElementById("deleteAccountModal");
    if (m) m.style.display = "none";
  };

  // Enable/disable the Delete Forever button based on whether user typed DELETE correctly
  window.onDelConfirmChange = function () {
    const inp = document.getElementById("delConfirmInput");
    const btn = document.getElementById("delConfirmBtn");
    if (!inp || !btn) return;
    const ok = inp.value.trim() === "DELETE";
    btn.disabled = !ok;
    btn.style.opacity = ok ? "1" : ".5";
  };

  function _showDelStatus(text, isError) {
    const s = document.getElementById("delStatus");
    if (!s) return;
    s.style.display = "block";
    s.style.background = isError ? "#FEE2E2" : "var(--teal-l)";
    s.style.color = isError ? "#991B1B" : "var(--teal-d)";
    s.textContent = text;
  }

  // Performs the actual deletion across Firestore + Firebase Auth
  window.confirmDeleteMyAccount = async function () {
    const inp = document.getElementById("delConfirmInput");
    if (!inp || inp.value.trim() !== "DELETE") return;

    const me = window._currentDoctor || {};
    if (!me.id) { _showDelStatus("⚠️ Profile not loaded. Refresh and try again.", true); return; }

    const btn = document.getElementById("delConfirmBtn");
    if (btn) { btn.disabled = true; btn.style.opacity = ".6"; btn.textContent = "Deleting..."; }

    try {
      const { doc, deleteDoc, collection, query, where, getDocs, updateDoc } = window._fs;

      // Step 1: Cancel all confirmed bookings (today and future) — frees up slots, notifies patients on their end
      _showDelStatus("Step 1 of 4: Cancelling upcoming appointments...");
      const all = window._myAllBookings || [];
      const todayStr = new Date().toISOString().split("T")[0];
      const upcoming = all.filter(b => (b.date || "") >= todayStr && b.status === "confirmed");
      for (const b of upcoming) {
        try {
          await updateDoc(doc(db, "bookings", b.id), { status: "cancelled" });
        } catch (e) { console.warn("Booking cancel failed (continuing):", b.id, e); }
        // Also free up the bookedSlot if we can identify it
        try {
          if (b.doctor && b.date && b.slot) {
            const slotKey = `${b.doctor}__${b.date}__${b.slot}`;
            await updateDoc(doc(db, "bookedSlots", slotKey), { status: "cancelled" });
          }
        } catch (e) { /* slot may not exist; skip */ }
      }

      // Step 2: Delete schedule (must happen before deleting doctor doc, since schedule rule checks doctor exists)
      _showDelStatus("Step 2 of 4: Removing your schedule...");
      try {
        await deleteDoc(doc(db, "doctorSchedules", me.id));
      } catch (e) { console.warn("Schedule delete failed (continuing):", e); }

      // Step 3: Delete the doctor record itself
      _showDelStatus("Step 3 of 4: Removing your profile...");
      await deleteDoc(doc(db, "doctors", me.id));

      // Step 4: Delete the Firebase Auth user (most likely to need recent sign-in)
      _showDelStatus("Step 4 of 4: Closing your login...");
      const authUser = window._auth?.auth?.currentUser;
      if (authUser) {
        try {
          await authUser.delete();
        } catch (authErr) {
          // If "requires-recent-login", we've still deleted all data — just sign them out and ask to delete login manually
          console.warn("Auth delete needs recent login:", authErr);
          await window._auth.signOut(window._auth.auth);
          alert("✅ Your data has been removed.\n\nFor security, Firebase requires recent sign-in to fully delete your login. Your data is gone — your login email will be auto-cleaned later, or you can contact admin to fully remove it.\n\nThank you for being part of HealthFirst.");
          window.location.replace("index.html");
          return;
        }
      }

      // Everything succeeded
      try { localStorage.removeItem('hf_doctor_name'); localStorage.removeItem('hf_admin_name'); } catch (e) {}
      alert("✅ Your account has been permanently deleted.\n\nThank you for being part of HealthFirst. You can re-register anytime with the same email.");
      window.location.replace("index.html");
    } catch (err) {
      console.error("Account deletion failed:", err);
      _showDelStatus("❌ Deletion failed: " + (err.message || err) + "\n\nIf this says 'permission denied', publish the latest firestore.rules. Some data may have been partially removed — contact admin for help.", true);
      if (btn) { btn.disabled = false; btn.style.opacity = "1"; btn.textContent = "Delete Forever"; }
    }
  };

  // Click outside to close
  document.addEventListener("click", function (e) {
    const modal = document.getElementById("patientHistoryModal");
    if (modal && e.target === modal) { modal.style.display = "none"; }
  });

  // Patient records click → opens history
  document.addEventListener("click", function (e) {
    const row = e.target.closest("#patientList .appt-item");
    if (row && row.dataset.phone) {
      window.showPatientHistory(row.dataset.phone, row.dataset.name || "Patient");
    }
  });

  /* ─────────────────────────────────────────────
     FEATURE 7 — NOTIFICATIONS BELL
  ───────────────────────────────────────────── */
  function getLastSeenTimestamp() {
    try { return parseInt(localStorage.getItem("hf_notifs_last_seen") || "0"); }
    catch (e) { return 0; }
  }
  function setLastSeenTimestamp(ts) {
    try { localStorage.setItem("hf_notifs_last_seen", String(ts)); } catch (e) {}
  }

  function renderNotifications(allBookings, reviews) {
    const list = document.getElementById("notifList");
    const badge = document.getElementById("notifBadge");
    if (!list || !badge) return;

    const lastSeen = getLastSeenTimestamp();
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Build notification items
    const notifs = [];

    // New bookings (since last seen)
    allBookings.forEach(b => {
      const ts = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      if (ts > lastSeen && b.status === "confirmed") {
        notifs.push({
          ts,
          icon: "📅",
          title: "New booking",
          body: `${b.patientName} booked ${b.dateDisplay || b.date} at ${b.slot}`,
          unread: true
        });
      }
      // Recent cancellations
      if (b.status === "cancelled" && b.cancelledAt) {
        const cts = b.cancelledAt?.toMillis ? b.cancelledAt.toMillis() : 0;
        if (cts > lastSeen) {
          notifs.push({
            ts: cts,
            icon: "❌",
            title: "Booking cancelled",
            body: `${b.patientName} cancelled (was ${b.dateDisplay} ${b.slot})`,
            unread: true
          });
        }
      }
    });

    // New reviews
    reviews.forEach(r => {
      const ts = r.createdAt?.toMillis ? r.createdAt.toMillis() : 0;
      if (ts > lastSeen) {
        notifs.push({
          ts,
          icon: "⭐",
          title: `${r.rating || 5}-star review`,
          body: `"${(r.comment || "").slice(0, 80)}${(r.comment || "").length > 80 ? "..." : ""}" — ${r.patientName || "Patient"}`,
          unread: true
        });
      }
    });

    // Tomorrow's bookings reminder (always show)
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().split("T")[0];
    const tomorrowBookings = allBookings.filter(b => b.date === tomorrowKey && b.status === "confirmed");
    if (tomorrowBookings.length > 0) {
      notifs.push({
        ts: now,
        icon: "🔔",
        title: `${tomorrowBookings.length} appointment${tomorrowBookings.length === 1 ? "" : "s"} tomorrow`,
        body: "Consider sending reminders today.",
        unread: false
      });
    }

    // Sort newest first
    notifs.sort((a, b) => b.ts - a.ts);

    // Update badge
    const unreadCount = notifs.filter(n => n.unread).length;
    if (unreadCount > 0) {
      badge.style.display = "flex";
      badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
    } else {
      badge.style.display = "none";
    }

    // Render list
    if (notifs.length === 0) {
      list.innerHTML = `<div style="padding:28px 18px;text-align:center;color:var(--navy-m);font-size:13px"><div style="font-size:32px;margin-bottom:8px">📭</div>You're all caught up!</div>`;
      return;
    }
    list.innerHTML = notifs.slice(0, 20).map(n => {
      const timeAgo = formatTimeAgo(n.ts);
      return `
        <div style="padding:12px 18px;border-bottom:1px solid var(--border);${n.unread ? "background:var(--teal-l)" : ""};display:flex;gap:10px;align-items:flex-start">
          <div style="font-size:20px;flex-shrink:0">${n.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
              <div style="font-weight:700;color:var(--navy);font-size:13px">${escapeHtml(n.title)}</div>
              <div style="font-size:11px;color:var(--navy-m);white-space:nowrap">${timeAgo}</div>
            </div>
            <div style="font-size:12px;color:var(--navy-m);margin-top:2px;line-height:1.4">${escapeHtml(n.body)}</div>
          </div>
        </div>`;
    }).join("");
  }

  function formatTimeAgo(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  window.toggleNotifications = function () {
    const dropdown = document.getElementById("notifDropdown");
    if (!dropdown) return;
    const willOpen = dropdown.style.display === "none" || !dropdown.style.display;
    dropdown.style.display = willOpen ? "block" : "none";
  };

  window.markAllNotificationsRead = function () {
    setLastSeenTimestamp(Date.now());
    // Re-render
    loadTodayQueue();
    document.getElementById("notifDropdown").style.display = "none";
  };

  // Close notif dropdown on outside click
  document.addEventListener("click", function (e) {
    const dropdown = document.getElementById("notifDropdown");
    const bell = document.getElementById("notifBell");
    if (dropdown && bell && !bell.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  window.markDone = async function (id, patientName, phone) {
    console.log("[markDone called]", { id, patientName, phone });
    if (!id) { alert("⚠️ No booking ID — can't mark as done."); return; }
    const result = await updateBookingStatus(id, "done");
    if (!result.ok) {
      alert("❌ Couldn't mark as done.\n\n" + (result.error || "Unknown error") + "\n\nThis is usually a Firestore permissions issue — please check your firestore.rules in Firebase Console.");
      return;
    }
    if (phone && phone.length >= 10) {
      // Build absolute URL that respects GitHub Pages subpath (/HealthFirstClinic/)
      const feedbackUrl = new URL("book.html?feedback=" + encodeURIComponent(id), window.location.href).href;
      const msg = encodeURIComponent(`Hi ${patientName}! Thank you for visiting HealthFirst today. We'd love to hear about your experience — please take a moment to share your feedback here: ${feedbackUrl}`);
      const waLink = `https://wa.me/91${phone}?text=${msg}`;
      const sendWA = confirm(`✅ Appointment marked as done!\n\nSend a feedback request to ${patientName} on WhatsApp?`);
      if (sendWA) window.open(waLink, "_blank");
    } else {
      alert("✅ Appointment marked as done!");
    }
    loadTodayQueue(); // refresh all data
  };

  window.cancelAppt = async function (id) {
    console.log("[cancelAppt called]", { id });
    if (!id) { alert("⚠️ No booking ID — can't cancel."); return; }
    if (!confirm("Cancel this appointment?")) return;
    const result = await updateBookingStatus(id, "cancelled");
    if (!result.ok) {
      alert("❌ Couldn't cancel.\n\n" + (result.error || "Unknown error") + "\n\nThis is usually a Firestore permissions issue — please check your firestore.rules in Firebase Console.");
      return;
    }
    alert("✅ Appointment cancelled.");
    loadTodayQueue(); // refresh all data
  };

  window.markNoShow = async function (id) {
    console.log("[markNoShow called]", { id });
    if (!id) { alert("⚠️ No booking ID — can't mark no-show."); return; }
    if (!confirm("Mark this patient as a No-Show?\n\nUse this when the patient didn't arrive and didn't inform you.\nDifferent from a cancellation (patient told you they wouldn't come).")) return;
    const result = await updateBookingStatus(id, "no_show");
    if (!result.ok) {
      alert("❌ Couldn't mark as no-show.\n\n" + (result.error || "Unknown error") + "\n\nThis is usually a Firestore permissions issue — please check your firestore.rules in Firebase Console.");
      return;
    }
    alert("⊘ Marked as No-Show.");
    loadTodayQueue();
  };

  /* ─── WALK-IN PATIENT (doctor adds patient who just walked in) ─── */
  window.openWalkInModal = function () {
    // Clear previous values
    ['wiName', 'wiPhone', 'wiAge', 'wiGender', 'wiReason'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const status = document.getElementById('wiStatus');
    if (status) status.style.display = 'none';
    const m = document.getElementById('walkInModal');
    if (m) m.style.display = 'flex';
  };

  window.closeWalkInModal = function () {
    const m = document.getElementById('walkInModal');
    if (m) m.style.display = 'none';
  };

  function _showWiStatus(text, isError) {
    const s = document.getElementById('wiStatus');
    if (!s) return;
    s.style.display = 'block';
    s.style.background = isError ? '#FEE2E2' : 'var(--teal-l)';
    s.style.color = isError ? '#991B1B' : 'var(--teal-d)';
    s.textContent = text;
  }

  // Build a slot label from a Date object that matches the system's format ("9:30 AM")
  function _currentTimeSlotLabel() {
    const d = new Date();
    let hours = d.getHours();
    let minutes = Math.floor(d.getMinutes() / 5) * 5; // round down to nearest 5 minutes
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    const displayMinutes = minutes === 0 ? '00' : (minutes < 10 ? '0' + minutes : minutes);
    return `${displayHours}:${displayMinutes} ${period}`;
  }

  window.submitWalkIn = async function () {
    const name = (document.getElementById('wiName')?.value || '').trim();
    let phone = (document.getElementById('wiPhone')?.value || '').replace(/\D/g, '');
    const age = (document.getElementById('wiAge')?.value || '').trim();
    const gender = document.getElementById('wiGender')?.value || '';
    const reason = (document.getElementById('wiReason')?.value || '').trim() || 'Walk-in consultation';

    if (!name) { _showWiStatus('⚠️ Please enter the patient name.', true); return; }
    if (!phone || phone.length < 10) { _showWiStatus('⚠️ Please enter a valid 10-digit phone number.', true); return; }
    if (phone.length > 15) phone = phone.slice(0, 15);

    const me = window._currentDoctor || {};
    if (!me.id || !me.name) { _showWiStatus('⚠️ Doctor profile not loaded. Please refresh.', true); return; }

    const today = new Date().toISOString().split('T')[0];
    const allMy = window._myAllBookings || [];
    const todays = allMy.filter(b => b.date === today && b.status !== 'cancelled');

    // Token = next sequential number for today
    const maxToken = todays.reduce((m, b) => {
      const n = parseInt((b.token || '0').toString().replace(/\D/g, ''), 10);
      return n > m ? n : m;
    }, 0);
    const token = String(maxToken + 1).padStart(3, '0');
    const slot = _currentTimeSlotLabel() + ' (Walk-in)';
    const dateDisplay = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const lookupToken = 'wi_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);

    const submitBtn = document.getElementById('wiSubmitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Adding...'; }

    try {
      const { collection, addDoc, doc, setDoc, serverTimestamp } = window._fs;

      const bookingData = {
        patientName: name,
        phone: phone,
        age: age || '',
        gender: gender || '',
        doctor: me.name,
        doctorEmail: (window._auth?.auth?.currentUser?.email) || me.email || '',
        doctorId: me.id,
        specialty: me.specialty || '',
        date: today,
        dateDisplay: dateDisplay,
        slot: slot,
        token: token,
        fee: me.fee || 0,
        reason: reason,
        status: 'confirmed',
        paymentMethod: 'cash',
        isWalkIn: true,
        lookupToken: lookupToken,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'bookings'), bookingData);

      // Also create a publicBookings entry so patient cancellation logic stays consistent
      try {
        await setDoc(doc(db, 'publicBookings', lookupToken), {
          bookingId: lookupToken,
          doctor: me.name,
          date: today,
          slot: slot,
          status: 'confirmed',
          createdAt: serverTimestamp()
        });
      } catch (e) { console.warn('publicBookings create skipped:', e); }

      _showWiStatus(`✅ ${name} added as Token #${token} at ${slot}!`);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '+ Add to Queue'; }

      // Refresh queue, then auto-close modal after a brief moment
      await loadTodayQueue();
      setTimeout(closeWalkInModal, 1500);
    } catch (err) {
      console.error('Walk-in submission failed:', err);
      _showWiStatus('❌ Could not add: ' + (err.message || err), true);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '+ Add to Queue'; }
    }
  };

  /* ─── DOCTOR AVAILABILITY TOGGLE ─── */
  // Flips the doctor's "available" flag in Firestore. When false, the doctor is hidden from booking page.
  window.setMyAvailability = async function () {
    const me = window._currentDoctor || {};
    if (!me.id) { alert("⚠️ Doctor profile not loaded. Please refresh."); return; }

    const toggleEl = document.getElementById('sbToggle');
    const currentlyOff = toggleEl && toggleEl.classList.contains('off');
    const newAvailable = currentlyOff; // if currently off → going to available; if currently on → going to offline

    // Optimistic UI update — flip immediately for responsiveness
    if (typeof window.applyAvailabilityUI === 'function') window.applyAvailabilityUI(!newAvailable);

    try {
      const { doc, updateDoc } = window._fs;
      await updateDoc(doc(db, "doctors", me.id), { available: newAvailable });
      window._currentDoctor = { ...me, available: newAvailable };
      // Brief confirmation toast in the label
      const label = document.getElementById('availLabel');
      if (label) {
        label.textContent = newAvailable ? '✓ Now Available' : '✓ Now Offline';
        setTimeout(() => { if (typeof window.applyAvailabilityUI === 'function') window.applyAvailabilityUI(!newAvailable); }, 1400);
      }
    } catch (err) {
      console.error('setMyAvailability failed:', err);
      // Revert UI on error
      if (typeof window.applyAvailabilityUI === 'function') window.applyAvailabilityUI(currentlyOff);
      alert('❌ Could not update availability: ' + (err.message || err) + '\n\nThis is usually a Firestore permissions issue — make sure you published the latest firestore.rules.');
    }
  };

  /* ─── PRESCRIPTION SAVE / WHATSAPP / PRINT ─── */

  // Collects current form values into a clean object
  function _gatherPrescription() {
    const pat = document.getElementById('rxPat')?.value.trim() || '';
    const me = window._currentDoctor || {};
    // Use the actual Firebase Auth email — that's what Firestore rules compare against.
    // Falling back to me.email if auth isn't available for some reason.
    const authUserEmail = (window._auth && window._auth.auth && window._auth.auth.currentUser && window._auth.auth.currentUser.email) || me.email || '';
    const medRows = document.querySelectorAll('#rxMedRows .rx-med-row');
    const medicines = Array.from(medRows).map(row => {
      const inputs = row.querySelectorAll('input');
      return {
        name: inputs[0]?.value.trim() || '',
        dose: inputs[1]?.value.trim() || '',
        frequency: inputs[2]?.value.trim() || ''
      };
    }).filter(m => m.name); // skip empty rows

    return {
      doctorId: me.id || '',
      doctorName: me.name || '',
      doctorSpecialty: me.specialty || '',
      doctorQualification: me.qualification || '',
      doctorEmail: authUserEmail, // EXACT auth email — required for Firestore rules to allow write
      bookingId: document.getElementById('rxBookingId')?.value || null,
      patientName: pat,
      patientPhone: (document.getElementById('rxPhone')?.value || '').replace(/\D/g, ''),
      age: document.getElementById('rxAge')?.value || '',
      gender: document.getElementById('rxGender')?.value || '',
      token: document.getElementById('rxToken')?.value || '',
      date: document.getElementById('rxDate')?.value || new Date().toISOString().split('T')[0],
      diagnosis: document.getElementById('rxDiag')?.value.trim() || '',
      medicines,
      notes: document.getElementById('rxNotes')?.value.trim() || '',
      followup: document.getElementById('rxFollowup')?.value || ''
    };
  }

  function _showRxStatus(text, isError) {
    const status = document.getElementById('rxSaveStatus');
    if (!status) return;
    status.style.display = 'block';
    status.style.background = isError ? '#FEE2E2' : 'var(--teal-l)';
    status.style.color = isError ? '#991B1B' : 'var(--teal-d)';
    status.textContent = text;
    if (!isError) setTimeout(() => { status.style.display = 'none'; }, 4500);
  }

  // Save to Firestore prescriptions collection
  window._doPrescriptionSave = async function () {
    const data = _gatherPrescription();
    if (!data.patientName) { alert('⚠️ Please enter a patient name first.'); return null; }
    if (data.medicines.length === 0 && !data.diagnosis && !data.notes) {
      if (!confirm('No diagnosis, medicines, or notes added — save anyway?')) return null;
    }

    // DEBUG: Log exactly what we're sending vs what the rule will check
    const authEmail = window._auth?.auth?.currentUser?.email || '(none)';
    console.log("=== PRESCRIPTION SAVE DEBUG ===");
    console.log("Firebase Auth email (rule will compare against this):", JSON.stringify(authEmail));
    console.log("doctorEmail in data:", JSON.stringify(data.doctorEmail));
    console.log("Match?:", authEmail === data.doctorEmail);
    console.log("Full data payload:", data);
    console.log("================================");

    try {
      const { collection, addDoc, serverTimestamp } = window._fs;
      const ref = await addDoc(collection(db, "prescriptions"), { ...data, createdAt: serverTimestamp() });
      _showRxStatus('✅ Prescription saved! You can find it in the patient\'s history.');
      // Invalidate cached prescription list so the history search picks up the new one
      window._myPrescriptions = null;
      return { id: ref.id, ...data };
    } catch (err) {
      console.error('Prescription save failed:', err);
      _showRxStatus('❌ Could not save: ' + (err.message || err) + ' — check firestore.rules', true);
      return null;
    }
  };

  // Save + open WhatsApp with formatted prescription text
  window._doPrescriptionWhatsApp = async function () {
    let phone = (document.getElementById('rxPhone')?.value || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      const manual = prompt('No phone number on file for this patient. Enter their 10-digit WhatsApp number (or Cancel to abort):');
      if (!manual) return;
      phone = manual.replace(/\D/g, '');
      if (phone.length < 10) { alert('⚠️ Phone must be at least 10 digits.'); return; }
      document.getElementById('rxPhone').value = phone;
    }

    const saved = await window._doPrescriptionSave();
    if (!saved) return; // save failed — abort send

    let text = `🏥 *Prescription from Dr. ${saved.doctorName}*\n`;
    if (saved.doctorSpecialty) text += `${saved.doctorSpecialty}\n`;
    text += `📅 Date: ${saved.date}\n`;
    text += `\n👤 *Patient:* ${saved.patientName}`;
    if (saved.age) text += `, ${saved.age} yrs`;
    if (saved.gender) text += `, ${saved.gender}`;
    text += `\n`;
    if (saved.token) text += `🎫 ${saved.token}\n`;

    if (saved.diagnosis) text += `\n🩺 *Diagnosis:*\n${saved.diagnosis}\n`;

    if (saved.medicines.length > 0) {
      text += `\n💊 *Medicines:*\n`;
      saved.medicines.forEach((m, i) => {
        text += `${i + 1}. ${m.name}`;
        if (m.dose) text += ` — ${m.dose}`;
        if (m.frequency) text += ` (${m.frequency})`;
        text += `\n`;
      });
    }

    if (saved.notes) text += `\n📝 *Doctor's Advice:*\n${saved.notes}\n`;

    if (saved.followup && saved.followup !== 'No follow-up needed') {
      text += `\n🔁 *Follow-up:* ${saved.followup}\n`;
    }

    text += `\n— HealthFirst`;

    const url = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Open printable prescription in new window
  window._doPrescriptionPrint = function () {
    const data = _gatherPrescription();
    if (!data.patientName) { alert('⚠️ Please enter a patient name first.'); return; }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Prescription — ${escapeHtml(data.patientName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1F2F26; margin: 0; padding: 24px; background: white; }
  .clinic-header { border-bottom: 3px solid #3D5A4C; padding-bottom: 16px; margin-bottom: 22px; }
  .clinic-name { font-size: 30px; font-weight: 800; color: #3D5A4C; letter-spacing: 0.5px; }
  .clinic-sub { font-size: 13px; color: #888; margin-top: 2px; }
  .doctor-block { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; font-size: 13px; flex-wrap: wrap; gap: 10px; }
  .doctor-block .doc-name { font-weight: 700; font-size: 15px; }
  .doctor-block .doc-spec { color: #666; }
  .patient-block { background: #F5F1EA; padding: 12px 16px; border-radius: 8px; margin-bottom: 22px; font-size: 13px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .patient-block strong { color: #3D5A4C; }
  h3 { color: #3D5A4C; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; border-bottom: 1px solid #DDE5DB; padding-bottom: 5px; margin-top: 22px; margin-bottom: 10px; }
  .med-list { list-style: none; padding: 0; counter-reset: med; margin: 0; }
  .med-list li { padding: 9px 0 9px 30px; border-bottom: 1px dashed #DDE5DB; font-size: 14px; position: relative; counter-increment: med; }
  .med-list li::before { content: counter(med) "."; position: absolute; left: 0; font-weight: 700; color: #3D5A4C; }
  .med-name { font-weight: 700; }
  .med-detail { color: #666; font-size: 12px; margin-top: 2px; }
  .notes { font-size: 14px; line-height: 1.7; white-space: pre-wrap; color: #2D4438; }
  .footer { margin-top: 70px; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer .left { font-size: 11px; color: #888; }
  .sign-line { display: inline-block; border-top: 1px solid #1F2F26; padding-top: 6px; min-width: 220px; text-align: center; font-size: 12px; font-weight: 600; }
  .followup-tag { display: inline-block; background: #EEF1ED; color: #3D5A4C; padding: 8px 14px; border-radius: 6px; font-weight: 700; font-size: 13px; margin-top: 12px; }
  .rx-symbol { font-size: 22px; font-weight: 800; color: #3D5A4C; margin-right: 6px; }
  @media print { body { padding: 0; } button { display: none; } }
  .print-toolbar { position: fixed; top: 12px; right: 12px; }
  .print-toolbar button { padding: 8px 16px; background: #3D5A4C; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; font-family: Georgia, serif; }
</style></head><body>
<div class="print-toolbar"><button onclick="window.print()">🖨 Print Now</button></div>
<div class="clinic-header">
  <div class="clinic-name">HealthFirst</div>
  <div class="clinic-sub">Quality healthcare, when you need it</div>
  <div class="doctor-block">
    <div>
      <div class="doc-name">Dr. ${escapeHtml(data.doctorName) || '—'}</div>
      <div class="doc-spec">${escapeHtml(data.doctorSpecialty)}${data.doctorQualification ? ' · ' + escapeHtml(data.doctorQualification) : ''}</div>
    </div>
    <div style="text-align:right">
      <div><strong>Date:</strong> ${escapeHtml(data.date)}</div>
      ${data.token ? `<div><strong>Token:</strong> ${escapeHtml(data.token)}</div>` : ''}
    </div>
  </div>
</div>

<div class="patient-block">
  <div><strong>Patient:</strong> ${escapeHtml(data.patientName)}</div>
  ${data.age ? `<div><strong>Age:</strong> ${escapeHtml(data.age)} yrs</div>` : ''}
  ${data.gender ? `<div><strong>Gender:</strong> ${escapeHtml(data.gender)}</div>` : ''}
  ${data.patientPhone ? `<div><strong>Phone:</strong> ${escapeHtml(data.patientPhone)}</div>` : ''}
</div>

${data.diagnosis ? `<h3>Diagnosis</h3><div class="notes">${escapeHtml(data.diagnosis)}</div>` : ''}

${data.medicines.length > 0 ? `
<h3><span class="rx-symbol">℞</span> Medicines</h3>
<ol class="med-list">
  ${data.medicines.map(m => `
    <li>
      <div class="med-name">${escapeHtml(m.name)}</div>
      <div class="med-detail">${escapeHtml(m.dose || '')}${m.dose && m.frequency ? ' · ' : ''}${escapeHtml(m.frequency || '')}</div>
    </li>
  `).join('')}
</ol>` : ''}

${data.notes ? `<h3>Doctor's Advice</h3><div class="notes">${escapeHtml(data.notes)}</div>` : ''}

${data.followup && data.followup !== 'No follow-up needed' ? `<div class="followup-tag">🔁 Next follow-up in: ${escapeHtml(data.followup)}</div>` : ''}

<div class="footer">
  <div class="left">Generated by HealthFirst · ${escapeHtml(data.date)}</div>
  <div class="sign-line">Doctor's Signature</div>
</div>

<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) {
      alert('⚠️ Your browser blocked the print pop-up. Please allow pop-ups for this site and try again.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const fbParam = getParam("feedback");
  if (fbParam) document.getElementById("fbModal") && document.getElementById("fbModal").classList.add("open");

  /* ─── Schedule editor ─── */
  let currentScheduleData = { weeklyPattern: defaultWeeklyPattern(), blockedDates: [] };
  let currentScheduleDoctorId = null;

  document.addEventListener("doctor-ready", initScheduleEditor);

  async function initScheduleEditor() {
    const me = window._currentDoctor || {};
    const isAdmin = (me.email === ADMIN_EMAIL);
    if (isAdmin) {
      // Admin viewing doctor.html — show a doctor picker for schedule management
      document.getElementById("scheduleEditor").innerHTML = `
        <div style="background:var(--amber-l);padding:14px;border-radius:var(--r-lg);font-size:13px;color:#92400E;margin-bottom:14px">
          <strong>🛡️ Admin view.</strong> You're viewing as admin. Switch doctor below to manage their schedule.
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:13px;font-weight:600;color:var(--navy-s);margin-bottom:6px;display:block">Select doctor to manage:</label>
          <select id="adminDocPicker" onchange="adminLoadDocSchedule()" style="width:100%;padding:10px 12px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:14px;background:var(--bg);outline:none">
            <option value="">— Select a doctor —</option>
          </select>
        </div>
        <div id="horizonPickerWrap" style="display:none;background:var(--white);border:1px solid var(--border);border-left:3px solid var(--teal);border-radius:var(--r-lg);padding:14px 18px;margin-bottom:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <div style="font-weight:700;color:var(--navy);font-size:14px;margin-bottom:3px">📆 How far ahead can patients book?</div>
              <div style="font-size:12px;color:var(--navy-m);line-height:1.5">Choose how many days into the future patients see in the booking page.</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap" id="horizonPicker"></div>
          </div>
        </div>
        <div id="scheduleGrid"></div>
      `;
      const doctors = await loadDoctors({ includeUnavailable: true });
      const picker = document.getElementById("adminDocPicker");
      doctors.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = `${d.name} — ${d.specialty || ""}${d.city ? " · " + d.city : ""}`;
        picker.appendChild(opt);
      });
    } else if (me.id) {
      currentScheduleDoctorId = me.id;
      currentScheduleData = await loadDoctorSchedule(me.id);
      document.getElementById("scheduleEditor").innerHTML = `
        <!-- Booking horizon control -->
        <div style="background:var(--white);border:1px solid var(--border);border-left:3px solid var(--teal);border-radius:var(--r-lg);padding:14px 18px;margin-bottom:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <div style="font-weight:700;color:var(--navy);font-size:14px;margin-bottom:3px">📆 How far ahead can patients book?</div>
              <div style="font-size:12px;color:var(--navy-m);line-height:1.5">Choose how many days into the future patients see in your booking page.</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap" id="horizonPicker"></div>
          </div>
        </div>
        <div id="scheduleGrid"></div>
      `;
      renderHorizonPicker();
      renderScheduleGrid();
      renderBlockedDatesList();
    } else {
      document.getElementById("scheduleEditor").innerHTML = '<div style="text-align:center;color:var(--navy-m);padding:24px">Could not load your schedule. Please refresh.</div>';
    }
  }

  window.adminLoadDocSchedule = async function () {
    const docId = document.getElementById("adminDocPicker").value;
    const wrap = document.getElementById("horizonPickerWrap");
    if (!docId) {
      document.getElementById("scheduleGrid").innerHTML = "";
      document.getElementById("blockedDatesList").innerHTML = "";
      if (wrap) wrap.style.display = "none";
      currentScheduleDoctorId = null;
      return;
    }
    currentScheduleDoctorId = docId;
    currentScheduleData = await loadDoctorSchedule(docId);
    if (wrap) wrap.style.display = "block";
    renderHorizonPicker();
    renderScheduleGrid();
    renderBlockedDatesList();
  };

  // Renders the 7 / 14 / 30 day picker pills (clicking updates currentScheduleData.bookingHorizonDays)
  function renderHorizonPicker() {
    const wrap = document.getElementById("horizonPicker");
    if (!wrap) return;
    const options = [
      { days: 7, label: "7 days", sub: "1 week" },
      { days: 14, label: "14 days", sub: "2 weeks" },
      { days: 30, label: "30 days", sub: "1 month" }
    ];
    const current = currentScheduleData.bookingHorizonDays || 7;
    wrap.innerHTML = options.map(o => {
      const active = o.days === current;
      return `<button onclick="setBookingHorizon(${o.days})" style="padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--ff);transition:all .15s;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:80px;${active ? 'background:var(--teal);color:var(--cream);border:1.5px solid var(--teal)' : 'background:white;color:var(--navy-s);border:1.5px solid var(--border-md)'}">
        <span style="font-size:14px">${o.label}</span>
        <span style="font-size:10px;opacity:.8;font-weight:500">${o.sub}</span>
      </button>`;
    }).join("");
  }

  window.setBookingHorizon = function (days) {
    if (![7, 14, 30].includes(days)) return;
    currentScheduleData.bookingHorizonDays = days;
    renderHorizonPicker();
  };

  function renderScheduleGrid() {
    const grid = document.getElementById("scheduleGrid");
    if (!grid) return;
    const slotLengths = [10, 15, 20, 30, 45, 60];
    const dayNamesFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // Build list of next 7 days starting from today, ordered chronologically.
    // Each entry: { num: "0"-"6", name, date, dateLabel }
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const weekdayNum = d.getDay();
      const dayMonth = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const fullDate = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      let relative = "";
      if (sameDay(d, today)) relative = "Today";
      else if (sameDay(d, tomorrow)) relative = "Tomorrow";
      days.push({
        num: String(weekdayNum),
        name: dayNamesFull[weekdayNum],
        dayMonth: dayMonth,
        fullDate: fullDate,
        relative: relative,
        date: d
      });
    }

    // Normalize legacy data → new schema if needed (only need to do this once per weekday)
    ["0","1","2","3","4","5","6"].forEach(n => {
      const v = currentScheduleData.weeklyPattern[n];
      if (Array.isArray(v)) {
        currentScheduleData.weeklyPattern[n] = {
          isOff: v.length === 0,
          workingStart: "09:00",
          workingEnd: "13:00",
          slotLength: 30,
          excludedSlots: []
        };
      } else if (!v || typeof v !== "object") {
        currentScheduleData.weeklyPattern[n] = { isOff: true, workingStart: "09:00", workingEnd: "13:00", slotLength: 30, excludedSlots: [] };
      } else {
        if (v.workingStart === undefined) v.workingStart = "09:00";
        if (v.workingEnd === undefined) v.workingEnd = "13:00";
        if (v.slotLength === undefined) v.slotLength = 30;
        if (v.excludedSlots === undefined) v.excludedSlots = [];
        if (v.isOff === undefined) v.isOff = false;
      }
    });

    grid.innerHTML = days.map(d => {
      const day = currentScheduleData.weeklyPattern[d.num];
      const isOff = !!day.isOff;
      const activeSlots = getActiveSlotsForDay(day);
      const allGenerated = generateSlotsFromWindow(day.workingStart, day.workingEnd, day.slotLength);
      const excluded = new Set(day.excludedSlots || []);

      // Check if this specific date is in blockedDates (one-time leave)
      const dateISO = d.date.toISOString().split("T")[0];
      const isBlockedDate = (currentScheduleData.blockedDates || []).includes(dateISO);

      const slotPills = allGenerated.length === 0
        ? `<div style="font-size:12px;color:var(--red);padding:8px 0">⚠️ End time must be after start time (with room for at least one slot).</div>`
        : allGenerated.map(s => {
            const isActive = !excluded.has(s);
            return `<button onclick="toggleDaySlot('${d.num}','${s.replace(/'/g, "\\'")}')" style="padding:7px 14px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--ff);transition:all .15s;white-space:nowrap;${isActive ? 'background:var(--teal);color:var(--cream);border:1.5px solid var(--teal)' : 'background:white;color:var(--navy-h);border:1.5px solid var(--border-md);text-decoration:line-through'}">${s}</button>`;
          }).join("");

      // Highlight today's card with a subtle teal border
      const todayHighlight = d.relative === "Today" ? "border:2px solid var(--teal);box-shadow:0 2px 12px rgba(61,90,76,0.08)" : "border:1px solid var(--border)";

      return `
        <div style="margin-bottom:14px;background:var(--white);border-radius:var(--r-lg);padding:18px;${todayHighlight};${isOff || isBlockedDate ? 'opacity:0.65' : ''}">
          <!-- Date header (date primary, weekday secondary) -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
              <div style="font-family:var(--ff-d);font-size:20px;font-weight:700;color:var(--navy);letter-spacing:-0.01em">${d.dayMonth}</div>
              <div style="font-size:13px;color:var(--navy-m);font-weight:600">${d.name}${d.relative ? ` · <span style="color:var(--teal);font-weight:700">${d.relative}</span>` : ''}</div>
              ${isBlockedDate
                ? '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:#FEE2E2;color:#991B1B">🚫 Blocked date</span>'
                : isOff
                  ? '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:#FEF3C7;color:#92400E">Day off</span>'
                  : `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:var(--teal-l);color:var(--teal-d)">${activeSlots.length} slot${activeSlots.length === 1 ? "" : "s"}</span>`
              }
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--navy-m);cursor:pointer;font-weight:600">
              <input type="checkbox" ${isOff ? "checked" : ""} onchange="setDayOff('${d.num}', this.checked)" style="width:16px;height:16px;accent-color:var(--teal);cursor:pointer">
              <span>Day off</span>
            </label>
          </div>

          ${isOff ? '' : `
          <!-- Working hours + slot length -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
            <div>
              <label style="display:block;font-size:10px;font-weight:700;color:var(--navy-m);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">From</label>
              <input type="time" value="${day.workingStart}" onchange="setDayHours('${d.num}','start',this.value)" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:14px;background:var(--bg);outline:none">
            </div>
            <div>
              <label style="display:block;font-size:10px;font-weight:700;color:var(--navy-m);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">To</label>
              <input type="time" value="${day.workingEnd}" onchange="setDayHours('${d.num}','end',this.value)" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:14px;background:var(--bg);outline:none">
            </div>
            <div>
              <label style="display:block;font-size:10px;font-weight:700;color:var(--navy-m);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Visit length</label>
              <select onchange="setDaySlotLength('${d.num}', this.value)" style="width:100%;padding:8px 10px;border:1.5px solid var(--border-md);border-radius:var(--r);font-family:var(--ff);font-size:14px;background:var(--bg);outline:none">
                ${slotLengths.map(m => `<option value="${m}" ${day.slotLength === m ? "selected" : ""}>${m} min</option>`).join("")}
              </select>
            </div>
          </div>

          <!-- Generated slot pills -->
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${slotPills}</div>

          ${allGenerated.length > 0 ? `
            <div style="display:flex;gap:8px;font-size:11px">
              <button onclick="setAllDaySlots('${d.num}', true)" style="padding:5px 11px;background:transparent;border:1px solid var(--teal);color:var(--teal-d);border-radius:6px;font-weight:600;cursor:pointer;font-family:var(--ff)">✓ Enable all</button>
              <button onclick="setAllDaySlots('${d.num}', false)" style="padding:5px 11px;background:transparent;border:1px solid var(--border-md);color:var(--navy-h);border-radius:6px;font-weight:600;cursor:pointer;font-family:var(--ff)">✗ Disable all</button>
            </div>
          ` : ""}
          `}
        </div>
      `;
    }).join("");
  }

  /* ── Editor handlers ── */
  function ensureDayObject(dayNum) {
    let v = currentScheduleData.weeklyPattern[dayNum];
    if (Array.isArray(v) || !v || typeof v !== "object") {
      currentScheduleData.weeklyPattern[dayNum] = {
        isOff: Array.isArray(v) ? v.length === 0 : true,
        workingStart: "09:00", workingEnd: "13:00", slotLength: 30, excludedSlots: []
      };
    }
    return currentScheduleData.weeklyPattern[dayNum];
  }

  window.setDayOff = function (dayNum, isOff) {
    const day = ensureDayObject(dayNum);
    day.isOff = !!isOff;
    renderScheduleGrid();
  };

  window.setDayHours = function (dayNum, which, value) {
    const day = ensureDayObject(dayNum);
    if (which === "start") day.workingStart = value;
    else if (which === "end") day.workingEnd = value;
    // Drop excluded slots that are no longer in the generated range
    const newRange = new Set(generateSlotsFromWindow(day.workingStart, day.workingEnd, day.slotLength));
    day.excludedSlots = (day.excludedSlots || []).filter(s => newRange.has(s));
    renderScheduleGrid();
  };

  window.setDaySlotLength = function (dayNum, mins) {
    const day = ensureDayObject(dayNum);
    day.slotLength = parseInt(mins) || 30;
    // Slot labels change when length changes — clear exclusions
    day.excludedSlots = [];
    renderScheduleGrid();
  };

  window.toggleDaySlot = function (dayNum, slotLabel) {
    const day = ensureDayObject(dayNum);
    if (!day.excludedSlots) day.excludedSlots = [];
    const idx = day.excludedSlots.indexOf(slotLabel);
    if (idx === -1) day.excludedSlots.push(slotLabel);
    else day.excludedSlots.splice(idx, 1);
    renderScheduleGrid();
  };

  window.setAllDaySlots = function (dayNum, enableAll) {
    const day = ensureDayObject(dayNum);
    if (enableAll) {
      day.excludedSlots = [];
    } else {
      day.excludedSlots = generateSlotsFromWindow(day.workingStart, day.workingEnd, day.slotLength);
    }
    renderScheduleGrid();
  };

  // Legacy aliases (in case anything else calls them)
  window.toggleSlot = window.toggleDaySlot;
  window.toggleAllSlots = window.setAllDaySlots;

  function renderBlockedDatesList() {
    const list = document.getElementById("blockedDatesList");
    if (!list) return;
    const dates = (currentScheduleData.blockedDates || []).sort();
    if (dates.length === 0) {
      list.innerHTML = `<div style="font-size:12px;color:var(--navy-h);font-style:italic">No blocked dates yet.</div>`;
      return;
    }
    list.innerHTML = dates.map(d => {
      const dateObj = new Date(d);
      const display = dateObj.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      return `<div style="display:inline-flex;align-items:center;gap:8px;background:var(--red-l);color:#991B1B;padding:6px 12px;border-radius:14px;font-size:12px;font-weight:600;margin:0 6px 6px 0">🚫 ${display} <button onclick="removeBlockedDate('${d}')" style="background:none;border:none;color:#991B1B;cursor:pointer;font-size:16px;line-height:1;padding:0;font-weight:700">×</button></div>`;
    }).join("");
  }

  window.addBlockedDate = function () {
    const inp = document.getElementById("newBlockedDate");
    const val = inp?.value;
    if (!val) { alert("Please pick a date."); return; }
    if (!currentScheduleData.blockedDates) currentScheduleData.blockedDates = [];
    if (currentScheduleData.blockedDates.includes(val)) { alert("That date is already blocked."); return; }
    currentScheduleData.blockedDates.push(val);
    inp.value = "";
    renderBlockedDatesList();
  };

  window.removeBlockedDate = function (dateStr) {
    currentScheduleData.blockedDates = (currentScheduleData.blockedDates || []).filter(d => d !== dateStr);
    renderBlockedDatesList();
  };

  window.saveMySchedule = async function () {
    if (!currentScheduleDoctorId) { alert("No doctor selected."); return; }
    const btn = document.getElementById("saveScheduleBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
    const ok = await saveDoctorSchedule(currentScheduleDoctorId, currentScheduleData);
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save Schedule"; }
    if (ok) {
      // Refresh the dashboard so Today's Timeline and Today's Schedule reflect the new pattern
      try { if (typeof loadTodayQueue === "function") await loadTodayQueue(); } catch (e) { console.warn(e); }
      alert("✅ Schedule saved! Today's Timeline and your booking page are now updated.");
    } else {
      alert("❌ Failed to save. Please try again.");
    }
  };
}

/* ═══════════════════════════════════
   ADMIN PANEL — bookings + doctor management + applications
═══════════════════════════════════ */
if (document.getElementById("recentBookingsTable") || document.getElementById("docManageList")) {
  document.addEventListener("admin-ready", loadAdminData);

  async function loadAdminData() {
    const bookings = await loadBookings();
    const reviews = await loadReviews();
    const doctors = await loadDoctors({ includeUnavailable: true });
    const applications = await loadDoctorApplications();
    window._adminAllBookings = bookings; // cache for filtering
    window._adminAllDoctors = doctors;
    window._allDoctors = doctors; // also cache for billing module

    renderAdminBookings(bookings);

    // Wire up admin filters & notifications
    if (typeof window.populateDoctorFilterDropdown === 'function') window.populateDoctorFilterDropdown();
    if (typeof window.refreshAdminNotifications === 'function') window.refreshAdminNotifications(applications);

    // Render billing dashboard
    if (typeof window.renderAdminBilling === 'function') window.renderAdminBilling();

    const docList = document.getElementById("docManageList");
    if (docList) {
      docList.innerHTML = doctors.length === 0
        ? `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No doctors added yet. Use the form below to add your first doctor.</div>`
        : doctors.map(d => `
            <div class="appt-item">
              <div class="ai-token" style="background:var(--teal-l);color:var(--teal-d);font-size:18px;${d.photoUrl ? 'padding:0;overflow:hidden' : ''}">${d.photoUrl ? `<img src="${escapeHtml(d.photoUrl)}" alt="${escapeHtml(d.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : escapeHtml(d.avatar||"👨‍⚕️")}</div>
              <div class="ai-info">
                <div class="ai-name">${escapeHtml(d.name)}${d.available === false ? ' <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:#FEF3C7;color:#92400E;margin-left:6px">OFFLINE</span>' : ''}</div>
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
            const status = a.status || "pending";
            const statusClass = status === "approved" ? "sb-done" : (status === "rejected" ? "sb-cancelled" : "sb-waiting");
            const isPending = status === "pending";

            return `
            <div class="appt-item" style="flex-wrap:wrap;align-items:flex-start;${!isPending ? 'opacity:0.7' : ''}">
              <div class="ai-token" style="background:var(--amber-l);color:var(--amber);font-size:14px">${escapeHtml((a.name||"??").slice(0,2).toUpperCase())}</div>
              <div class="ai-info">
                <div class="ai-name">${escapeHtml(a.name)} · ${escapeHtml(a.specialty||"")}${a.consultationFee ? " · ₹" + escapeHtml(a.consultationFee) : ""}</div>
                <div class="ai-detail">📞 ${escapeHtml(a.phone||"")}${a.clinicPhone ? " · 🏥 " + escapeHtml(a.clinicPhone) : ""} · ✉️ ${escapeHtml(a.email||"")}</div>
                <div class="ai-detail" style="margin-top:3px">${location ? "📍 " + location : ""}${a.clinicAddress ? " — " + escapeHtml(a.clinicAddress) : ""}</div>
                <div class="ai-detail" style="margin-top:3px">🎓 ${escapeHtml(a.qualification||"—")}${a.experience ? " · " + escapeHtml(a.experience) + " yrs exp" : ""} · 💳 ${pricingLabel}</div>
                ${a.message ? `<div class="ai-detail" style="font-style:italic;margin-top:6px;padding:8px 10px;background:var(--bg);border-radius:var(--r);border-left:3px solid var(--teal)">"${escapeHtml(a.message)}"</div>` : ""}
                ${certs.length > 0 ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${certs.map(c => `<a href="${c.base64}" download="${escapeHtml(c.name)}" style="font-size:11px;color:var(--teal-d);font-weight:600;padding:4px 10px;background:var(--teal-l);border-radius:14px;text-decoration:none;border:1px solid var(--teal-ll)" title="Click to download">📎 ${escapeHtml(c.name)} <span style="opacity:.6">${(c.size/1024).toFixed(0)}KB</span></a>`).join("")}</div>` : `<div style="margin-top:6px;font-size:11px;color:var(--navy-h);font-style:italic">No certificates uploaded</div>`}
                ${isPending ? `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                  <button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="approveApplication('${a.id}')">✓ Approve & Add as Doctor</button>
                  <button class="ai-btn cancel" style="font-size:12px;padding:7px 14px" onclick="rejectApplication('${a.id}')">✗ Reject</button>
                </div>` : ""}
              </div>
              <span class="status-badge ${statusClass}">${escapeHtml(status)}</span>
            </div>`;
          }).join("");

      const appCountEl = document.getElementById("appCount");
      if (appCountEl) appCountEl.textContent = applications.filter(a => (a.status || "pending") === "pending").length;
    }

    const thisMonth = bookings.filter(b => {
      if (!b.date) return false;
      const d = new Date(b.date); const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const onlineRevenue = thisMonth.filter(b => b.paymentMethod === "paid_online").reduce((s, b) => s + (parseInt(b.fee) || 0), 0);
    const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 5), 0) / reviews.length).toFixed(1) : "—";

    // ─── NEW action-focused KPIs ───
    const todayStr = new Date().toISOString().split("T")[0];
    const todayBookings = bookings.filter(b => b.date === todayStr && b.status !== "cancelled");
    const pendingApps = applications.filter(a => (a.status || "pending") === "pending");

    // Cancellations in last 7 days
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cancelsThisWeek = bookings.filter(b => {
      if (b.status !== "cancelled" || !b.date) return false;
      const d = new Date(b.date);
      return d >= sevenDaysAgo;
    });

    const el = id => document.getElementById(id);
    if (el("adminPendingApps")) el("adminPendingApps").textContent = pendingApps.length;
    if (el("adminPendingDelta")) {
      el("adminPendingDelta").textContent = pendingApps.length > 0 ? "🔴 Tap to review" : "✓ All caught up";
      el("adminPendingDelta").style.color = pendingApps.length > 0 ? "var(--red)" : "var(--green)";
    }
    if (el("adminTodayBookings")) el("adminTodayBookings").textContent = todayBookings.length;
    if (el("adminTodayDelta")) {
      const done = todayBookings.filter(b => b.status === "done").length;
      el("adminTodayDelta").textContent = `${done} completed so far`;
    }
    if (el("adminRevenue")) el("adminRevenue").textContent = "₹" + onlineRevenue.toLocaleString("hi-IN");
    if (el("adminCancelsWeek")) el("adminCancelsWeek").textContent = cancelsThisWeek.length;
    if (el("adminCancelDelta")) el("adminCancelDelta").textContent = cancelsThisWeek.length === 0 ? "🎉 Zero this week" : "Last 7 days";
    // Backward-compat (some older code may still reference these IDs)
    if (el("adminTotalBookings")) el("adminTotalBookings").textContent = thisMonth.length;
    if (el("adminAvgRating")) el("adminAvgRating").textContent = avgRating;
    if (el("adminDocCount")) el("adminDocCount").textContent = doctors.length;
    if (el("adminTotalAll")) el("adminTotalAll").textContent = bookings.length;

    // ─── Top Earning Doctors (this month, completed bookings only) ───
    renderTopEarners(thisMonth, doctors);
  }

  function renderTopEarners(thisMonthBookings, doctors) {
    const wrap = document.getElementById("topEarnersList");
    if (!wrap) return;

    // Aggregate completed-visit fees per doctor
    const earnings = {};
    thisMonthBookings
      .filter(b => b.status === "done")
      .forEach(b => {
        const key = b.doctor || "—";
        if (!earnings[key]) earnings[key] = { name: key, revenue: 0, visits: 0, specialty: b.specialty || "" };
        earnings[key].revenue += parseInt(b.fee) || 0;
        earnings[key].visits += 1;
      });

    const ranked = Object.values(earnings)
      .filter(e => e.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    if (ranked.length === 0) {
      wrap.innerHTML = `<div style="text-align:center;color:var(--navy-m);font-size:13px;padding:20px">No completed visits this month yet.<br><span style="font-size:11px;color:var(--navy-h)">Earnings appear here once doctors start marking appointments as Done.</span></div>`;
      return;
    }

    const maxRevenue = ranked[0].revenue;
    const medals = ["🥇", "🥈", "🥉", "4.", "5."];

    wrap.innerHTML = ranked.map((e, i) => {
      const pct = Math.max(8, (e.revenue / maxRevenue) * 100);
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i < ranked.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
          <div style="font-size:18px;width:30px;text-align:center;flex-shrink:0">${medals[i]}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:4px">
              <div style="font-weight:700;color:var(--navy);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.name)}</div>
              <div style="font-weight:800;color:var(--teal-d);font-size:14px;font-variant-numeric:tabular-nums;flex-shrink:0">₹${e.revenue.toLocaleString("en-IN")}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:6px;background:var(--teal-l);border-radius:3px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--teal),var(--teal-d));border-radius:3px"></div>
              </div>
              <div style="font-size:11px;color:var(--navy-m);font-weight:600;white-space:nowrap">${e.visits} visit${e.visits===1?'':'s'}</div>
            </div>
          </div>
        </div>`;
    }).join("");
    if (el("adminAvgRating")) el("adminAvgRating").textContent = avgRating + " ★ (" + reviews.length + " reviews)";
    if (el("adminDocCount")) el("adminDocCount").textContent = doctors.length;
  }

  window.adminAddDoctor = async function () {
    const get = id => document.getElementById(id)?.value.trim();
    const specialty = get("ndSpecialty");
    const pricingEl = document.querySelector('input[name="ndPricingModel"]:checked');

    const data = {
      name: get("ndName"),
      email: (get("ndEmail") || "").toLowerCase(),
      phone: get("ndPhone"),
      clinicPhone: get("ndClinicPhone"),
      fee: parseInt(get("ndFee")) || 0,
      specialty: specialty,
      specialtyCategory: mapSpecialtyToKey(specialty),
      qualification: get("ndQual"),
      experience: get("ndExp") ? (get("ndExp") + " years experience") : "",
      state: get("ndState"),
      city: get("ndCity"),
      clinicAddress: get("ndClinicAddress"),
      pricingModel: pricingEl ? pricingEl.value : "subscription",
      avatar: get("ndAvatar") || "👨‍⚕️"
    };

    // Required field validation — matches the application form's required fields
    const required = [
      ["name", "Doctor Name", "ndName"],
      ["email", "Doctor's Login Email", "ndEmail"],
      ["phone", "Personal Phone / WhatsApp", "ndPhone"],
      ["clinicPhone", "Clinic Phone Number", "ndClinicPhone"],
      ["fee", "Consultation Fee", "ndFee"],
      ["specialty", "Specialty", "ndSpecialty"],
      ["qualification", "Qualification", "ndQual"],
      ["state", "State", "ndState"],
      ["city", "City", "ndCity"],
      ["clinicAddress", "Clinic Name / Address", "ndClinicAddress"]
    ];
    for (const [field, label, elId] of required) {
      if (!data[field]) {
        alert(`Please fill in: ${label}`);
        document.getElementById(elId)?.focus();
        return;
      }
    }
    if (!data.email.includes("@") || !data.email.includes(".")) {
      alert("Please enter a valid email address.");
      document.getElementById("ndEmail")?.focus();
      return;
    }

    // Check duplicate
    const existing = await loadDoctorByEmail(data.email);
    if (existing) {
      alert(`⚠️ A doctor with email ${data.email} already exists on the platform.`);
      return;
    }

    const id = await saveDoctor(data);
    if (id) {
      alert(`✅ Dr. ${data.name} added.\n\n⚠️ NEXT STEP: Go to Firebase Console → Authentication → Add user → create login for ${data.email}, then share the password with the doctor on WhatsApp.`);
      ["ndName","ndEmail","ndPhone","ndClinicPhone","ndSpecialty","ndQual","ndExp","ndFee","ndCity","ndState","ndClinicAddress","ndAvatar"].forEach(f => {
        const el = document.getElementById(f); if (el) el.value = "";
      });
      const subRadio = document.querySelector('input[name="ndPricingModel"][value="subscription"]');
      if (subRadio) subRadio.checked = true;
      loadAdminData();
    } else {
      alert("❌ Failed to add doctor. Please try again.");
    }
  };

  /* Approve doctor application — auto-creates a doctor record from the application */
  window.approveApplication = async function (appId) {
    const apps = await loadDoctorApplications();
    const app = apps.find(a => a.id === appId);
    if (!app) { alert("Application not found."); return; }
    if (app.status && app.status !== "pending") {
      if (!confirm(`This application is already "${app.status}". Re-process anyway?`)) return;
    }

    if (!app.email || !app.consultationFee) {
      alert("⚠️ This application is missing required fields (email or consultation fee). Cannot auto-approve. Use the manual 'Add Doctor' form instead.");
      return;
    }

    // Check for duplicate email in doctors list
    const existing = await loadDoctorByEmail((app.email || "").toLowerCase());
    if (existing) {
      alert(`⚠️ A doctor with email ${app.email} already exists on the platform. Cannot add duplicate.`);
      return;
    }

    if (!confirm(`✓ Approve and add Dr. ${app.name} to the platform?\n\nThey will appear on the public site immediately.\n\nDon't forget to also create their Firebase Auth login afterward.`)) return;

    const doctorData = {
      name: app.name,
      email: (app.email || "").toLowerCase(),
      phone: app.phone || "",
      clinicPhone: app.clinicPhone || "",
      specialty: app.specialty,
      specialtyCategory: mapSpecialtyToKey(app.specialty),
      qualification: app.qualification || "",
      experience: app.experience ? (app.experience + " years experience") : "",
      fee: parseInt(app.consultationFee) || 0,
      state: app.state || "",
      city: app.city || "",
      clinicAddress: app.clinicAddress || "",
      pricingModel: app.pricingModel || "subscription",
      avatar: "👨‍⚕️"
    };

    const doctorId = await saveDoctor(doctorData);
    if (!doctorId) { alert("❌ Failed to add doctor. Please try again."); return; }

    // Mark application as approved
    try {
      const { doc, updateDoc } = window._fs;
      await updateDoc(doc(db, "doctorApplications", appId), {
        status: "approved",
        approvedAt: window._fs.serverTimestamp(),
        doctorId: doctorId
      });
    } catch (e) { console.error("Could not update application status:", e); }

    alert(`✅ Dr. ${app.name} is now live on the platform!\n\n⚠️ FINAL STEP: Go to Firebase Console → Authentication → Add user → create login for:\n\n📧 ${app.email}\n🔐 (pick any temporary password)\n\nThen WhatsApp the doctor their login on ${app.phone}.`);
    loadAdminData();
  };

  window.rejectApplication = async function (appId) {
    if (!confirm("Reject this application?\n\nThe applicant will not be notified automatically — you should send them a message separately.")) return;
    try {
      const { doc, updateDoc } = window._fs;
      await updateDoc(doc(db, "doctorApplications", appId), {
        status: "rejected",
        rejectedAt: window._fs.serverTimestamp()
      });
    } catch (e) { console.error("Could not reject:", e); alert("❌ Failed to update application."); return; }
    loadAdminData();
  };

  /* Render bookings list with optional filter */
  function renderAdminBookings(bookings) {
    const table = document.getElementById("recentBookingsTable");
    if (!table) return;
    if (bookings.length === 0) {
      table.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No bookings match.</div>`;
      return;
    }
    table.innerHTML = bookings.slice(0, 50).map(b => `
      <div class="appt-item">
        <div class="ai-token" style="font-size:11px;background:var(--blue-l);color:var(--blue);width:36px;height:36px">${escapeHtml((b.patientName||"??").slice(0,2).toUpperCase())}</div>
        <div class="ai-info">
          <div class="ai-name">${escapeHtml(b.patientName)} → ${escapeHtml(b.doctor)}</div>
          <div class="ai-detail">📞 ${escapeHtml(b.phone||"—")} · ${escapeHtml(b.specialty)} · ${escapeHtml(b.dateDisplay)} · ${escapeHtml(b.slot)} · ₹${escapeHtml(b.fee)} · Token ${escapeHtml(b.token)}
            &nbsp;<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px;${b.paymentMethod==="paid_online"?"background:#ECFDF5;color:#065F46":"background:#FFF3E0;color:#E65100"}">${b.paymentMethod==="paid_online"?"✅ Paid":"🏥 Clinic"}</span>
          </div>
        </div>
        <span class="status-badge ${b.status==="done"?"sb-done":b.status==="cancelled"?"sb-cancelled":"sb-waiting"}">${escapeHtml(b.status)}</span>
      </div>`).join("");
  }

  /* Patient phone/name search */
  window.searchPatientBookings = function () {
    // Kept for backward compat — now routes through unified filter
    applyBookingFilters();
  };

  /* ─── Admin: live filter for Manage Doctors list ─── */
  window.filterAdminDoctors = function () {
    const q = (document.getElementById("doctorSearchInput")?.value || "").trim().toLowerCase();
    const all = window._adminAllDoctors || [];
    const docList = document.getElementById("docManageList");
    if (!docList) return;
    const filtered = !q ? all : all.filter(d =>
      (d.name || "").toLowerCase().includes(q) ||
      (d.specialty || "").toLowerCase().includes(q) ||
      (d.city || "").toLowerCase().includes(q) ||
      (d.state || "").toLowerCase().includes(q) ||
      (d.email || "").toLowerCase().includes(q) ||
      (d.qualification || "").toLowerCase().includes(q)
    );
    if (filtered.length === 0) {
      docList.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">No doctors match "${escapeHtml(q)}".</div>`;
      return;
    }
    docList.innerHTML = filtered.map(d => `
      <div class="appt-item">
        <div class="ai-token" style="background:var(--teal-l);color:var(--teal-d);font-size:18px;${d.photoUrl ? 'padding:0;overflow:hidden' : ''}">${d.photoUrl ? `<img src="${escapeHtml(d.photoUrl)}" alt="${escapeHtml(d.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : escapeHtml(d.avatar||"👨‍⚕️")}</div>
        <div class="ai-info">
          <div class="ai-name">${escapeHtml(d.name)}${d.available === false ? ' <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:#FEF3C7;color:#92400E;margin-left:6px">OFFLINE</span>' : ''}</div>
          <div class="ai-detail">${escapeHtml(d.specialty)} · ${escapeHtml(d.qualification||"")} · ₹${escapeHtml(d.fee)}${d.city ? " · " + escapeHtml(d.city) : ""}</div>
          <div class="ai-detail" style="margin-top:3px;font-size:11px">${d.email ? "🔑 " + escapeHtml(d.email) : "<span style='color:var(--amber)'>⚠️ No login email — add one</span>"}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          ${d.email ? `<button class="ai-btn" style="background:var(--teal-l);color:var(--teal-d);border:1px solid var(--teal);font-size:11px;padding:5px 10px;font-weight:700;white-space:nowrap" onclick="adminResetDoctorPassword('${escapeHtml(d.email).replace(/'/g, "\\'")}','${escapeHtml(d.name).replace(/'/g, "\\'")}')">🔑 Reset Password</button>` : ""}
          <button class="ai-btn cancel" onclick="removeDoctorAdmin('${d.id}','${escapeHtml(d.name).replace(/'/g, "\\'")}')">Remove</button>
        </div>
      </div>`).join("");
  };

  /* ─── Admin: combined booking filter (search + doctor + status + date) ─── */
  window.applyBookingFilters = function () {
    const all = window._adminAllBookings || [];
    const q = (document.getElementById("patientSearchInput")?.value || "").trim().toLowerCase();
    const doctorFilter = document.getElementById("filterDoctor")?.value || "";
    const statusFilter = document.getElementById("filterStatus")?.value || "";
    const dateFilter = document.getElementById("filterDate")?.value || "";

    let result = all;

    if (q) {
      result = result.filter(b =>
        (b.phone || "").toLowerCase().includes(q) ||
        (b.patientName || "").toLowerCase().includes(q) ||
        (b.token || "").toLowerCase().includes(q)
      );
    }
    if (doctorFilter) result = result.filter(b => b.doctor === doctorFilter);
    if (statusFilter) result = result.filter(b => b.status === statusFilter);

    if (dateFilter) {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
      const weekFromNow = new Date(now); weekFromNow.setDate(now.getDate() + 7);

      if (dateFilter === "today") result = result.filter(b => b.date === todayStr);
      else if (dateFilter === "tomorrow") result = result.filter(b => b.date === tomorrowStr);
      else if (dateFilter === "week") result = result.filter(b => {
        if (!b.date) return false;
        const d = new Date(b.date);
        return d >= now && d <= weekFromNow;
      });
      else if (dateFilter === "month") result = result.filter(b => {
        if (!b.date) return false;
        const d = new Date(b.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }

    renderAdminBookings(result);

    // Update count badge
    const cntEl = document.getElementById("bookingCount");
    if (cntEl) {
      const hasFilter = q || doctorFilter || statusFilter || dateFilter;
      cntEl.textContent = hasFilter ? `${result.length} of ${all.length}` : "Live feed";
    }
  };

  /* Clear all booking filters */
  window.clearBookingFilters = function () {
    const i = document.getElementById("patientSearchInput"); if (i) i.value = "";
    const fd = document.getElementById("filterDoctor"); if (fd) fd.value = "";
    const fs = document.getElementById("filterStatus"); if (fs) fs.value = "";
    const ft = document.getElementById("filterDate"); if (ft) ft.value = "";
    applyBookingFilters();
  };

  /* Export currently filtered bookings to CSV file */
  window.exportBookingsCSV = function () {
    const all = window._adminAllBookings || [];

    // Re-compute the same filter logic so the export matches what's on screen
    const q = (document.getElementById("patientSearchInput")?.value || "").trim().toLowerCase();
    const doctorFilter = document.getElementById("filterDoctor")?.value || "";
    const statusFilter = document.getElementById("filterStatus")?.value || "";
    const dateFilter = document.getElementById("filterDate")?.value || "";

    let rows = all;
    if (q) rows = rows.filter(b => (b.phone||"").toLowerCase().includes(q) || (b.patientName||"").toLowerCase().includes(q) || (b.token||"").toLowerCase().includes(q));
    if (doctorFilter) rows = rows.filter(b => b.doctor === doctorFilter);
    if (statusFilter) rows = rows.filter(b => b.status === statusFilter);
    if (dateFilter) {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
      const weekFromNow = new Date(now); weekFromNow.setDate(now.getDate() + 7);
      if (dateFilter === "today") rows = rows.filter(b => b.date === todayStr);
      else if (dateFilter === "tomorrow") rows = rows.filter(b => b.date === tomorrowStr);
      else if (dateFilter === "week") rows = rows.filter(b => { if (!b.date) return false; const d=new Date(b.date); return d>=now && d<=weekFromNow; });
      else if (dateFilter === "month") rows = rows.filter(b => { if (!b.date) return false; const d=new Date(b.date); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); });
    }

    if (rows.length === 0) { alert("No bookings to export with current filters."); return; }

    // Escape CSV field per RFC 4180
    const esc = (v) => {
      if (v == null) return "";
      const s = String(v);
      // Always quote so commas, newlines, quotes in patient names/addresses don't break the file
      return '"' + s.replace(/"/g, '""') + '"';
    };

    const headers = ["Date", "Time", "Token", "Patient Name", "Phone", "Age", "Gender", "Doctor", "Specialty", "Fee (₹)", "Payment", "Status", "Reason", "Booking ID"];
    const lines = [headers.map(esc).join(",")];
    rows.forEach(b => {
      lines.push([
        b.date || "",
        b.slot || "",
        b.token || "",
        b.patientName || "",
        b.phone || "",
        b.age || "",
        b.gender || "",
        b.doctor || "",
        b.specialty || "",
        b.fee || "",
        b.paymentMethod === "paid_online" ? "Paid Online" : "Pay at Clinic",
        b.status || "",
        b.reason || "",
        b.id || ""
      ].map(esc).join(","));
    });

    // BOM helps Excel detect UTF-8 (₹, accented names, etc.) correctly
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `healthfirst-bookings-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* Populate doctor filter dropdown from loaded doctors */
  window.populateDoctorFilterDropdown = function () {
    const sel = document.getElementById("filterDoctor");
    if (!sel) return;
    const doctors = window._adminAllDoctors || [];
    const currentVal = sel.value;
    let html = '<option value="">All Doctors</option>';
    doctors.forEach(d => { html += `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`; });
    sel.innerHTML = html;
    if (currentVal) sel.value = currentVal; // preserve selection on reload
  };

  /* ─── Admin: notification bell for pending applications ─── */
  window.toggleAdminNotifications = function () {
    const dd = document.getElementById("adminNotifDropdown");
    if (!dd) return;
    dd.style.display = dd.style.display === "none" ? "block" : "none";
  };

  // Close notification dropdown on outside click
  document.addEventListener("click", function (e) {
    const dd = document.getElementById("adminNotifDropdown");
    const bell = document.getElementById("adminNotifBell");
    if (dd && bell && dd.style.display === "block" && !dd.contains(e.target) && !bell.contains(e.target)) {
      dd.style.display = "none";
    }
  });

  /* Refresh notification bell with pending applications */
  window.refreshAdminNotifications = function (applications) {
    const pending = (applications || []).filter(a => (a.status || "pending") === "pending");
    const badge = document.getElementById("adminNotifBadge");
    const list = document.getElementById("adminNotifList");
    if (badge) {
      if (pending.length > 0) { badge.style.display = "flex"; badge.textContent = pending.length; }
      else { badge.style.display = "none"; }
    }
    if (list) {
      if (pending.length === 0) {
        list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:13px">🎉 No pending applications</div>`;
      } else {
        list.innerHTML = pending.slice(0, 10).map(a => `
          <div style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="document.getElementById('docApplications').scrollIntoView({behavior:'smooth'});toggleAdminNotifications();">
            <div style="font-weight:700;color:var(--navy);font-size:13px;margin-bottom:2px">${escapeHtml(a.name || 'Unknown')}</div>
            <div style="font-size:11px;color:var(--navy-m)">${escapeHtml(a.specialty || '—')}${a.city ? ' · ' + escapeHtml(a.city) : ''}</div>
          </div>
        `).join("");
      }
    }
  };

  /* WhatsApp reminders for tomorrow's bookings */
  window.openRemindersPanel = function () {
    const all = window._adminAllBookings || [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().split("T")[0];
    const tomorrowBookings = all.filter(b => b.date === tomorrowKey && b.status === "confirmed");

    const wrap = document.getElementById("remindersPanel");
    if (!wrap) return;

    if (tomorrowBookings.length === 0) {
      wrap.innerHTML = `<div style="padding:24px;text-align:center;color:var(--navy-m);font-size:14px">📭 No confirmed bookings for tomorrow yet.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div style="padding:14px 20px;background:var(--teal-l);font-size:13px;color:var(--teal-d);font-weight:600">
        📱 ${tomorrowBookings.length} appointment${tomorrowBookings.length > 1 ? "s" : ""} tomorrow. Click each to send a WhatsApp reminder.
      </div>
    ` + tomorrowBookings.map(b => {
      const phone = (b.phone || "").replace(/\D/g, "");
      const msg = encodeURIComponent(
        `Hi ${b.patientName}! 👋\n\nThis is a reminder for your appointment tomorrow:\n\n👨‍⚕️ ${b.doctor} (${b.specialty})\n📅 ${b.dateDisplay}\n⏰ ${b.slot}\n🆔 Token: ${b.token}\n💰 Fee: ₹${b.fee}\n\nPlease arrive 10 minutes early. To cancel or reschedule, reply to this message.\n\n— HealthFirst`
      );
      const waLink = phone ? `https://wa.me/91${phone}?text=${msg}` : "#";
      return `
        <div class="appt-item">
          <div class="ai-token" style="font-size:11px;background:var(--green-l);color:#065F46;width:36px;height:36px">${escapeHtml((b.patientName||"??").slice(0,2).toUpperCase())}</div>
          <div class="ai-info">
            <div class="ai-name">${escapeHtml(b.patientName)} · ${escapeHtml(b.slot)}</div>
            <div class="ai-detail">📞 ${escapeHtml(b.phone||"—")} · ${escapeHtml(b.doctor)} · Token ${escapeHtml(b.token)}</div>
          </div>
          ${phone ? `<a href="${waLink}" target="_blank" class="btn-primary" style="font-size:12px;padding:7px 14px;text-decoration:none">📱 Send Reminder</a>` : `<span style="font-size:11px;color:var(--red)">No phone</span>`}
        </div>`;
    }).join("");
  };

  window.removeDoctorAdmin = async function (id, name) {
    if (!confirm(`Remove ${name} from HealthFirst?\n\nTheir profile will no longer be visible to patients. Past bookings stay intact.`)) return;
    await deleteDoctor(id);
    loadAdminData();
  };

  // Admin-initiated password reset — sends a Firebase reset email to the doctor.
  // This scales to any number of doctors with zero ongoing admin work per request.
  window.adminResetDoctorPassword = async function (email, name) {
    if (!email) { alert("This doctor has no email on file. Edit their record to add one first."); return; }
    if (!confirm(`Send a password reset link to ${name}?\n\n📧 ${email}\n\nThey'll receive an email immediately with a secure link to set a new password. The link expires in 1 hour.`)) return;
    if (!window._auth) { alert("Not connected to Firebase Auth yet — wait a moment and try again."); return; }
    try {
      // Send reset, redirect doctor back to doctor.html after they set the new password
      const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
      await window._auth.sendPasswordResetEmail(window._auth.auth, email, {
        url: baseUrl + "doctor.html",
        handleCodeInApp: false
      });
      alert(`✅ Password reset email sent to ${email}\n\nLet ${name} know to check their inbox (and spam folder). The link expires in 1 hour.`);
    } catch (e) {
      console.error("Admin password reset:", e);
      if (e.code === "auth/user-not-found") {
        alert(`⚠️ No Firebase Auth account exists yet for ${email}.\n\nThis means the doctor was added to Firestore but their login account wasn't created in Firebase Auth.\n\nFix: Go to Firebase Console → Authentication → Users → "Add user" → enter ${email} and a temporary password.`);
      } else if (e.code === "auth/invalid-email") {
        alert("That email format isn't valid in Firebase Auth. Check the doctor's email field.");
      } else if (e.code === "auth/too-many-requests") {
        alert("Too many reset requests for this account recently. Wait 15 minutes and try again.");
      } else {
        alert("Could not send reset email: " + (e.message || "unknown error"));
      }
    }
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
      email: (get("appEmail") || "").toLowerCase(),
      phone: get("appPhone"),
      clinicPhone: get("appClinicPhone"),
      consultationFee: parseInt(get("appConsultationFee")) || 0,
      specialty: specialty,
      qualification: get("appQual"),
      experience: get("appExp"),
      state: get("appState"),
      city: city,
      clinicAddress: get("appClinicAddress"),
      pricingModel: pricingModel,
      message: get("appMessage"),
      certifications: appUploadedFiles
    };

    const required = [
      ["name", "Full Name", "appName"],
      ["email", "Email", "appEmail"],
      ["phone", "Personal Phone", "appPhone"],
      ["clinicPhone", "Clinic Phone Number", "appClinicPhone"],
      ["consultationFee", "Consultation Fee", "appConsultationFee"],
      ["specialty", "Specialty", "appSpecialty"],
      ["qualification", "Qualification", "appQual"],
      ["experience", "Years of Experience", "appExp"],
      ["state", "State of Practice", "appState"],
      ["city", "City of Practice", "appCity"],
      ["clinicAddress", "Clinic Name / Address", "appClinicAddress"],
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
      alert("Please enter a valid 10-digit personal phone number.");
      document.getElementById("appPhone")?.focus();
      return false;
    }
    if (data.clinicPhone.length < 10) {
      alert("Please enter a valid clinic phone number (10+ digits).");
      document.getElementById("appClinicPhone")?.focus();
      return false;
    }
    if (data.consultationFee < 50 || data.consultationFee > 50000) {
      alert("Please enter a reasonable consultation fee (₹50 to ₹50,000).");
      document.getElementById("appConsultationFee")?.focus();
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
      const canModify = isUpcoming && status === "confirmed";

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
            ${canModify ? `
              <button onclick="rescheduleBooking('${b.lookupToken}','${b.bookingId || ""}','${b.doctorId || ""}')" class="btn-primary" style="font-size:12px;padding:7px 14px">🔄 Reschedule</button>
              <button onclick="cancelMyBooking('${b.lookupToken}','${b.bookingId || ""}')" style="font-size:12px;padding:7px 14px;background:white;color:var(--red);border:1.5px solid var(--red);border-radius:var(--r);font-weight:600;cursor:pointer;font-family:var(--ff)">✗ Cancel</button>
            ` : ""}
            <button onclick="copyMyApptLink('${b.lookupToken}')" class="btn-ghost" style="font-size:12px;padding:7px 14px">🔗 Copy link</button>
            <button onclick="removeMyAppt('${b.lookupToken}')" class="btn-ghost" style="font-size:12px;padding:7px 14px;color:var(--navy-m)">🗑 Remove from device</button>
          </div>
        </div>`;
    }).join("");
  }

  window.cancelMyBooking = async function (lookupToken, bookingId) {
    if (!lookupToken || !bookingId) { alert("Missing booking details."); return; }
    if (!confirm("Cancel this appointment?\n\nThis will free up your slot and notify the doctor. This action cannot be undone.")) return;
    const ok = await cancelBookingAsPatient(lookupToken, bookingId);
    if (ok) {
      alert("✅ Appointment cancelled. Your slot has been freed up.\n\nWe recommend also messaging the doctor's clinic to confirm.");
      location.reload();
    } else {
      alert("⚠️ Cancellation went through partially. Please contact the clinic directly to confirm cancellation.");
      location.reload();
    }
  };

  window.rescheduleBooking = async function (lookupToken, bookingId, doctorId) {
    if (!confirm("Reschedule this appointment?\n\nWe'll cancel the current slot and take you to the booking page to pick a new time with the same doctor.")) return;
    if (lookupToken && bookingId) {
      await cancelBookingAsPatient(lookupToken, bookingId);
    }
    // Redirect to book.html with the doctor pre-selected
    if (doctorId) {
      window.location.href = `book.html?docId=${doctorId}`;
    } else {
      window.location.href = `book.html`;
    }
  };

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

/* ═══════════════════════════════════
   DOCTOR PROFILE PAGE
═══════════════════════════════════ */
if (document.getElementById("doctorProfileWrap")) {
  document.addEventListener("firebase-ready", initDoctorProfile);
  if (firebaseReady) initDoctorProfile();

  async function initDoctorProfile() {
    const wrap = document.getElementById("doctorProfileWrap");
    const id = getParam("id");
    if (!id) {
      wrap.innerHTML = `<div style="text-align:center;padding:60px 24px"><h2 style="font-family:var(--ff-d);color:var(--navy);margin-bottom:12px">Doctor not specified</h2><p style="color:var(--navy-m);margin-bottom:20px">No doctor ID was provided in the URL.</p><a href="book.html" class="btn-primary">Browse All Doctors →</a></div>`;
      return;
    }
    const doc = await loadDoctorById(id);
    if (!doc) {
      wrap.innerHTML = `<div style="text-align:center;padding:60px 24px"><h2 style="font-family:var(--ff-d);color:var(--navy);margin-bottom:12px">Doctor not found</h2><p style="color:var(--navy-m);margin-bottom:20px">This doctor may have been removed or the link is invalid.</p><a href="book.html" class="btn-primary">Browse All Doctors →</a></div>`;
      return;
    }

    // Load reviews for THIS doctor
    const allReviews = await loadReviews();
    const myReviews = allReviews.filter(r => r.doctor === doc.name);
    const avgRating = myReviews.length ? (myReviews.reduce((s, r) => s + (r.rating || 5), 0) / myReviews.length).toFixed(1) : null;
    const stars = (r) => "★".repeat(r) + "☆".repeat(5 - r);

    // Load schedule preview
    const schedule = await loadDoctorSchedule(doc.id);
    const activeDays = Object.entries(schedule.weeklyPattern || {})
      .filter(([k, slots]) => slots && slots.length > 0)
      .map(([k]) => DAY_NAMES[parseInt(k)]);

    wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:32px;align-items:start;max-width:1080px;margin:0 auto">
        <div style="background:white;border-radius:var(--r-xl);padding:32px 28px;border:1px solid var(--border);text-align:center;position:sticky;top:100px">
          ${doc.photoUrl
            ? `<div style="width:140px;height:140px;margin:0 auto 14px;border-radius:50%;overflow:hidden;border:4px solid var(--teal-l)"><img src="${escapeHtml(doc.photoUrl)}" alt="Dr. ${escapeHtml(doc.name)}" style="width:100%;height:100%;object-fit:cover"></div>`
            : `<div style="font-size:90px;line-height:1;margin-bottom:14px">${escapeHtml(doc.avatar || "👨‍⚕️")}</div>`
          }
          <h1 style="font-family:var(--ff-d);font-size:28px;font-weight:700;color:var(--navy);margin-bottom:6px;line-height:1.2">${escapeHtml(doc.name)}</h1>
          <div style="font-size:15px;color:var(--teal);font-weight:600;margin-bottom:12px">${escapeHtml(doc.specialty || "")}</div>
          ${avgRating ? `<div style="display:inline-block;padding:6px 14px;background:#FEF3C7;color:#92400E;border-radius:20px;font-size:13px;font-weight:700;margin-bottom:14px">★ ${avgRating} (${myReviews.length} review${myReviews.length === 1 ? "" : "s"})</div>` : `<div style="display:inline-block;padding:6px 14px;background:var(--bg);color:var(--navy-m);border-radius:20px;font-size:13px;margin-bottom:14px">New on HealthFirst</div>`}
          <div style="background:var(--teal-l);padding:12px;border-radius:var(--r-lg);margin:14px 0">
            <div style="font-size:11px;color:var(--navy-m);text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Consultation Fee</div>
            <div style="font-family:var(--ff-d);font-size:28px;font-weight:700;color:var(--teal-d)">₹${escapeHtml(doc.fee || "—")}</div>
          </div>
          <a href="book.html?docId=${doc.id}" class="btn-primary" style="width:100%;justify-content:center;font-size:15px;padding:14px">📅 Book Appointment</a>
        </div>

        <div>
          <div style="background:white;border-radius:var(--r-xl);padding:28px;border:1px solid var(--border);margin-bottom:20px">
            <h2 style="font-family:var(--ff-d);font-size:22px;font-weight:700;color:var(--navy);margin-bottom:16px">About Dr. ${escapeHtml((doc.name || "").replace(/^Dr\.?\s*/, "").split(" ")[0])}</h2>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;font-size:14px">
              <div><div style="font-size:11px;color:var(--navy-m);text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:3px">Qualification</div><div style="color:var(--navy)">${escapeHtml(doc.qualification || "Not specified")}</div></div>
              <div><div style="font-size:11px;color:var(--navy-m);text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:3px">Experience</div><div style="color:var(--navy)">${escapeHtml(doc.experience || "Not specified")}</div></div>
              ${doc.city || doc.state ? `<div><div style="font-size:11px;color:var(--navy-m);text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:3px">Location</div><div style="color:var(--navy)">${escapeHtml([doc.city, doc.state].filter(Boolean).join(", "))}</div></div>` : ""}
              ${doc.clinicPhone ? `<div><div style="font-size:11px;color:var(--navy-m);text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:3px">Clinic Phone</div><div style="color:var(--navy)"><a href="tel:${escapeHtml(doc.clinicPhone)}" style="color:var(--teal);font-weight:600">${escapeHtml(doc.clinicPhone)}</a></div></div>` : ""}
            </div>
            ${doc.clinicAddress ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)"><div style="font-size:11px;color:var(--navy-m);text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:4px">Clinic Address</div><div style="color:var(--navy);font-size:14px;line-height:1.5">📍 ${escapeHtml(doc.clinicAddress)}</div></div>` : ""}
          </div>

          ${activeDays.length > 0 ? `<div style="background:white;border-radius:var(--r-xl);padding:28px;border:1px solid var(--border);margin-bottom:20px">
            <h2 style="font-family:var(--ff-d);font-size:18px;font-weight:700;color:var(--navy);margin-bottom:10px">📅 Available Days</h2>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${activeDays.map(d => `<span style="background:var(--teal-l);color:var(--teal-d);padding:5px 12px;border-radius:14px;font-size:12px;font-weight:600">${d}</span>`).join("")}
            </div>
            <div style="margin-top:12px;font-size:12px;color:var(--navy-m);font-style:italic">Click "Book Appointment" to see exact time slots.</div>
          </div>` : ""}

          <div style="background:white;border-radius:var(--r-xl);padding:28px;border:1px solid var(--border)">
            <h2 style="font-family:var(--ff-d);font-size:22px;font-weight:700;color:var(--navy);margin-bottom:16px">⭐ Patient Reviews ${myReviews.length > 0 ? `<span style="font-size:14px;color:var(--navy-m);font-weight:500">(${myReviews.length})</span>` : ""}</h2>
            ${myReviews.length === 0 ? `<div style="text-align:center;padding:24px;color:var(--navy-m);font-size:14px">💬 No reviews yet. Be the first to share your experience after your visit!</div>` :
              myReviews.slice(0, 10).map(r => `
              <div style="padding:14px 0;border-bottom:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
                  <strong style="color:var(--navy);font-size:14px">${escapeHtml(r.patientName || "Patient")}</strong>
                  <span style="color:#F59E0B;font-size:14px;white-space:nowrap">${stars(r.rating || 5)}</span>
                </div>
                <p style="font-size:14px;color:var(--navy-m);line-height:1.6;font-style:italic;margin:0">"${escapeHtml(r.comment)}"</p>
              </div>`).join("")
            }
          </div>
        </div>
      </div>
    `;

    // Update page title
    document.title = `${doc.name} — HealthFirst`;
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
