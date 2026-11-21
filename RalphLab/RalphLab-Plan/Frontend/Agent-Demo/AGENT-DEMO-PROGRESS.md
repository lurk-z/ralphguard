---
title: Ralph Lab · Agent demo build log
tags: [ralphlab, frontend, demo, progress]
status: in-progress
updated: 2026-11-20
---

# Ralph Lab · Agent demo build log

## รอบซ้อมล่าสุด · Lab และรายการแชต

ฐานสำหรับวันแข่งขันคือ `jay-frontend` ดู SHA ไฟล์เดิมและวิธีเทียบ Before/After ใน [[JAY-FRONTEND-BASELINE]] งานด้านล่างอยู่ใน working tree ของ `jay-sandbox` ที่ `D:\Github-project\ralphguard` การ checkout เฉพาะ commit อาจได้ไฟล์เดโมไม่ครบ

**เปิดจาก** `/lab-room?agentDemo=1` หรือเลือก Lab ในหน้า `/assess?projectId=<id>&agentDemo=1` โดยใช้โครงการที่มีสิทธิ์เข้าถึง พิมพ์ “ทำสูตรลดสิวให้หน่อย” จาก Director หรือตัวอื่น แล้วตามลิงก์เมื่อ Agent คนที่สามรับงาน ผู้ใช้เห็นห้าบทบาททำงานต่อกันจน Evaluator สรุปข้อดีและข้อมูลที่ยังขาด ตลอดเส้นทางนี้ใช้ข้อมูลสมมติสำหรับซ้อมการสั่งงาน

| สิ่งที่ลอง | พฤติกรรมในเดโม |
|---|---|
| งานคนเดียว | ส่ง “ช่วยตรวจสี่ด้านของ V1” ให้ Analyst แล้วดู checklist และผลตัวอย่างในเธรดส่วนตัว ถ้าถาม “V1 มีอะไรบ้าง” ระบบอ่านข้อความโดยไม่สร้างงาน |
| งานหลายคน | Director รับโจทย์ → Researcher ตรวจหลักฐานตัวอย่าง → Formulation Scientist เตรียมข้อมูล V1 → Analyst อ่าน fixture สี่ด้าน → Evaluator สรุป การรับงานมีรหัสและการตอบรับของตนเอง ส่งซ้ำแล้วยังนับเป็นงานเดิม |
| รายการแชต | ส่วนตัวใช้รูปและชื่อ Agent กลุ่มใช้ชื่อที่สร้างจากโจทย์ด้วยกติกาเดโม แต่ละงานมีรายการ สมาชิก และข้อความล่าสุดของตัวเองแม้ใช้ช่องส่งเหตุการณ์เดียวกัน เปิดกลุ่มจากรายการหรือลิงก์ในแชต ถามความคืบหน้าแล้วกลับมาติดตามได้ |
| บัญชีและอายุข้อมูล | ใช้รูปและตัวตนจาก session ถ้ามี ใช้ตัวแทนสำหรับผู้ใช้เดโม ข้อมูลยังอยู่ในหน่วยความจำ การปิดแผงกับการรีโหลดหน้ามีผลต่างกัน |
| สิ่งที่ยังต้องเชื่อม | การเคลื่อนที่ตาม event, คำถามส่วนตัวพร้อมป้ายแดง, ขวดและรุ่นสูตรใน Nodes, ข้อมูลหลังรีโหลด และ API Agent จริง ตัวเลขและข้อความคัดกรองใน checklist เป็น fixture |

**ไฟล์ที่ต้องอ่านเมื่อใช้โค้ดได้** เปิด `frontend/src/lib/lab-demo/{engine,events,intent,conversations}.ts` สำหรับการสั่ง งาน การรับ และกลุ่ม ต่อ `useAgentDemo.ts`, `DemoConversations.tsx`, `AgentDemoThread.tsx` และ `LabAgentChat.tsx` ใน `frontend/src/components/three/skincare-lab/chat/` เข้ากับ `LabRoomExplorer.tsx` ของ sandbox ตาม [[CODEX-FE-MASTER]] ถ้าใช้ได้เฉพาะ prompt ให้อ่าน [[AGENT-DEMO-CLAUDE-PROMPT]]

