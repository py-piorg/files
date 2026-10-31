# Staff portal & online ordering — setup

## How ordering works
1. **Customer** opens the website, taps **Order LPG**, and picks a station, a product (refill, exchange or vehicle gas) and how much (full cylinder, a cedi amount, or kg). The price is calculated from the published per-kg price.
2. The customer gets a **4-digit code** on `order.html`. The page updates live.
3. **Cashier** (`admin.html` → Cashier) types the code, takes cash, MoMo or card, and taps **Payment received**. The customer's page turns into a **QR code**. Walk-in customers get a printed slip with the QR instead.
4. **Pump attendant** (`admin.html` → Pump / Scan) scans the QR code (or types the code), sees exactly what to fill, fills it, and taps **Filled**. Tank stock is reduced and the order is closed. A QR code can't be used twice.

Unpaid orders expire after 12 hours. Prices changed later don't affect orders already placed.

## One-time setup (Firebase console, project `triple-a-gas`)
1. **Switch on staff sign-in:** Authentication → Sign-in method → enable **Email/Password**.
2. **Create the owner account straight away:** open `https://tripleagas.com/admin.html`. The first person to open it sees *First-time setup* and becomes the owner. Do this immediately after deploying.
3. **Lock down the database:** Firestore Database → Rules → paste the contents of `firestore.rules` → **Publish**. Until you do this, anyone on the internet can read and change the database.
4. As owner, open **Pricing** and publish today's prices, then **Stations** for each station's MoMo number and hours, then **Staff** to add everyone.

## Automatic pricing (NPA floor + your margin)
The NPA sets a minimum LPG price (the "price floor") for each pricing window, starting on the 1st and 16th of the month. A GitHub job (`.github/workflows/npa-price.yml`) reads the new floor from the Ghanaian business press (Citi Newsroom and MyJoyOnline) three times a day. Once a window starts, it sets your price to **floor + your margin**.

One-time setup:
1. In the portal, open **Pricing → Connect price robot** (owner only). Copy the secret it shows. It is shown only once.
2. On GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `TAG_PRICEBOT` and paste the secret as the value.
3. Go to **Actions → NPA LPG price → Run workflow** to test it. Pricing should then show "Connected".
4. Back in **Pricing**, tick **Update prices automatically**, set your margins, and save.

How it behaves:
- Publishing a price by hand pauses automatic pricing until the next window. **Resume automatic now** undoes the pause.
- If the news sources disagree, or the floor jumps more than 40% from the last one, the job keeps your current price. The reason is shown under Pricing.
- The robot's login can only set price = floor + your margin. The database rules block everything else it might try.
- GitHub pauses scheduled jobs in repositories with no activity for 60 days. If Pricing says "Not seen" for days, open Actions and re-enable the workflow.

## Roles
| Role | Can do |
|---|---|
| Owner / Head Office | Everything, all stations, staff accounts |
| COO | All stations: operations, pricing, reports, payroll |
| Station Manager | Own station: cashier, pump, stock, expenses, reports, refunds |
| Cashier | Own station: confirm payments, walk-in sales, cash-up |
| Pump Attendant | Own station: scan and fill, tank readings, safety checks |
| Driver | Own station: record deliveries |
| Secretary | Own station: view orders, website enquiries |
| Automatic price bot | Only sets price = NPA floor + margin (cannot sign in to the portal) |

The security rules in `firestore.rules` enforce these permissions on the server. Hiding a menu item is not what stops someone.

## Notes
- **The camera scanner needs `https://`.** Over plain `http://` the attendant types the 4-digit code instead.
- **Forgotten passwords:** the owner disables the account and creates a new one with a different username. Staff can change their own password under Account.
- **Testing locally:** run `npx firebase-tools emulators:start --only auth,firestore`, serve the folder, and open `http://127.0.0.1:<port>/admin.html?emu=1`.
