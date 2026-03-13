# Project: paywall-project

## Overview
Personal portfolio + paywall site.

## Stack
- Frontend: Vue 3 + Vite, Vue Router, Axios, SCSS
- Backend: Express, MongoDB/Mongoose, JWT (jsonwebtoken), bcryptjs
- Payments: PayPal SDK (client-side direct) + sandbox API (server-side)
- Platform: Windows 11

## Key File Paths
- Backend entry: `paywall-project/backend/server.js`
- User routes: `paywall-project/backend/routes/userRoutes.js`
- Auth middleware: `paywall-project/backend/middleware/auth.js`
- User controller: `paywall-project/backend/controllers/userController.js`
- User model: `paywall-project/backend/models/userModel.js`
- Auth composable: `paywall-project/frontend/src/composables/useAuth.js`
- Router: `paywall-project/frontend/src/router.js`
- App root: `paywall-project/frontend/src/App.vue`

## Frontend Routes
- `/` → HomePage
- `/login` → LoginPage
- `/signup` → SignupPage
- `/profile` → Profile.vue (full profile management)
- `/dashboard` → Dashboard.vue
- `/donations` → Donations.vue (PayPal)
- `/portfolio` → AboutPortfolio.vue

## API Routes (all under /api/users)
- POST /signup, POST /login — public
- GET /profile — protected
- PUT /subscribe — protected, upgrades isSubscriber
- PUT /update-username — protected
- DELETE /delete-account — protected
- GET /donations-content — protected + paywall
- POST /api/paypal/create-order, POST /api/paypal/capture-order/:id — inline in server.js

## User Model Fields
username, email, password (hashed), isSubscriber (bool, default false)

## Stale/Unused Files (do not import or modify)
- `backend/routes/auth.js` — duplicate, not imported
- `backend/routes/payments.js` — old content, not imported
- `backend/models/Subscription.js` — exists but unused