รันทดสอบจาก `frontend/` ด้วย `node --experimental-strip-types --test tests/lab-demo-handoff.test.ts tests/lab-demo-command-flow.test.ts tests/lab-demo-conversations.test.ts` ชุดแรกเก็บกรณีส่งงานเดิม ชุดที่สองใช้บทจำลองห้าบทบาทจริงของหน้า Lab ชุดที่สามตรวจรายการแชตและข้อมูลแยกตามงาน

**ผลตรวจรอบวันที่ 20 พ.ย.** ทดสอบเหตุการณ์และแชตผ่าน 22/22 กรณี และ TypeScript ผ่าน ลองใน Chrome ที่ 1280 × 800 โดยพิมพ์จาก Director ตามลิงก์ไปกลุ่ม รอ Evaluator สรุป เปิดดูสมาชิกทั้งห้า ถามงานต่อ แล้วตรวจข้อความล่าสุดและเวลาในรายการ เมื่อปรับเป็น 390 × 844 เปิดกลุ่มเดิมแล้วเห็นข้อความเดิมและคำถามส่วนตัวของ Analyst ยังแยกอยู่ หน้าทดสอบไม่มีข้อยกเว้น JavaScript ที่ Chrome รายงาน รอบนี้ใช้โปรไฟล์ทดสอบแบบ guest

**ชุดส่งต่อสำหรับรอบที่อนุญาตโค้ด** [Lab-Chat-Rehearsal.zip](../../Use-Prepared/Lab-Chat-Rehearsal.zip) มี 50 ไฟล์ ตรวจการแตกชุดกับสำเนาซอร์สจาก `9218cb5` แล้ว ไม่มีชื่อไฟล์ชนกับฐาน TypeScript และทั้ง 22 กรณีผ่านในสำเนานี้ด้วย วิธีต่อ CSS, วางโมเดล และเพิ่มแท็บอยู่ใน [[CODEX-FE-MASTER]]

## Historical checkpoint · milestones 1–4


The sections below record the earlier two-role rehearsal on `jay-sandbox`, including its test totals and limitations at that point. Use the Thai section above for current behavior. See [[AGENT-DEMO-SPEC]], [[AGENT-DEMO-BUILD]] and [[AGENT-DEMO-QA]] for the target workflow.

## Status at a glance

| # | Milestone | State | Proof |
|---|---|---|---|
| 1 | One handoff, end to end, with a lost acknowledgement | Done | Unit tests 1–6 |
| 2 | Lab chat runs on the event model (`?agentDemo=1`) | Done | Checked in the browser, desktop + 375 px |
| 3 | Third assignee moves the job to the project group | Done | Unit tests 7–9 + browser |
| 4 | Progress checklist under each owner's message | Done | Unit tests 10–12 + browser |
| 5 | Private question to the user (red "1") | **Not started** (on hold by request) | — |

---

## 0 · What the existing code did (before this work)

Traced one path from user input to rendering. All paths are under `frontend/src/components/three/skincare-lab/`.

- **Chat input** `chat/LabAgentChat.tsx` → `send()` in `chat/useLabAgentChat.ts`.
  - With `?demoChat=1` it waits 450 ms and returns canned text from `demoReply(agent, progress)` in `agents/handoffDemo.ts`.
  - Otherwise it POSTs to `/api/chat/`.
  - Either way the chat is advisory: it posts a text reply and never creates a task or handoff.
