# Claude Code Brief — C1: Nel Kalam Store (நெல் களம்)

**Status:** Design approved — **build blocked until §9 owner inputs land**
**Date:** 2026-07-13
**Author:** Capt. Charmer HQ (Dheeb + Claude strategic review)
**Repo:** AmmiAI (`com.ammiai.app`)
**Depends on:** S3 (pantry write path must be stable for the auto-add tie-in). Store screen itself can be built in parallel; the pantry tie-in lands after S3.
**Position in queue:** after S4, before or alongside R4. Does **not** jump the S3 checkpoint.

---

## 0. What this is

Dheeb's family paddy field in Tamil Nadu sells **9 traditional Tamil rice varieties**, grown with organic manure and no chemical pesticides. This batch adds a storefront inside AmmiAI.

**Brand architecture (decided):**
- Customer-facing brand: **நெல் களம் / Nel Kalam**
- Legal/invoice entity: **AMAZDGE** (Udyam registered, Micro, Thanjavur TN) — footer line: *"A unit of Amazdge"*
- ✅ **Spelling CONFIRMED from Udyam certificate (2026-07-13): `AMAZDGE`** — no "e" after "Amaz". The app splash / intro sequence currently render **"Amazedge"** and must be corrected. See §9.9.

**Why this belongs inside AmmiAI and not on a separate site:** rice bought here lands in the user's pantry automatically, and Capt. Charmer already knows what to cook with it. A Zepto listing cannot do that. The store is not a bolt-on — it is the only commerce in the world that is *continuous with the app's core loop*.

---

## 1. ⚖️ COMPLIANCE — read before writing a single line of copy

### 1.1 The word "organic" is regulated in India
Under FSSAI's Organic Food Regulations, food may only be **labelled or sold as organic** with **NPOP** or **PGS-India** certification (Jaivik Bharat mark). Farming with organic manure and no chemical pesticides is genuinely good practice, but it is **not** legally "organic" without certification. Selling labelled-organic product without it is real legal exposure *and* a Play Store listing risk.

**Banned in all store copy, UI strings, product names, and app-store text:**
`organic`, `certified organic`, `jaivik`, `NPOP`, `PGS` (unless/until certification is actually granted)

**Approved framing (true, specific, and more persuasive than the banned word):**
> *"Grown on our own field in Tamil Nadu. No chemical pesticides — organic manure only."*

Note: the phrase *"organic manure"* describes an **input**, not a product claim, and is accurate. Keep it in that exact construction; never let it drift to "organic rice."

**Parallel action for Dheeb (not a code task):** begin **PGS-India** certification — the cheaper of the two routes for a small farm. Once granted, this brief gets amended and the copy upgraded.

### 1.2 Traditional rice folklore — describe, never prescribe
Traditional varieties carry heavy medicinal folklore (karuppu kavuni and diabetes, mappillai samba and stamina). **Same rule as the rest of the app: the app SUPPORTS, never diagnoses/cures/treats.**

| ✅ Allowed (cultural description) | ❌ Banned (health claim) |
|---|---|
| "Traditionally eaten by wrestlers in Tamil Nadu" | "Builds strength" |
| "Served at weddings in the Chettinad region" | "Improves fertility" |
| "A red rice with a nutty bite; holds up in kuzhambu" | "Good for diabetes" / "controls sugar" |
| "Our grandmothers cooked this for new mothers" | "Aids recovery after childbirth" |

**Enforcement:** the existing health-claims grep runs over the rice catalog file and all store copy. Extend the banned-word list with: `diabetes`, `sugar control`, `immunity`, `detox`, `weight loss`, `fertility`, `strength`, `stamina`, `medicinal`, `cures`, `heals`.

### 1.3 Google Play Billing — physical goods are exempt
Physical goods sold for real-world delivery are **exempt from Google Play Billing**. Payment may be taken by UPI, COD, or any external method, and Google takes **no cut**. This store is the one revenue line in the app that isn't taxed 15–30%.

⚠️ **Do not** mix store payments with the subscription/premium gating code path — subscriptions remain Play Billing, the store must not. Keep them in separate modules so a future Play review can't confuse them.

### 1.4 Other compliance
- FSSAI licence/registration number must be displayed if required for the seller's turnover tier — **owner to confirm status** (§9.10).
- Legal metrology: net weight must be declared on pack and in-app (e.g. "1 kg net").
- Play Store Data Safety: store collects **name, phone, delivery address** → declare as collected personal data, purpose = order fulfilment.
- Privacy policy must cover order data + WhatsApp handoff.
- DPDP: delivery address and phone are personal data — consent screen must cover them.

