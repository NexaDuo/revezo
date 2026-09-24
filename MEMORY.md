# mARC Memory

- `[EXPIRES: 2026-12-31]` Beta workflow overrides: batch changes locally, commit directly to `main` when the user signals it's time, do NOT record on the board or create issues, and run `@sec` review ONLY over the batched diff right before committing to `main` (skip `@rev`). (Trigger: any new work dispatch).
