# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Feature flags must have a kill date

- **Context**: Feature flags in `src/lib/feature-flags`
- **Problem**: Feature flags without an expiry get silently forgotten and are never removed, accumulating dead code paths and permanent conditional branches.
- **Rule**: Feature flags should always have a kill date; remove or expire the flag once that date passes rather than leaving it in place indefinitely.
- **Applies to**: all
