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
    if (userEmail === adminEmail) {
      window._currentDoctor = { email: user.email, name: "Admin", specialty: "All Doctors", avatar: "🛡️" };
      const emailEl = document.getElementById("authedEmail");
      if (emailEl) emailEl.textContent = user.email + " (admin)";
      showContent();
      document.dispatchEvent(new Event("doctor-ready"));
      return;
    }
    const docMatch = await loadDoctorByEmail(userEmail);
    if (docMatch) {
      window._currentDoctor = docMatch;
      const emailEl = document.getElementById("authedEmail");
      if (emailEl) emailEl.textContent = user.email;
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

window.doForgotPassword = async function () {
  const email = (document.getElementById("loginEmail")?.value || "").trim();
  if (!email) {
    const promptEmail = prompt("Enter your email to receive a password reset link:");
    if (!promptEmail) return;
    return doForgotPasswordWith(promptEmail);
  }
  return doForgotPasswordWith(email);
};

async function doForgotPasswordWith(email) {
  if (!window._auth) { alert("Connecting... try again in a moment."); return; }
  if (!email.includes("@")) { alert("Please enter a valid email."); return; }
  try {
    await window._auth.sendPasswordResetEmail(window._auth.auth, email);
    alert(`✅ Password reset email sent to ${email}.\n\nCheck your inbox (and spam folder) for the reset link. Click the link to set a new password, then come back here to sign in.`);
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
    return { weeklyPattern: defaultWeeklyPattern(), blockedDates: [] };
  }
  const { doc, getDoc } = window._fs;
  try {
    const snap = await getDoc(doc(db, "doctorSchedules", doctorId));
    if (!snap.exists()) {
      return { weeklyPattern: defaultWeeklyPattern(), blockedDates: [] };
    }
    const data = snap.data();
    return {
      weeklyPattern: data.weeklyPattern || defaultWeeklyPattern(),
      blockedDates: data.blockedDates || []
    };
  } catch (e) {
    console.error("loadDoctorSchedule:", e);
    return { weeklyPattern: defaultWeeklyPattern(), blockedDates: [] };
  }
}

async function saveDoctorSchedule(doctorId, scheduleData) {
  if (!firebaseReady || !doctorId) return false;
  const { doc, setDoc, serverTimestamp } = window._fs;
  try {
    await setDoc(doc(db, "doctorSchedules", doctorId), {
      weeklyPattern: scheduleData.weeklyPattern || defaultWeeklyPattern(),
      blockedDates: scheduleData.blockedDates || [],
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
          <div class="doc-photo">${escapeHtml(d.avatar || "👨‍⚕️")}</div>
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
    // Look ahead 7 days (matches doctor's weekly schedule view)
    for (let i = 0; i < 7; i++) {
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
if (document.getElementById("queue-upcoming")) {
  document.addEventListener("doctor-ready", loadTodayQueue);

  async function loadTodayQueue() {
    const today = new Date().toISOString().split("T")[0];
    const me = window._currentDoctor || {};
    const isAdmin = (me.email === ADMIN_EMAIL);

    // Update sidebar + greeting
    const setText = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };
    setText(".sb-avatar", me.avatar || (isAdmin ? "🛡️" : "👨‍⚕️"));
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
    if (confirmed.length === 0) {
      container.innerHTML = `<div style="padding:32px 24px;text-align:center;color:var(--navy-m);font-size:14px"><div style="font-size:40px;margin-bottom:10px">📭</div>No appointments scheduled for today.</div>`;
      return;
    }
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
          <button type="button" class="ai-btn cancel queue-cancel-btn" data-id="${escapeHtml(b.id)}">✗ Cancel</button>
        </div>
      </div>`;
    }).join("");

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
          return `<div title="${escapeHtml(slot)} — ${count} booking${count === 1 ? "" : "s"}" style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:48px">
            <div style="width:100%;height:36px;background:${bg};color:white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">${count}</div>
            <div style="font-size:10px;color:${isPast ? 'var(--navy-h)' : 'var(--navy-m)'};font-weight:600;white-space:nowrap">${escapeHtml(slot.replace(/:00 /, ' ').replace(' AM', 'a').replace(' PM', 'p'))}</div>
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

      return `<div data-slot="${escapeHtml(slot)}" class="timeline-slot-click" title="${escapeHtml(slot)} — ${escapeHtml(hoverContent)} (click for details)" style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:48px;cursor:pointer">
        <div style="width:100%;height:36px;background:${bg};color:${color};${borderStyle}border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;transition:transform .1s" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform=''">${label}</div>
        <div style="font-size:10px;color:${isPast ? 'var(--navy-h)' : 'var(--navy-m)'};font-weight:600;white-space:nowrap">${escapeHtml(slot.replace(/:00 /, ' ').replace(' AM', 'a').replace(' PM', 'p'))}</div>
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
          <div style="display:flex;gap:8px;margin-top:8px">
            <button onclick="closeSlotDetail(); markDone('${b.id}', '${(b.patientName || '').replace(/'/g, "\\'")}', '${phoneClean}')" style="flex:1;padding:10px;background:var(--green);color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--ff)">✓ Mark Done + Feedback</button>
            <button onclick="closeSlotDetail(); cancelAppt('${b.id}')" style="flex:1;padding:10px;background:var(--red);color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--ff)">✗ Cancel</button>
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
  window.showPatientHistory = function (phone, name) {
    const modal = document.getElementById("patientHistoryModal");
    if (!modal) return;
    const all = window._myAllBookings || [];
    const phoneClean = (phone || "").replace(/\D/g, "");
    const visits = all.filter(b => (b.phone || "").replace(/\D/g, "") === phoneClean)
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    document.getElementById("phmName").textContent = name || "Patient History";
    document.getElementById("phmSub").textContent = `📞 ${phone || "—"} · ${visits.length} visit${visits.length === 1 ? "" : "s"} on record`;

    const content = document.getElementById("phmContent");
    if (visits.length === 0) {
      content.innerHTML = `<div style="text-align:center;padding:32px;color:var(--navy-m);font-size:14px"><div style="font-size:40px;margin-bottom:10px">🆕</div>This is the patient's first visit.</div>`;
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
        </div>
        <div style="font-family:var(--ff-d);font-size:16px;font-weight:700;color:var(--navy);margin-bottom:10px">Visit History</div>
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

    modal.style.display = "flex";
  };

  window.closePatientHistory = function () {
    document.getElementById("patientHistoryModal").style.display = "none";
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
        <div id="scheduleGrid"></div>
      `;
      const doctors = await loadDoctors();
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
      document.getElementById("scheduleEditor").innerHTML = '<div id="scheduleGrid"></div>';
      renderScheduleGrid();
      renderBlockedDatesList();
    } else {
      document.getElementById("scheduleEditor").innerHTML = '<div style="text-align:center;color:var(--navy-m);padding:24px">Could not load your schedule. Please refresh.</div>';
    }
  }

  window.adminLoadDocSchedule = async function () {
    const docId = document.getElementById("adminDocPicker").value;
    if (!docId) {
      document.getElementById("scheduleGrid").innerHTML = "";
      document.getElementById("blockedDatesList").innerHTML = "";
      currentScheduleDoctorId = null;
      return;
    }
    currentScheduleDoctorId = docId;
    currentScheduleData = await loadDoctorSchedule(docId);
    renderScheduleGrid();
    renderBlockedDatesList();
  };

  function renderScheduleGrid() {
    const grid = document.getElementById("scheduleGrid");
    if (!grid) return;
    const days = [
      { num: "1", name: "Monday" },
      { num: "2", name: "Tuesday" },
      { num: "3", name: "Wednesday" },
      { num: "4", name: "Thursday" },
      { num: "5", name: "Friday" },
      { num: "6", name: "Saturday" },
      { num: "0", name: "Sunday" }
    ];
    const slotLengths = [10, 15, 20, 30, 45, 60];

    // Normalize legacy data → new schema if needed
    days.forEach(d => {
      const v = currentScheduleData.weeklyPattern[d.num];
      if (Array.isArray(v)) {
        // Legacy array → convert into the new object format with sensible defaults
        currentScheduleData.weeklyPattern[d.num] = {
          isOff: v.length === 0,
          workingStart: "09:00",
          workingEnd: "13:00",
          slotLength: 30,
          excludedSlots: []
        };
      } else if (!v || typeof v !== "object") {
        currentScheduleData.weeklyPattern[d.num] = { isOff: true, workingStart: "09:00", workingEnd: "13:00", slotLength: 30, excludedSlots: [] };
      } else {
        // Fill in any missing fields
        if (v.workingStart === undefined) v.workingStart = "09:00";
        if (v.workingEnd === undefined) v.workingEnd = "13:00";
        if (v.slotLength === undefined) v.slotLength = 30;
        if (v.excludedSlots === undefined) v.excludedSlots = [];
        if (v.isOff === undefined) v.isOff = false;
      }
    });

    function getUpcomingDateForWeekday(targetDayNum) {
      const today = new Date();
      const todayDayNum = today.getDay();
      const targetNum = parseInt(targetDayNum);
      const diff = (targetNum - todayDayNum + 7) % 7;
      const upcoming = new Date(today);
      upcoming.setDate(today.getDate() + diff);
      return upcoming;
    }

    function formatUpcomingDate(d) {
      const today = new Date();
      const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
      const sameDay = (a, b) => a.toDateString() === b.toDateString();
      const dayMonth = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      if (sameDay(d, today)) return `${dayMonth} · Today`;
      if (sameDay(d, tomorrow)) return `${dayMonth} · Tomorrow`;
      return dayMonth;
    }

    grid.innerHTML = days.map(d => {
      const day = currentScheduleData.weeklyPattern[d.num];
      const isOff = !!day.isOff;
      const activeSlots = getActiveSlotsForDay(day);
      const allGenerated = generateSlotsFromWindow(day.workingStart, day.workingEnd, day.slotLength);
      const excluded = new Set(day.excludedSlots || []);
      const upcomingDate = getUpcomingDateForWeekday(d.num);
      const dateLabel = formatUpcomingDate(upcomingDate);

      const slotPills = allGenerated.length === 0
        ? `<div style="font-size:12px;color:var(--red);padding:8px 0">⚠️ End time must be after start time (with room for at least one slot).</div>`
        : allGenerated.map(s => {
            const isActive = !excluded.has(s);
            return `<button onclick="toggleDaySlot('${d.num}','${s.replace(/'/g, "\\'")}')" style="padding:7px 14px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--ff);transition:all .15s;white-space:nowrap;${isActive ? 'background:var(--teal);color:var(--cream);border:1.5px solid var(--teal)' : 'background:white;color:var(--navy-h);border:1.5px solid var(--border-md);text-decoration:line-through'}">${s}</button>`;
          }).join("");

      return `
        <div style="margin-bottom:14px;background:var(--white);border-radius:var(--r-lg);padding:18px;border:1px solid var(--border);${isOff ? 'opacity:0.7' : ''}">
          <!-- Day header -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
              <div style="font-family:var(--ff-d);font-size:18px;font-weight:600;color:var(--navy);letter-spacing:-0.01em">${d.name}</div>
              <div style="font-size:12px;color:var(--navy-m);font-weight:600">📅 ${dateLabel}</div>
              ${isOff
                ? '<span style="font-size:11px;background:var(--red-l);color:var(--red);padding:3px 10px;border-radius:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">Day off</span>'
                : `<span style="font-size:11px;background:var(--teal-l);color:var(--teal-d);padding:3px 10px;border-radius:14px;font-weight:700">${activeSlots.length} slot${activeSlots.length === 1 ? '' : 's'}</span>`}
            </div>
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;font-weight:600;color:var(--navy-m)">
              <input type="checkbox" ${isOff ? 'checked' : ''} onchange="setDayOff('${d.num}', this.checked)" style="cursor:pointer;width:14px;height:14px;accent-color:var(--red)"> Day off
            </label>
          </div>

          ${!isOff ? `
            <!-- Controls row: working hours + slot length -->
            <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding:12px 14px;background:var(--bg);border-radius:var(--r);border:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:13px;color:var(--navy-m);font-weight:600">Hours</span>
                <input type="time" value="${day.workingStart}" onchange="setDayHours('${d.num}','start',this.value)" style="padding:6px 10px;border:1px solid var(--border-md);border-radius:8px;font-family:var(--ff);font-size:13px;background:white">
                <span style="font-size:13px;color:var(--navy-m)">to</span>
                <input type="time" value="${day.workingEnd}" onchange="setDayHours('${d.num}','end',this.value)" style="padding:6px 10px;border:1px solid var(--border-md);border-radius:8px;font-family:var(--ff);font-size:13px;background:white">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:13px;color:var(--navy-m);font-weight:600">Each visit</span>
                <select onchange="setDaySlotLength('${d.num}', this.value)" style="padding:6px 10px;border:1px solid var(--border-md);border-radius:8px;font-family:var(--ff);font-size:13px;background:white;cursor:pointer">
                  ${slotLengths.map(n => `<option value="${n}" ${day.slotLength == n ? 'selected' : ''}>${n} min</option>`).join("")}
                </select>
              </div>
              <div style="margin-left:auto;display:flex;gap:6px">
                <button onclick="setAllDaySlots('${d.num}', true)" style="background:none;border:1px solid var(--border-md);padding:5px 12px;border-radius:14px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--ff);color:var(--navy-s)">Enable all</button>
                <button onclick="setAllDaySlots('${d.num}', false)" style="background:none;border:1px solid var(--border-md);padding:5px 12px;border-radius:14px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--ff);color:var(--navy-s)">Disable all</button>
              </div>
            </div>

            <!-- Generated slot pills -->
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${slotPills}
            </div>
            ${allGenerated.length > 0 ? `<div style="margin-top:10px;font-size:11px;color:var(--navy-h);font-style:italic">Tap any slot to enable/disable. Disabled slots won't appear to patients.</div>` : ''}
          ` : `
            <div style="font-size:13px;color:var(--navy-m);padding:8px 0">You're not seeing patients on this day. Uncheck "Day off" above to enable bookings.</div>
          `}
        </div>`;
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
    const doctors = await loadDoctors();
    const applications = await loadDoctorApplications();
    window._adminAllBookings = bookings; // cache for filtering
    window._adminAllDoctors = doctors;

    renderAdminBookings(bookings);

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

    const el = id => document.getElementById(id);
    if (el("adminTotalBookings")) el("adminTotalBookings").textContent = thisMonth.length;
    if (el("adminRevenue")) el("adminRevenue").textContent = "₹" + onlineRevenue.toLocaleString("hi-IN");
    if (el("adminTotalAll")) el("adminTotalAll").textContent = bookings.length;
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
    const q = (document.getElementById("patientSearchInput")?.value || "").trim().toLowerCase();
    const all = window._adminAllBookings || [];
    if (!q) { renderAdminBookings(all); return; }
    const filtered = all.filter(b =>
      (b.phone || "").toLowerCase().includes(q) ||
      (b.patientName || "").toLowerCase().includes(q) ||
      (b.token || "").toLowerCase().includes(q)
    );
    renderAdminBookings(filtered);
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
          <div style="font-size:90px;line-height:1;margin-bottom:14px">${escapeHtml(doc.avatar || "👨‍⚕️")}</div>
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
