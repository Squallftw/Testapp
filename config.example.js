// BatiTrack — Supabase config.
//
// STEP 1: Copy this file to `config.js`.
// STEP 2: Fill in the values below from your Supabase project:
//           Dashboard → Project Settings → API
//           - `url`      = "Project URL"
//           - `anonKey`  = "anon public" key (the publishable one, NOT service_role)
// STEP 3: Add `<script src="config.js"></script>` BEFORE supabase-client.js
//         in index.html (or just leave the existing tag — it's already wired).
//
// If `config.js` is missing OR the values below are empty, the app falls
// back to localStorage (legacy single-device mode). This makes local dev
// trivial — Supabase only kicks in when configured.
//
// SECURITY: The anon key is meant to be public. RLS policies in
// supabase/schema.sql restrict each user to their own row. NEVER paste
// the `service_role` key here — it bypasses RLS.

window.SUPABASE_CONFIG = {
  url:     '',  // e.g. 'https://abcdefghijklmnop.supabase.co'
  anonKey: ''   // e.g. 'eyJhbGciOi...'  (the long JWT)
};
