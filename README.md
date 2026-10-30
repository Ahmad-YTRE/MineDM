# Voax

**A lightweight place to chat, chill, and have fun.**

Voax is a real-time chat platform for friends and gaming communities. Organize conversations, build communities with servers and channels, and keep in touch through direct messages.

**Live app:** https://voax.vercel.app  
**Repository:** https://github.com/Ahmad-YTRE/Voax **Main Repository:** https://github.com/Shahadah-Studs/Voax

## Features

- **Accounts and profiles** — Sign up and sign in, with profile details and avatars.
- **Direct messages** — Chat privately with friends.
- **Servers and channels** — Organize community conversations by server and channel.
- **Friends** — Connect with other users and manage friend requests.
- **Real-time messaging** — Keep conversations up to date with Supabase Realtime.
- **Message reactions** — React to messages in conversations.
- **Attachments** — Share message attachments.
- **Presence and status** — See user presence and status information.
- **Roles and permissions** — Organize server members with server roles.
- **Invites** — Share server invite links to help others join.
- **Notifications** — Configure notification preferences and server/channel overrides.
- **Themes and appearance** — Personalize the interface.
- **Documentation** — A user guide is available in the app at `/docs`.
- **Progressive Web App (PWA)** — Install Voax on supported desktop and mobile devices.
- **Responsive interface** — Designed to work across different screen sizes.

> Feature availability may depend on the current app version and account permissions.

## Tech stack

| Technology | Purpose |
| --- | --- |
| [React](https://react.dev/) | Component-based user interface |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe application code |
| [Vite](https://vite.dev/) | Development server and production build |
| [Supabase](https://supabase.com/) | PostgreSQL database, authentication, realtime features, and storage |
| [Supabase JavaScript client](https://supabase.com/docs/reference/javascript/introduction) | Client-side communication with Supabase |
| [Vercel](https://vercel.com/) | Hosting and deployments |

## Latest updates

**October 29, 2026**

- Reduced repeated Supabase profile reads with a short-lived in-memory cache.
- Consolidated server and channel notification-override reads into one scoped query.
- Fixed DM profile lookup fallback so non-UUID public IDs do not trigger invalid UUID lookups.
- Batched signed URL creation for message attachments to reduce per-message Storage requests.
- Avoided unnecessary message reloads and realtime resubscriptions when unrelated workspace data refreshes.

These optimizations aim to reduce unnecessary requests while preserving the existing live database, access controls, and realtime presence flow. The profile cache may keep profile details in memory for up to 30 seconds.

## Getting started

### Requirements

- Node.js and npm
- A Supabase project with the database schema and environment configuration expected by the app

### Install dependencies

```bash
npm install
```

### Configure environment

Create a local `.env` file and provide the Supabase environment variables required by the app. Check the application's Supabase client setup for the exact variable names. **Never commit secret keys or service-role credentials.**

### Run locally

```bash
npm run dev
```

### Build for production

```bash
npm run build
npm run preview
```

## Deployment

The app is configured for Vercel deployment. Production deployments are triggered from the repository's connected Git branch.

## Contributing and bug reports

Found a bug or have an idea? Open an issue in the [GitHub repository](https://github.com/Shahadah-studs/Voax) with steps to reproduce the problem and any relevant details. Please do not include passwords, access tokens, or other secrets.

---

Made for friends, teams, and communities. **Chat. Chill. Have Fun.**
---

**&copy; Shahadah Studios Elite and BloxdLabs**