---

## 2. Entry point — the store button

**Placement:** Grocery tab, **above** the "Order your list" button (owner's call, correct — the store is a destination, the grocery order is an action on existing state).

**Visual treatment — turmeric gold (`#D99A26`), not banana-leaf green.**
Rationale: every green control in the app is a *Captain action*. The store is *Dheeb's business*. It must feel like a different kind of thing — a doorway, not a command. Gold also reads as "special/premium" without saying it.

**Spec:**
- Full-width card, turmeric gold fill, dark green (`#1E4A2C`) text and icon
- Icon: rice sheaf / paddy grain (not a shopping cart — this isn't a generic store)
- Primary line: **நெல் களம் · Nel Kalam**
- Secondary line: *"9 traditional rices from our own field"*
- Right chevron
- Subtle gentle press-bounce, consistent with the app's existing bouncy interaction language. **No pulsing, no badge, no "NEW!" nag** — the Nag-Ban Law applies to in-app attention-grabbing too.
- Appears for all users; no gating behind premium.

---

## 3. Store screen — structure

```
┌─────────────────────────────────────┐
│  ← நெல் களம் · Nel Kalam            │
├─────────────────────────────────────┤
│  [Farm story hero — 1 photo]        │
│  Grown on our own field in Tamil    │
│  Nadu. No chemical pesticides —     │
│  organic manure only.               │
│  — <Farm name>, <village>           │
├─────────────────────────────────────┤
│  🐼 "Nine rices, soldier. Each one  │
│      cooks different. Ask me."      │
├─────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐        │
│  │ [photo]   │ │ [photo]   │        │
│  │ கருப்பு   │ │ மாப்பிள்ளை│        │
│  │ கவுனி     │ │ சம்பா      │        │
│  │ Karuppu   │ │ Mappillai │        │
│  │ Kavuni    │ │ Samba     │        │
│  │ ₹XXX/kg   │ │ ₹XXX/kg   │        │
│  │ ● In stock│ │ ◐ Low     │        │
│  └───────────┘ └───────────┘        │
│  ... 9 total, 2-up grid             │
├─────────────────────────────────────┤
│  [ View cart · 3 items · ₹XXX ]     │
└─────────────────────────────────────┘
```

### Stock states (drive from `stock_kg`)
| State | Rule | Display |
|---|---|---|
| In stock | `stock_kg > 10` | green dot, "In stock" |
| Low | `0 < stock_kg <= 10` | amber dot, "Only X kg left" |
| Out | `stock_kg == 0` | grey, card dimmed, **not tappable to cart**, "Back soon" |

Never hide an out-of-stock variety — seeing all nine is part of the story. Never fake scarcity; if it's in stock, say so plainly.

---

## 4. Variety detail sheet

Bottom sheet, opens on card tap:

- Large photo (grain close-up preferred over bag shot)
- Tamil name (Tamil script, prominent) + English transliteration
- Price per kg
- Pack size selector: **1 kg / 2 kg / 5 kg** (confirm in §9.2)
- Stock line
- **"How it eats"** — 1–2 honest lines: texture, cook time, what it suits (kuzhambu / pongal / biryani / kanji)
- **"Our field"** — one line of cultural or family story. Folklore allowed as *description of tradition*, never as benefit.
- 🐼 **Captain's line** — the virtual-seller idea, and it's the right instinct: *"Mappillai samba, soldier. Takes 40 minutes and a strong wrist to grind. Worth it."*
- [ Add to cart ] — banana-leaf green (this IS a Captain-adjacent action once you're inside the store)

**Copy source:** all of this lives in `rice_catalog.json`, authored by Dheeb, scrubbed by the claims grep. Claude Code does **not** invent variety descriptions — folklore invented by an AI about a real family's rice is both wrong and a claims risk.

---

## 5. Cart & checkout — v1 is WhatsApp, not a gateway

**Decision: no payment gateway in v1.** Razorpay needs business KYC, a bank account in the business name, and a published refund policy — days of paperwork before the first ten orders. Ship the WhatsApp version now; add UPI/Razorpay when order volume justifies it.

### Flow
1. **Cart** — line items, qty steppers, subtotal, delivery charge, minimum-order check, total
2. **Details** — name, phone, delivery address, optional landmark; validate pincode against the served list (§9.3)
3. **Review** — full order summary + delivery estimate + *"Payment on delivery. We'll confirm on WhatsApp."*
4. **[ Place order ]** →
   - `POST /api/store/orders` → persist to Mongo, generate short order ID (`NK-2607-0143`)
   - Then open WhatsApp deep link to the business number with a pre-filled message:
     ```
     Nel Kalam order NK-2607-0143
     • Karuppu Kavuni — 2 kg — ₹XXX
     • Mappillai Samba — 1 kg — ₹XXX
     Total: ₹XXX (incl. delivery ₹XX)

     <Name>
     <Phone>
     <Address>
     ```
5. **Confirmation screen** — order ID, "We'll confirm on WhatsApp shortly," and the Captain: *"Good haul, soldier. I'll add it to your pantry when it lands."*

### Rules
- **Order is persisted to the backend BEFORE the WhatsApp handoff.** If WhatsApp isn't installed or the user abandons, the order still exists and Dheeb can call them. Never let the order live only inside a chat app.
- Show a fallback: *"WhatsApp didn't open? Call/message us: <business number>"*
- No account required to order beyond the app's existing login.
- Order status is manual in v1: `placed → confirmed → delivered` flipped by Dheeb via a simple authenticated endpoint or direct DB edit. **No admin UI in v1.**

---

## 6. Stock management — a JSON file, not an admin screen

`backend/data/rice_catalog.json` — nine entries, edited by hand, committed to git.

```json
{
  "varieties": [
    {
      "id": "karuppu_kavuni",
      "name_ta": "கருப்பு கவுனி",
      "name_en": "Karuppu Kavuni",
      "price_per_kg": 0,
      "pack_sizes_kg": [1, 2, 5],
      "stock_kg": 0,
      "photo": "assets/rice/karuppu_kavuni.jpg",
      "how_it_eats": "",
      "our_field": "",
      "captain_line": "",
      "ifct_ref": "<nearest IFCT 2017 rice entry>",
      "pantry_category": "cereal_pulse",
      "active": true
    }
  ],
  "delivery": {
    "areas": [],
    "charge": 0,
    "free_above": 0,
    "min_order": 0
  },
  "seller": {
    "brand_ta": "நெல் களம்",
    "brand_en": "Nel Kalam",
    "legal_entity": "Amazdge",
    "whatsapp_env_key": "STORE_WHATSAPP_NUMBER",
    "fssai_no_env_key": "STORE_FSSAI_NO"
  }
}
```

**Rationale:** an admin screen is roughly a week of work to save thirty seconds a day. When a bag sells, edit a number and push. Revisit at ~50 orders/month.

⚠️ **Secrets discipline:** the WhatsApp business number and FSSAI number live in `backend/.env`, referenced by key name only. **Never commit them.** Same rule as `backend-url.txt`.

---

## 7. The pantry tie-in — the thing no competitor can copy

On order status → `delivered`:
1. Each variety auto-adds to the buyer's pantry: category `cereal_pulse`, quantity = ordered kg, IFCT-grounded nutrition from `ifct_ref`, product photo from the catalog.
2. Suggestion engine immediately factors it in (context object, S1).
3. Captain notification — **this is post-order nudge #3 from the R4 brief, reused, not a new notification type.** Nag-Ban Law caps still apply:
   > *"Your kavuni landed, soldier. Kanji tonight — 40 minutes, and it eats like a meal."*

**No new notification slot is created by this batch.**

---

## 8. Acceptance criteria

- [ ] Claims grep over `rice_catalog.json` + all store UI strings: zero hits on `organic` (as product descriptor), `diabetes`, `sugar`, `immunity`, `detox`, `weight loss`, `fertility`, `strength`, `stamina`, `medicinal`, `cures`, `heals`. The exact string `"organic manure only"` is allow-listed.
- [ ] Store button renders turmeric gold above "Order your list"; no badge, no pulse.
- [ ] All 9 varieties render with Tamil script correct (visual check against `docs/i18n-tamil-review.md`).
- [ ] Out-of-stock variety is visible, dimmed, and cannot be added to cart.
- [ ] Minimum order and delivery threshold enforced in cart before checkout is enabled.
- [ ] Pincode outside the served list → blocked at Details step with a clear message, not at submit.
- [ ] Order persists to Mongo **before** the WhatsApp intent fires — verify by killing WhatsApp and confirming the order still exists via API.
- [ ] WhatsApp fallback message shown when the deep link fails.
- [ ] Store payment path contains **zero** Play Billing calls (grep to confirm module separation).
- [ ] Marking an order `delivered` adds the rice to that user's pantry with correct category + IFCT nutrition.
- [ ] No secrets in the repo: `STORE_WHATSAPP_NUMBER` and `STORE_FSSAI_NO` present only in `.env`.
- [ ] Deploy verified live on Render (recurring miss).

---

## 9. ⛔ OWNER INPUTS — build cannot start without these

Nothing below can be guessed; guessing means rework.

1. **The 9 varieties** — Tamil name (Tamil script), English name, price/kg, current stock in kg
2. **Pack sizes** actually sold — 1 / 2 / 5 kg? Any variety sold only in certain sizes?
3. **Delivery** — which areas/pincodes, charge, free-delivery threshold, minimum order value
4. **Payment** — COD, UPI on delivery, or both?
5. **WhatsApp business number** → goes in `.env`, **not** in the brief or chat. Is it shown publicly in-app?
6. **Photos** — one per variety. Grain close-up on white beats a bag shot. JPG, ≤300KB each.
7. **"How it eats" + "Our field"** — 1–2 honest lines per variety. Folklore as tradition, never as benefit. I will scrub anything that crosses the line.
8. **Seller story** — farm name, village, one or two lines. *This sells more rice than any feature in this brief.*
9. ✅ **Brand spelling: RESOLVED — `AMAZDGE`** (Udyam certificate, 2026-07-13). Action for Claude Code: grep the whole repo for `Amazedge` and correct to `Amazdge` — this appears in the intro/splash sequence and must be fixed before any APK ships or packaging is printed.
10. **FSSAI registration status** — ⚠️ see §9a. Required before the first bag ships.

---

## 9a. ⚠️ Registration findings (from Udyam certificate, 2026-07-13)

Two gaps surfaced when the certificate was reviewed. **Neither is a code task**, but both gate the first real sale.

### A. NIC code does not cover selling food
The Udyam registration lists **NIC 74201 — Commercial and consumer photograph production**, activity type **Services**. That describes a photography business, not food trading or retail.

Selling rice to consumers falls under food trading/retail (NIC Division 46/47 territory, not 74). Udyam allows **adding or editing NIC codes free of charge** on the portal using the same Aadhaar-linked login.

**Why it matters:** an MSME registration that doesn't cover the actual activity undercuts the benefits it was obtained for — priority-sector lending, the trademark filing fee concession, government schemes. Fix before the first order.

### B. Udyam is NOT a food licence
MSME/Udyam registration does not authorise food sale. Selling packaged rice to consumers requires **FSSAI registration** (basic registration at small turnover; State Licence above the threshold), applied for online via **FoSCoS**. The FSSAI number must appear on-pack and in-app.

**This is a hard blocker on shipping the first bag.** Start the application now — it runs in parallel with the build.

### C. Verify with a professional
Confirm the correct NIC code and FSSAI tier with a CA or the District Industries Centre, Thanjavur (listed on the certificate as the assistance contact). One conversation, worth the hour. Claude is not a lawyer and this brief is not legal advice.

### D. 🔒 Privacy — the certificate itself
The Udyam PDF contains the owner's personal mobile number, personal email, and residential address. **Do not commit it to the repo. Do not paste it into Claude Code.** Real values go into `backend/.env` only, per §6.

---

**Privacy note:** do not paste the home address, exact farm coordinates, or personal phone number into the `.md` or into chat. Use placeholders; drop real values into `backend/.env` yourself.

---

## 10. Trademark note (not a code task)

"Nel Kalam" is close to **descriptive** for rice — *nel* literally means paddy — and trademark offices resist plain descriptive terms in the exact goods class. Two paths:

- **Accept it.** For a farm selling nine varieties to a few hundred customers, a weak mark is fine. The name is beautiful and instantly readable to a Tamil buyer. **Recommended.**
- **Strengthen it** by pairing with the village or family name — *"Nel Kalam, <village>"* — more distinctive legally *and* a better story on the bag.

Either way, file as a **word + device (logo) mark**, not the word alone — the logo carries the distinctiveness. MSME/Udyam registration cuts the filing fee roughly in half; make sure the concession is claimed.

---

## 11. Out of scope for v1

- Razorpay / any payment gateway (revisit at consistent order volume)
- Admin dashboard for stock and orders
- Order tracking / delivery status notifications beyond the R4 post-order nudge
- Subscriptions ("monthly 5kg") — good idea, wrong time
- Anything other than rice (millets, oils, jaggery come later if rice works)
- Shipping outside the served delivery areas
