# Implementation Plan - JWT Authorization, Prisma and Page Protection

We will implement JWT authentication (Signup/Signin), user details storage in Prisma, userId routing for the form page, and cookie-based authorization to secure the Form, Interview, and Result pages.

## User Review Required
> [!IMPORTANT]
> The backend server runs at `http://localhost:3001` and the frontend at `http://localhost:3000`. To support secure cookie transmission, CORS must be configured with `credentials: true` and the exact frontend origin specified instead of `*`. We will update the CORS setup accordingly.

## Proposed Changes

### Backend Component

We will install packages `cookie-parser`, `jsonwebtoken`, `bcryptjs` and their `@types/` versions.

#### [MODIFY] [schema.prisma](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/backend/prisma/schema.prisma)
Add a `User` model to the schema:
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
}
```

#### [MODIFY] [index.ts](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/backend/src/index.ts)
- Import `cookie-parser`, `jsonwebtoken`, and `bcryptjs`.
- Update CORS middleware to:
  ```typescript
  app.use(cors({
    origin: ["http://localhost:3000", "http://localhost:5173"], // Support Bun dev server and common frontend ports
    credentials: true
  }));
  ```
- Use `cookieParser()` middleware.
- Add `/api/auth/signup` and `/api/auth/signin` POST endpoints.
- Add `/api/auth/logout` endpoint to clear the authentication cookie.
- Add `/api/auth/me` to verify user session via JWT cookie.
- Implement an authentication middleware.

---

### Frontend Component

#### [NEW] [Signup.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/components/Signup.tsx)
- Create a signup page with a clean, modern form.
- Redirect user to `/signin` upon successful signup.

#### [NEW] [Signin.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/components/Signin.tsx)
- Create a signin page.
- Upon successful signin, redirect to `/?userId=<id>` or store/update state.

#### [MODIFY] [App.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/App.tsx)
- Add routes for `/signup` and `/signin`.
- Wrap the protected routes (`/`, `/interview`, `/result`) in an auth-guard component or perform inline authorization checks checking the cookie/status.

#### [MODIFY] [Form.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/components/Form.tsx)
- Ensure the user enters with a `userId` URL parameter or extract the logged-in user's ID from state/auth context.

---

## Verification Plan

### Automated Tests
- Build both frontend and backend using standard compile checks.
- Verify migrations run correctly.

### Manual Verification
- Attempt to access `/` without being signed in. Verify redirection to `/signin`.
- Sign up a new user, check database contents.
- Sign in, verify cookie is successfully set, and redirected to `/` with the correct `userId` query parameter.
- Test `/interview` and `/result` pages to ensure authorization is required.
