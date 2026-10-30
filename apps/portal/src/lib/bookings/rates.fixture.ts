// The v0.1 workbook (WUWF_Production_Rate_Model_v0.1.xlsx) as a typed fixture: the rate
// math's test input, shared by every module whose tests need real figures
// (rates, economics, the happy path). In slice 2b's shape — the workbook's one
// professional and one student are two labor classes, its four pools plus
// webcasting are five pools. The same values 20261005160000_bookings_labor_and_pools.sql seeds.

import type { LaborClassInput, PackageSpec, PoolInput, RateModelInputs } from "./rates";

export const LEAD: LaborClassInput = {
  id: "lead",
  key: "production_lead",
  name: "Production lead",
  payBasis: "salaried",
  annualSalary: 65000,
  hourlyWage: null,
  loadShare: 0.35,
  paidHours: 2080,
  externalRate: 65,
  chargedInStrategic: false,
};

export const STUDENT: LaborClassInput = {
  id: "student",
  key: "student",
  name: "Student / OPS",
  payBasis: "hourly",
  annualSalary: null,
  hourlyWage: 15,
  loadShare: 0.08,
  paidHours: null,
  externalRate: 25,
  chargedInStrategic: true,
};

function pool(
  id: string,
  name: string,
  unitLabel: string,
  share: number | null,
  units: number,
  ownLines: number[] = [],
): PoolInput {
  return {
    id,
    key: id,
    name,
    unitLabel,
    costing: share === null ? "own_lines" : "allocated",
    allocationShare: share,
    availableUnits: units,
    ownLines,
  };
}

export const V01: RateModelInputs = {
  externalMarginShare: 0.25,
  assessmentShare: 0.0671,
  // Broadcast/production equipment contingency, editing computer & accessories,
  // software acquisitions & upgrades, hardware, Adobe Creative Cloud.
  sharedPoolLines: [7000, 3200, 2000, 2000, 1740],
  labor: [LEAD, STUDENT],
  pools: [
    pool("studio", "Studio / control room", "half-day", 0.35, 120),
    pool("field", "Field video package", "day", 0.25, 80),
    pool("live", "Live / multicamera package", "day", 0.3, 60),
    pool("edit", "Edit suite / post-production", "hour", 0.1, 400),
    // The webcasting operating pool, allocated over the planning volume.
    pool("webcast", "Webcast operations", "event", null, 20, [6500]),
  ],
};

function pkg(
  key: string,
  name: string,
  unitLabel: string,
  pro: number,
  student: number,
  units: [studio: number, field: number, live: number, edit: number, webcast: number],
  floor: number,
): PackageSpec {
  return {
    key,
    name,
    unitLabel,
    labor: { lead: pro, student },
    resources: {
      studio: units[0],
      field: units[1],
      live: units[2],
      edit: units[3],
      webcast: units[4],
    },
    marketFloor: floor,
  };
}

export const V01_PACKAGES: PackageSpec[] = [
  pkg("studio_half", "Studio access", "half-day", 1, 2, [1, 0, 0, 0, 0], 250),
  pkg("studio_full", "Studio access", "full day", 2, 3, [2, 0, 0, 0, 0], 450),
  pkg("webcast_basic", "Basic event webcast", "event", 5, 10, [0, 0, 1, 0, 1], 1000),
  pkg("webcast_enhanced", "Enhanced multicamera webcast", "event", 8, 32, [1, 0, 1.5, 0, 1], 1800),
  pkg("field_half", "Field production", "half-day", 4, 8, [0, 0.5, 0, 0, 0], 500),
  pkg("field_full", "Field production", "full day", 8, 16, [0, 1, 0, 0, 0], 900),
  pkg("editing_hour", "Post-production / editing", "hour", 1, 0, [0, 0, 0, 1, 0], 75),
];

