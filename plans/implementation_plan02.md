
# Implementation Plan - Name Profile & Dark/Light Mode Navbar

We will implement the following changes:
1. **Database Schema & Signup**: Add `name` field to the `User` model in Prisma, run a new migration, and update the backend signup API.
2. **Global Dark/Light Theme**: Create a React theme state/context or use a class-based approach (e.g., toggling `.dark` class on the `<html>` or `<body>` element, or a simple context) and update styling across all pages to support both modes.
3. **Sticky Navbar**: Implement a beautiful, sticky navbar at the top of the protected pages (`Form.tsx`, `Interview.tsx`, and `Result.tsx`) containing the profile name, day/night mode toggle, and logout button.

## User Review Required
> [!IMPORTANT]
> The database schema changes require running a new Prisma migration to add the `name` column to the `User` table. If the database already contains users, we can make it optional or set a default value. We will make it optional (`String?`) to prevent breaking existing data.

## Proposed Changes

### Backend Component

#### [MODIFY] [schema.prisma](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/backend/prisma/schema.prisma)
Add `name` field to `User` model:
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String?  // Optional name field
  createdAt DateTime @default(now())
}
```

#### [MODIFY] [index.ts](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/backend/src/index.ts)
- Update `/api/auth/signup` to accept `name` from the request body and save it in the database.
- Update `/api/auth/me` to return the `name` in the payload.

---

### Frontend Component

#### [NEW] [Navbar.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/components/Navbar.tsx)
Create a new `Navbar` component:
- Sticky to the top (`sticky top-0 z-50 backdrop-blur-md`).
- Renders:
  - Day/Night (Light/Dark) toggle button.
  - User's profile name/initials.
  - Log Out button.

#### [MODIFY] [Signup.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/components/Signup.tsx)
Add a "Full Name" input field to the signup form.

#### [MODIFY] [App.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/App.tsx)
- Integrate a global Theme Context or state (Light vs Dark mode).
- Apply appropriate background and text classes based on active theme state.

#### [MODIFY] [Form.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/components/Form.tsx), [Interview.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/components/Interview.tsx), [Result.tsx](file:///Users/sayan/Harkirat%20practices/mercor/ai-interviewer/frontend/src/components/Result.tsx)
- Add the sticky Navbar at the top of these pages.
- Align page background/text styling to use the active theme state.

---

## Verification Plan

### Automated Tests
- Run `npx prisma migrate dev` to generate migration for the new `name` field.
- Verify backend builds successfully.

### Manual Verification
- Test signing up with a name.
- Verify user's name displays in the sticky navbar.
- Verify dark/light mode toggle works, changing backgrounds and text colors on all pages.
