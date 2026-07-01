# Review And Hardening Workflow

Use this workflow when a React feature exists and needs to be made release-ready.

## Sequence

1. React Quality Engineer
   - Find defects, regressions, test gaps, and release risks.
2. Accessibility Reviewer
   - Check keyboard behavior, focus, semantics, labels, announcements, contrast, and motion.
3. UX Interaction Designer
   - Recheck confusing states, unclear copy, inefficient paths, and mobile behavior.
4. React Architecture Agent
   - Review state ownership, data flow, async behavior, and component boundaries if issues point to structural problems.
5. DX Tooling Agent
   - Improve scripts or checks when verification is manual, slow, or unreliable.

## Done Criteria

- Findings are fixed or explicitly accepted.
- Tests cover the riskiest user-visible behavior.
- The feature has a clear release note or product summary if customer-facing.
- Verification commands are documented and passing.
