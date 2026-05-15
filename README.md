# HealthFirst

India's doctor booking platform. Patients find verified doctors, book appointments online, and pay securely. Doctors get listed, manage their schedule, and grow their practice.

🌐 **Live site:** [kannan1018.github.io/HealthFirst](https://kannan1018.github.io/HealthFirst/)

## Pages

| Page | Purpose |
|------|---------|
| `index.html` | Public home page — featured doctors, specialties, reviews |
| `book.html` | Patient booking flow — pick doctor, slot, pay, confirm |
| `for-doctors.html` | Sales page for doctors — benefits, pricing, application form |
| `doctor.html` | Doctor dashboard — today's queue, mark done, send feedback |
| `admin.html` | Admin panel — add/remove doctors, review applications, see bookings |

## Tech

- **Frontend:** Pure HTML / CSS / Vanilla JS (no build step)
- **Backend:** Firebase Firestore
- **Payments:** Razorpay (test mode)
- **Hosting:** GitHub Pages

## Firebase Collections

- `doctors` — active doctor listings (added by admin)
- `doctorApplications` — sign-ups from For Doctors page
- `bookings` — patient appointments
- `reviews` — verified patient feedback

## Quick Start (Local)

Just open `index.html` in a browser. All scripts load from CDN.

## How to Add a Doctor

1. Go to `admin.html`
2. Fill the "Add New Doctor" form on the left
3. Save — doctor appears instantly on the public site
