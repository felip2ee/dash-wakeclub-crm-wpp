# Parallel Subagent-Driven Development

## Problem

The base subagent-driven-development pattern dispatches one implementer at a
time. That default is safe — but slow when a plan contains genuinely
independent tasks. The naive fix, dispatching every task in parallel, is
risky when ownership and resource use are unclear:

- Two agents can edit the same file concurrently, and one's write silently
  clobbers the other's.
- Two agents can race each other to `git commit`, interleaving unrelated
  changes into a single commit or committing against a stale HEAD.

- Builds and tests can collide through shared output directories, ports,
  databases, or services even when source files differ.

This rule reduces known coordination risks; it does not guarantee that
parallel execution is as safe as serial execution.

## Why this override is safe

The following ownership rules address known failure modes:

- **File collisions** are prevented by only ever forming a wave from tasks
  whose file sets are fully disjoint. If two tasks might touch the same
  file, they never run in the same wave.
- **Commit races** are prevented by removing self-committing from
  implementers entirely. Implementers leave their changes in the working
  tree; when commits are authorized, the controller commits every task's
  changes itself, one at a time, after the wave finishes.

- **Resource collisions** require independent mutable resources for each task,
  including checks, or serialization of the affected work. Worktrees alone
  do not isolate ports, test databases, or external services.

The historical heading describes the intended guardrails, not a universal
safety claim. The coordinator still validates integration and unknown scope.

## Task tagging

At plan time, every task gets three fields:

- **`Files:`** — the exact file paths or globs the task will create or
  modify.
- **`Resources:`** — ports, build directories, test databases, and services
  used by the task or its checks, with their isolation or `none`.
- **`Depends-on:`** — the IDs of tasks whose output this task consumes, or
  `none`.

If any field is missing, or there's genuine uncertainty about what a
task touches or depends on, treat the task as depending on everything
before it. This is the fail-safe: an under-specified task silently
degrades to serial execution instead of risking a false-parallel bug.
Never guess a narrower scope than you actually know.

## Wave formation rule

Two tasks belong in the same wave only if **all** hold:

1. Neither task is in the other's `Depends-on` chain, even transitively.
2. Their `Files` sets are fully disjoint.
3. Their mutable resources are independent or explicitly isolated.

If any condition fails or is uncertain, the later or colliding task moves to a
subsequent wave.

A fully linear dependency chain (task 2 depends on task 1, task 3 depends
on task 2, …) degrades to exactly one task per wave — identical to plain
serial execution. Validate the resource assumptions before dispatch and
serialize when independence cannot be established.

## Per-wave execution loop

For each wave, in order:

1. Write one task brief per task with files, dependencies, resources,
   acceptance criteria, and checks.
2. Dispatch every implementer in the wave in a single message. This is the
   only step where real parallelism happens.
3. Implementers do **not** commit. Each one leaves its changes in the
   working tree and reports back which files it touched.
4. When authorized, the controller commits per task, in wave order — capturing the current
   HEAD fresh immediately before each commit, never a stale or hardcoded
   ref.
5. Dispatch that wave's task reviewers against exact base/head commits plus
   connected callers, contracts, and tests. Without commit authorization, use
   recorded working-tree snapshots. Reviewers remain read-only; run them together
   only when their checks use independent mutable resources. Isolate or serialize
   checks that share resources; review does not authorize fixes or commits.
6. Make exactly one controller-owned log or ledger write for the whole
   wave, not one per task. Concurrent per-task writes to the same log race
   each other and lose updates; a single write after the wave completes
   doesn't.

## Worker failure and recovery

The controller retains the authorized scope when a worker fails. Confirm that the worker has stopped before taking over or reassigning its files; an interrupt request alone is not confirmation. Inspect partial changes and resume from a verified state. While ownership is uncertain, continue only independent work on other files. Retry only with new evidence, within permissions and cost/time/attempt limits; otherwise report the blocker and the condition for resuming.

## Escape hatch

When tasks collide, serialize or combine them. Separate working directories
or Git worktrees with separate branches are optional when their benefit
justifies setup cost; a branch name alone does not isolate files. Assign ports,
build output, databases, and services independently as well. Keep Git operations
under the agreed ownership and authorization. No worktree is required.

## What this does not change

This rule changes orchestration only:

- The specialist type dispatched for each task still comes from your
  project's specialist-routing table, matched to the task's file scope —
  this rule doesn't add or replace agent types.
- The prompt body given to each implementer and reviewer is still the base
  skill's own unmodified contract: ask questions first if the task is
  ambiguous, follow TDD, self-review before reporting, and return an
  explicit status on completion.

Nothing here changes what an agent does with a task. It only changes how
many tasks run at once, and who is allowed to commit.