- **Preset sequence** `runWorkflow()` in `agents/workflow.ts`, started by `agents/loopControl.ts` and `agents/LabAgents.tsx`.
  - It walks a fixed list of 12 `HANDOFFS` and publishes `{index, delivered}` up to `LabRoomExplorer.tsx`, which feeds `chat/HandoffSheet.tsx` and the bottom-left badge.
  - "Delivered" only means the walk animation finished. There is no separate acceptance, no IDs and no retry, and what the user types has no effect.
- **Reusable parts**
  - The chat box, history, copy, voice and portraits in `LabAgentChat.tsx`.
  - Thai role names in `agents/roles.ts`.
  - The walk/visit helpers in `workflow.ts`.
  - The sample texts in `handoffDemo.ts`.
- **Note:** `AGENT-DEMO-CLAUDE-PROMPT.md` is not in this folder. It lives in `RalphLab-Plan/Prompt-Only/`.

---

## 1 · Milestone 1 — event model and one handoff

**Goal:** prove that work really changes hands, and that a lost acknowledgement never duplicates anything.

### Design
- **Pure functions, no UI**, in a new folder `frontend/src/lib/lab-demo/`. This is kept separate from `lib/lab-station` (live assessments), so demo data never touches real assessment records.
- **Every screen reads one state** (`LabDemoState`), built only from events by a pure function (`reduce`).
- **Identity on every event:**
  - project, experiment, thread;
  - sender, recipient;
  - task, handoff;
  - plus a per-scope `sequence`.
- **Scope** = user + project + demo mode. The store keeps one state per scope.
- **Duplicate and late events are safe:**
  - The same `eventId` again → ignored.
  - An event for another project → ignored.
  - A retry after acceptance → ignored.
  - A late error after acceptance → ignored. This rule is "never downgrade a delivered job".
- **Retries:**
  - A failed handoff is retried **once automatically** with the **same handoff ID**.
  - If that also fails, the status becomes `failed` and `retry()` offers a manual attempt.
- **Mock recipient (replaceable delivery interface `HandoffTransport`):**
  - Stores receipts by handoff ID. Delivering the same handoff again returns the original receipt.
  - Fault switches for testing: `unreachable` fails before the recipient sees the request; `ack-lost` fails after the recipient has already stored its receipt.

### Events (milestone 1)
`message.user`, `message.agent`, `handoff.sent`, `handoff.attempt_failed`, `handoff.gave_up`, `handoff.accepted`

### Intent rules (no model call)
A fixed set of rules in `intent.ts`:
- **Read-only question** ("V1 มีอะไรบ้าง", "ใน V1 มีน้ำหอมไหม", "ช่วยดู…") → `read`.
- **Instruction** ("ช่วยทำ…", "ลองสูตร…", "เอา…ออก") → `commission`. A new product goal counts as multi-role and goes to the Lab Director.
- **Anything else** → asks a focused question back ("ต้องการให้ดูข้อมูลที่มีอยู่ หรือให้เริ่มทดลองสูตรใหม่?").

### Required case: Analyst → Director, first acknowledgement lost
```
1 message.user →analyst
2 message.agent analyst
3 handoff.sent analyst→director #1
4 handoff.attempt_failed #1 ack-lost
5 handoff.sent analyst→director #2
6 handoff.accepted by director #2 (same receipt as attempt 1)
```
Final counts: **1 handoff · 1 task owned by the Director · 1 acceptance · 0 vials · 0 formula nodes**. The recipient created one receipt and replayed it.

---

## 2 · Milestone 2 — the Lab chat uses the event model

**Goal:** see the handoff in the real chat; switching tabs must not strand the task.

- **New mode `?agentDemo=1`**, separate from the old `?demoChat=1`, which still works as before.
- **The store and engines live at module level** (`chat/useAgentDemo.ts`), above the lifetime of the Lab tab and the chat panel. Closing the chat or going to Nodes mid-send doesn't stop delivery.
- **Handoff line** (`chat/AgentDemoThread.tsx`): "Analyst → Lab Director · D01" plus the task title and a status badge with icon and text:
  - กำลังส่ง
  - กำลังลองส่งอีกครั้ง · ครั้งที่ n
  - ส่งไม่สำเร็จ (with a "ลองอีกครั้ง" button)
  - รับงานแล้ว
