# MiniLedger

A small full-stack app for tracking money lent to friends. Built with Node.js, TypeScript, Express, PostgreSQL/Prisma, and React Native/Expo.

## Features
- Mock phone OTP printed in backend terminal (5-minute expiry, one-time use)
- JWT-protected API and per-user loan ownership
- Add/list loans and mark loans repaid
- Summary: total lent, total repaid, overdue unpaid amount
- Mobile UI highlights overdue loans
- Input validation and duplicate repayment protection

## Requirements
- Node.js 20+ and npm
- PostgreSQL 14+
- Expo Go on a phone, or Android emulator

## 1. Create the database
Start PostgreSQL, then create a database named `miniledger`. For example, in `psql`:

```sql
CREATE DATABASE miniledger;
```

## 2. Run backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`: set `DATABASE_URL` with your PostgreSQL username/password and a long random `JWT_SECRET`.

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

API runs at `http://localhost:4000`. Check `http://localhost:4000/health`.

## 3. Run mobile app

In a second terminal:

```bash
cd mobile
npm install
npx expo start
```

`mobile/App.tsx` defaults to `http://10.0.2.2:4000`, which is the Android emulator's address for the host computer. For a physical phone, change `API_URL` to your computer's LAN IPv4 address, such as `http://192.168.1.20:4000`; ensure phone and computer use the same Wi-Fi and the firewall permits port 4000. For iOS simulator, use `http://localhost:4000`.

## Demo login
1. Enter a phone number with country code, e.g. `+919876543210`.
2. Read the OTP in the backend terminal and enter it in the app.
3. Add a loan with friend name, amount and due date.
4. Use a date before today to demonstrate overdue highlighting.
5. Mark an unpaid loan as repaid and verify summary totals update.

## API overview
All paths are relative to `http://localhost:4000`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/auth/request-otp` | No | Generate mock OTP; body `{ "phone": "+919876543210" }` |
| POST | `/auth/verify-otp` | No | Verify OTP; body `{ "phone": "+919876543210", "otp": "123456" }` |
| GET | `/loans` | Bearer token | List current user's loans |
| POST | `/loans` | Bearer token | Add loan; body `{ "friendName": "Rohan", "amount": 500, "dueDate": "2026-10-30" }` |
| PATCH | `/loans/:id/repay` | Bearer token | Mark loan as repaid |
| GET | `/summary` | Bearer token | Get aggregate totals |

## Summary definitions
- **Total lent:** sum of all loan entries, including repaid entries.
- **Total repaid:** sum of entries marked repaid (this assignment models each loan as fully repaid or unpaid).
- **Overdue amount:** sum of unpaid entries with a due date before the current time.

## Important limitations
This is an internship demo, not production financial software. OTPs are logged to the terminal and stored in memory; OTP state is lost on restart. Add rate limiting, persistent OTP storage, secure production secrets, TLS, and stronger phone verification before real deployment. Receipt upload was intentionally left out until core requirements work.
