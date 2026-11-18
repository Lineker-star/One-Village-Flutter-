# OneVillage Bertoua — Phase 15 Launch & Deployment Playbook

This document serves as the official launch checklist and production deployment blueprint for **OneVillage Bertoua**, optimizing both the web and mobile app pipelines for real-world deployment in the East Region of Cameroon.

---

## 1. Production Seeding & Bootstrap Data (Supply-First Strategy)
Before opening the platform to the public, the administration must seed verified local provider accounts across key neighborhoods (Mokolo, Yademe, Kano, Enia, etc.) to ensure immediate utility.

### Seed Service Categories
Ensure the core category table holds the correct localized tags (EN/FR) and default illustrations:
*   **AGRICULTURE** (Agriculture & Labour / Travaux Agricoles)
*   **TRANSPORT** (Moto-Taxi & Delivery / Transport & Moto-Taxi)
*   **TAILORING** (Tailoring & Fashion / Couture & Mode)
*   **CONSTRUCTION** (Masonry & Building / Maçonnerie & Construction)
*   **HOME_HELP** (Housekeeping & Cleaning / Aide Ménagère)
*   **CHILDCARE** (Childcare & Nanny / Nounou & Garde)

### Seed Initial Verified Providers
Admin should register at least 3-5 high-quality, pre-vetted providers per category to guarantee organic early matches.
*   **Verification standard:** Confirm active phone numbers (+237 MTN/Orange) capable of receiving Mobile Money.
*   **Profile photos:** Use optimized, high-contrast local portrait representations.

---

## 2. Mobile Money (MoMo) Live Testing Protocol
Because real-world transactions rely on MTN Mobile Money and Orange Money APIs, follow this testing workflow with a real minor denomination (e.g., 100 FCFA):

1.  **Sandbox Validation:** Complete mock balance deductions and validation callbacks on the staging environment.
2.  **Live Small-Value Run:**
    *   Create a test booking with a live partner account.
    *   Initiate payment of 100 FCFA from a live phone number.
    *   Verify the carrier push notification (USSD PIN prompt) triggers on the physical device.
    *   Approve the prompt, confirm the transaction transitions to `approved` state in the dashboard, and check that the provider's active balance correctly increments.
3.  **Ad Spend Verification:** Repeat the simulation with the newly deployed Promoted Ads checkout portal.

---

## 3. CI/CD Multi-Platform Pipeline
The repository is engineered for a "one-push updates both" flow using GitHub Actions.

### Web Deployment
*   **Platform:** Dockerized Cloud Run containers.
*   **Pipeline:** Code push triggers a build of the modern Express + Vite server, compiles TypeScript assets into `/dist`, and runs structural health checks.

### Android Mobile Build & Publish
*   **Tooling:** GitHub Action workflow using Fastlane and the Android SDK.
*   **Target:** Produces a signed `.aab` (Android App Bundle).
*   **Google Play Console:** Automatically pushes updates to the **Internal Testing Track** first. Once validated, promote with one click to the Production Track.

### iOS Mobile Build & Publish
*   **Tooling:** macOS runner executing Fastlane Gym & Deliver.
*   **Target:** Signed `.ipa` binary.
*   **TestFlight:** Automatic upload to TestFlight for developer testing.
*   **Apple Review Note:** *Crucial for iOS certification.* In your App Review notes, explicitly document that the Cash-on-Hand and local Mobile Money payment methods are strictly for real-world physical services (masonry, farming, transportation) rendered on-site, and **not** for digital goods or virtual content. This keeps the application fully compliant with Apple App Store Review Guideline 3.1.3(e).

---

## 4. Web 3.0 Visual & UX Polishing Summary
We have meticulously updated the application's layout to conform with premium web standards suited for local devices:
*   **Staggered Fade-in Animations:** Smooth state transitions that load instantly on low-spec screens.
*   **Contrast-Safe Palette:** High-contrast amber-950 and deep charcoal slate combinations to prevent screen washout under high outdoor lux/sunlight in Bertoua.
*   **Responsive Paginated Grids:** Dynamic client-side caching prevents network request failures on unstable 3G networks.
*   **Large Touch Targets:** Buttons and interactive carousels are optimized with generous padding matching the mobile 44px ergonomics requirement.