- **The reply appears only after acceptance:** the Director's message exists only once `handoff.accepted` has happened.
- **Live totals** above the message box (ส่งงาน, งาน, รับงาน, กลุ่ม, ลิงก์, ขวด, Node), so results can be read off the screen.
- **The mock recipient waits 900 ms per attempt**, so each state is visible.
- **The Lab is tied to the open project:** `assess/page.tsx` now passes `projectId` to the Lab tab. Side effect: normal Lab chat history is now saved per project instead of under one shared "standalone" key.

**Browser results on `localhost:3000`:**

| Case | Seen |
|---|---|
| `demoFault=ack-lost` | "กำลังส่ง" at 0.16 s → attempt 2 at 0.9 s → "รับงานแล้ว" at 1.9 s, one Director reply, totals 1/1/1/0/0 |
| `demoFault=fail-twice` + switch to Nodes mid-send | Delivery continued while the Lab tab was closed → back in Lab: "ส่งไม่สำเร็จ · ครั้งที่ 2", 0 tasks, retry button → click → attempt 3 → accepted, button gone, totals 1/1/1 |
| "V1 มีอะไรบ้าง" | Answered; no task or handoff |
| 375 px | No sideways overflow |

---

## 3 · Milestone 3 — group chat from the third agent

**Goal:** when a third distinct agent takes responsibility for a job, the job continues in the project's only group chat, and the original thread keeps a link.

- **Job** = one user request that can span several handoffs. Each job records:
  - its responsible agents (`assignees`): the starting agent, then each accepted recipient;
  - its origin thread and current thread.
- **The move happens at acceptance, not when the request is sent**, because the spec says viewing a conversation is not taking work.
  - The engine emits `job.promoted` just before the third acceptance, so that acceptance is posted in the group.
- **Effects of the move:**
  - The original thread gets a link: "งานนี้มีผู้รับผิดชอบสามคนแล้ว · ทำต่อในกลุ่มโครงการ".
  - The group gets an opening message: "D01 · งานย้ายมาจากแชตส่วนตัวของ Analyst · ผู้รับผิดชอบ: …".
  - Every speaker in the group carries the experiment label.
- **Clicking the link** switches to the group view, scrolls to that message, focuses it and outlines it for 2.5 s.
- **"ส่วนตัว / กลุ่มโครงการ" switch** appears once a group exists. In the group, the message box is replaced by a note and a "back to private chat" button, because orders and answers belong in private threads.
- **One or two agents** keep working in the original thread, where the second agent joins.
- **Demo script:** the Director passes "ศึกษาเบสล้าง A/B และหลักฐานที่ยังขาด" to the Researcher.

New event: `job.promoted`

**Handoff and move events, with every first acknowledgement lost:**
```
message.user →analyst · message.agent analyst
handoff.sent analyst→director #1 · attempt_failed #1 ack-lost · handoff.sent #2 · accepted by director #2
handoff.sent director→researcher #1 · attempt_failed #1 ack-lost · handoff.sent #2
job.promoted [analyst,director,researcher]
handoff.accepted by researcher #2
```
Counts: 2 handoffs · 2 tasks · 2 acceptances · 1 group · 1 link · 0 vials · 0 Nodes.

---

## 4 · Milestone 4 — progress checklist under each owner's message

**Goal:** each agent's accepted task shows a checklist of observable steps right under its acceptance message, updated in place.

New events: `task.planned` (set the list of steps, once), `task.step` (active / waiting / done), `task.completed`

- **The reducer protects step state:**
  - a finished step never reopens;
  - a repeated update changes nothing;
  - a second plan is ignored;
  - a task completes only when every step is done.
