# Broadcast roles: who does what in On Air and Traffic

Status: **adopted 2026-10-02.** This is the reference for roles, permissions,
and where things belong in the two broadcast tools. When a feature's home or
gate is unclear, check it against this page; change this page first when the
model itself changes.

Companion documents: `broadcast-operations-strategy.md` (why the broadcast
work is three tools and who owns which tables), `log-design.md`,
`underwriting-design.md`, `fcc-reporting-design.md`.

---

## 1. The principle

Roles are **functional**, not personal. Each one is what a job traditionally
holds at a radio station, whoever holds it and however many a person holds.
At WUWF today one person is program director, traffic manager, and
production; tomorrow those may be three people, or a part-timer may take
production. Nothing about the tools should change when that happens; only
grants should.

So roles **stack**: each is granted separately (`tool_access.tool_roles`, an
array), any combination may sit on one person, and taking one away never
touches the others.

## 2. The tools

| Tool (name staff see) | Route | Key | Holds |
|---|---|---|---|
| **On Air** (was Log) | `/log` | `log` | The broadcast day: program schedule, clocks, automated hours, rundowns, the content library, outside sources, what aired, the DAD log |
| **Traffic** (was Underwriting & Traffic) | `/underwriting` | `underwriting` | Obligations: underwriters, agreements, copy and its DAD cuts, placement, exceptions and makegoods, affidavits |
| **FCC Reporting** (not built) | `/fcc-reporting` | `fcc-reporting` | Compliance records: quarterly issues/programs, the chief operator's weekly reviews |

Routes and keys stay as they were. Only the names people read changed, the
same way Sourcework kept its `transcription` key. Changing a key would touch
every permission check for no gain to anyone using the tools.

## 3. The roles

### Program director (On Air: `program_director`)

Owns the shape of the broadcast day.
- The program schedule: what airs when.
- Clocks: the network structure and WUWF's local overlay, meaning where
  local breaks fall and what each may hold.
- Automated hours: when the station runs unattended. This is a programming
  and staffing decision, like the schedule.
- Content standards and the content library's approvals.

Replaces the old `producer` role.

### Traffic (On Air: `traffic`, plus a Traffic grant)

Owns the log of record: what must air, and proof that it did.
- Turns agreements into placements, including makegoods.
- Places **obligations** into the log: paid credits and the hourly **station
  ID** (47 CFR §73.1201: hourly, as close to the hour as feasible, at a
  natural break). The clock says where the ID position is; traffic sees it's
  filled.
- Releases the day's **DAD log** to automation.
- After air: exceptions and affidavits.

Traditionally traffic produces the whole log of local announcements. At
WUWF hosts own the discretionary ones (§3, On-air staff), which is a
legitimate local split: **traffic owns obligations, hosts own discretion**.

### Production (Traffic: `production`)

Records messages into DAD under their assigned cuts, works from the
**To record** list, and marks each one recorded. A message whose cut is new,
or a live read whose wording changed, needs recording again. A message
that plays an existing DAD spot is already recorded.

Held by the program director today. It is its own role because it moves
independently: stations hand it to a part-timer, a student, or a host.

### Traffic manager (Traffic: `manager`)

The privileged traffic decisions: waiving an obligation, certifying an
affidavit, overriding expired or unapproved copy into a placement.
Unchanged.

### On-air staff (On Air: a grant with no role)

Host-producers of their own shows.
- Fill the remaining local breaks: promos, PSAs, weather, live reads.
- Run the rundown live and record what aired.
- View clocks and the schedule; don't edit them.

### Underwriting representative (Traffic: a grant with no role)

Sells and hands off the signed agreement. In the Portal that means uploading
the agreement and seeing its contract; the rest is traffic's.

### Chief operator (FCC Reporting, later)

A distinct legal role (47 CFR §73.1870): reviews station records weekly, signs
them, starts corrective action. That includes the **EAS** weekly review in
the station procedure "Review EAS logs each week". The Sage ENDEC sends the
required weekly test itself, so EAS is **not** a log item and has no place in
rundowns or the DAD log. When FCC Reporting is built, the weekly review is a
record there.

## 4. Handoffs between the tools

```
Rep ──agreement──▶ Traffic ──placements, station IDs──▶ On Air rundowns
                     │                                     │
                     ├──new cut──▶ Production (To record)  ├──what aired──▶ Traffic (exceptions, affidavits)
                     │                                     │                 FCC Reporting (later)
                     └──release──▶ DAD log ◀── automated hours (Program director)
```

## 5. Where things are found

A function lives where the person who does it already works, even when its
data lives in the other tool:

- **To record:** Traffic → Copy, the "To record" filter, plus a dashboard
  tile.
- **DAD log:** On Air → Today → DAD log, with a dashboard tile in Traffic
  showing the next days' status.
- **Station IDs:** pinned on each clock's page, the same way as any other
  pinned content: one pin per clock, every hour, every day. The clock page
  warns when an hour has no legal ID. (A separate Station IDs page existed
  briefly and was removed on 2026-10-05: the rule for where the ID goes
  doesn't change, so a second screen for the same pins was only something
  else to keep track of.)
- **Automation:** On Air → Automation, its own tab beside Programs (route
  `/log/automated-hours`).

## 6. Permissions

| Action | Who |
|---|---|
| Edit clocks, local opportunities, schedule, programs, automated hours | Program director |
| Pin station IDs and other required content to clock slots | Program director or traffic |
| Release the DAD log | Traffic |
| Mark copy recorded in DAD | Production |
| Waive, certify, override | Traffic manager |
| Fill breaks, run the rundown, record outcomes | Any On Air member |
| Contracts, copy, placement, exception triage | Any Traffic member |

An administrator passes every role check, as everywhere in the Portal.
