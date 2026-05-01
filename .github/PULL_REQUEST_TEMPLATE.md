## Summary

<!-- What does this PR do? One or two sentences. -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor / chore
- [ ] Database migration (add label `migration` to this PR)

## Related issue

<!-- Closes #123 — or "None" -->

## Database migration

- [ ] This PR does NOT include a database migration
- [ ] This PR includes a migration: `supabase/migrations/<file>.sql`
  - [ ] Migration tested on a local/dev Supabase project
  - [ ] Migration must be applied to all environments BEFORE merging (code depends on schema change)
  - [ ] `supabase/schema.sql` snapshot updated

## Testing

<!-- Describe how you tested this. At minimum: what you clicked, what you observed. -->

- [ ] TypeScript check passes: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`
- [ ] Affected feature tested end-to-end in browser
- [ ] Light mode and dark mode both look correct (for UI changes)
- [ ] Invite / auth flow tested (for changes touching auth or invites)

## AI changes

- [ ] This PR does NOT add or modify an AI action
- [ ] This PR adds/modifies an AI action
  - Action name: `_______________`
  - Token usage is logged via the existing `ai_usage_log` pattern: [ ] Yes

## Notes for reviewers

<!-- Anything non-obvious the reviewer should know. Known limitations, trade-offs, follow-up work. -->