- **Work plan per agent** (`DEMO_PLAYBOOK`), with 1.1 s between steps in the browser:
  - **Lab Director:**
    - อ่านโจทย์และข้อจำกัด
    - กำหนดเกณฑ์และจำนวนรอบ
    - มอบหมาย Researcher — finishes only when the Researcher accepts.
  - **Researcher:**
    - ค้นบันทึกหลักฐาน E01
    - เทียบหน้าที่เบสล้าง A/B — waits "รอหลักฐานความระคายเคืองของเบส B" first.
    - สรุปข้อมูลที่ยังขาด
- **Work runs in the background:** the sender doesn't wait for the recipient, and `idle()` waits for everything (used by tests).
- **If the handoff to the next agent fails twice,** the step waits with "ส่งงานไม่สำเร็จ · รอลองอีกครั้ง". A manual retry finishes both lists.
- **UI (`TaskChecklist`):**
  - Title row "Owner · title · n/3" (or "เสร็จแล้ว"); folds with `aria-expanded`.
  - Each row has an icon plus a screen-reader label (done / working / waiting / not started), with the waiting reason in amber.
  - When the task finishes, a one-line summary appears.
  - Each message keeps its own open/closed state.

**Browser results:**
- **Director:** 0/3 at 2.0 s → 1/3 at 3.1 s → 2/3 at 5.4 s → "มอบหมาย" working at 6.4 s → "เสร็จแล้ว" at 9.2 s. The time on the last step is the lost acknowledgement plus retry.
- **Researcher (in the group):** 0/3 → 1/3 → waiting with the note → 2/3 → 3/3 → "เสร็จแล้ว", in about 7 s. A second job got its own checklist.
- **Folding:** collapsing the Researcher's list did not collapse the Director's list.
- **375 px:** the list spans 16–359 px, no overflow, fold button 36 px tall.

---

## Files

| File | State | Purpose |
|---|---|---|
| `frontend/src/lib/lab-demo/events.ts` | new | Event types, `LabDemoState`, the reducer, `counts()` |
| `frontend/src/lib/lab-demo/intent.ts` | new | Fixed rules for read / commission / clarify, and choosing the owner |
| `frontend/src/lib/lab-demo/engine.ts` | new | Store per scope, `HandoffTransport` + mock recipient, retry, moving jobs to the group, `DEMO_PLAYBOOK`, `idle()` |
| `frontend/tests/lab-demo-handoff.test.ts` | new | 12 tests |
| `frontend/src/components/three/skincare-lab/chat/useAgentDemo.ts` | new | Module-level store and engines; `?demoFault=` |
| `frontend/src/components/three/skincare-lab/chat/AgentDemoThread.tsx` | new | Thread view: handoff line, link, group opening message, experiment label, checklist |
| `frontend/src/components/three/skincare-lab/chat/LabAgentChat.tsx` | edited | Optional `agentDemo` prop; private/group switch; link navigation; totals row |
| `frontend/src/components/three/skincare-lab/LabRoomExplorer.tsx` | edited | Reads `?agentDemo=1`, passes the demo to the chat |
| `frontend/src/app/(dashboard)/assess/page.tsx` | edited | `<SkincareLab embedded projectId={projectId} />` |

`chat/` (the whole folder), `LabRoomExplorer.tsx` and the `RevisionBriefNote` lines in `assess/page.tsx` contain **another person's uncommitted work**. The edits above are small and can be removed on their own. When committing, select by path and keep the local login bypass on the developer's machine. See `CLAUDE.local.md` for the affected paths.

## How to reproduce

**Unit tests** (from `frontend/`):
```bash
node --experimental-strip-types --test tests/lab-demo-handoff.test.ts
```
Running every test file in one command hangs on network tests, so run the files one at a time.

**Browser** (dev server on `localhost:3000`):
1. Open `/assess?projectId=12&agentDemo=1&demoFault=ack-lost` → **Lab** tab → choose the Analyst.
2. Type "ช่วยทำคลีนเซอร์สำหรับผิวเป็นสิวง่ายให้หน่อย".
3. Watch the handoff line, the Director's checklist, and the link → group → the Researcher's checklist.
4. `demoFault` values: `ack-lost` (first acknowledgement lost, every handoff), `fail-twice` (both attempts fail → "ลองอีกครั้ง" button), none (works normally).

The 3D room finishes loading only when the browser pane or window is visible. A page reload starts a new demo.

## Tests (12/12 pass)

| # | Test | Checks |
|---|---|---|
| 1 | Analyst → Director, lost acknowledgement | Event order, one receipt, totals 1/1/1/0/0, Director joins the thread |
| 2 | Re-sent and late events | State object identical; status stays accepted |
| 3 | Two failures → manual retry | Attempt 3 uses the same ID; button disappears; no duplicates |
| 4 | Read-only question | 0 tasks / handoffs / formulas |
| 5 | Two projects | A retry in P1 doesn't change P2; IDs are separate even though both have D01 |
| 6 | Intent rules | read / commission / clarify |
| 7 | Third agent → group | Order of handoff and move events; messages in the right threads; link points to the opening message |
| 8 | No group with ≤ 2 agents; repeated move | Move happens once, one link |
| 9 | Viewing the group, then a new private request | No new participant; Evaluator's question stays private |
| 10 | Checklist follows events | One "done" per step; waiting step recorded; "มอบหมาย" finishes after the Researcher accepts |
| 11 | Re-sent or stale step events | No change at all |
| 12 | Next-agent handoff fails → retry | Step waits, then both lists finish; still 2 handoffs / 2 tasks |

**Checking that the tests can fail:** I broke the code on purpose three times:
- removed the "no downgrade after acceptance" guard → test 2 failed;
- keyed tasks by event ID → test 2 failed;
- let finished steps reopen → test 11 failed.

The code was restored each time.

**Other checks:**
- `npx tsc --noEmit` passes.
- The other test files are unchanged: only `api-request` and `pubchem-online` fail, and they failed before this work.

## Not done or not verified yet

- **Private questions to the user** (red "1", answer once, group gets the decision once) — not started.
- **3D room:**
  - It doesn't move with these events yet: no walking or delivering by event.
  - Early replies aren't held back while the walk speeds up.
  - The overhead "thinking..." label isn't connected.
  - The room still plays its old idle loop.
- **Vials and Nodes:** not built yet.
  - Planned rule: a formula appears in Nodes only after the Analyst closes all four endpoints, each with a result or a reason it is inconclusive.
  - The planned layout follows `docs/ralph-lab/NODES_LINEAGE_TASK.md`, and its behavior follows [[AGENT-DEMO-SPEC]].
- **Small single-role tasks** only get a text reply; no task is created yet.
- **Step text is fixed for the cleanser case:** a toner request shows the same Director and Researcher steps.
- **Demo state lives in memory only:** it is lost on reload, and the demo user is fixed as `demo-user`; it doesn't use the Google session yet.
- **Intent rules** cover only the listed phrasings.
- **The Nodes tab in the dev server** shows "Loading CSS chunk … FormulaGraph failed". This is the old dev cache problem. Fix: stop the dev server → delete `frontend/.next-dev` → `npm run dev`.

## Next milestone (on hold)

**Private question to the user.** The Researcher asks, for example, "จะเก็บผลนี้ไว้เทียบเฉพาะด้านที่มีข้อมูล หรือส่งผู้เชี่ยวชาญทบทวน?". The step waits until the user answers.

**Acceptance test:**
- An unanswered question is listed as pending, and opening the thread doesn't clear it.
- Answering records it once, even if the user answers again or answers a different message.
- The group receives the decision exactly once.
- Another task keeps progressing while the question is open.
