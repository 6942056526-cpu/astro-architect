// data.js - every number the game uses. Simplified design assumptions are marked "ASSUMPTION".

export const BASE_CHASSIS_MASS = 0.40;   // kg, ASSUMPTION: structure + computer + wiring
export const FUEL_COST_PER_KG = 40000;   // $ per kg of propellant, ASSUMPTION
export const FUEL_MIN = 0.05;            // kg
export const FUEL_MAX = 0.25;            // kg
export const FUEL_DEFAULT = 0.15;        // kg
export const THRUSTER_ISP = 230;         // s, ASSUMPTION: small monopropellant-class thruster

export const missionsData = [
  {
    id: "earth_obs",
    type: "observe",
    title: "🌍 Earth Observation (LEO 400 km)",
    scriptTitle: "Earth Observation LEO 400 km",
    desc: "Low Earth Orbit imaging. Needs power, a camera and attitude control, plus a Delta-V reserve.",
    deltaVNote: "ASSUMPTION: 120 m/s reserve for orbit trim and end-of-life deorbit.",
    budget: 100000,
    maxMass: 1.33,
    startAltKm: 400,
    altitudeKm: 400,
    requiredDeltaV: 120,
    requiredTypes: ["power", "payload", "control"],
    ecc: 0.001
  },
  {
    id: "orbit_raise",
    type: "hohmann",
    title: "🛰️ Orbit Raising (400 km → 800 km)",
    scriptTitle: "Hohmann orbit raising 400 km to 800 km",
    desc: "Hohmann transfer from 400 km to 800 km. Needs power, a comm antenna and attitude control.",
    deltaVNote: "Theory: two-burn Hohmann transfer needs about 216.7 m/s; requirement is rounded up to 220 m/s.",
    budget: 130000,
    maxMass: 1.33,
    startAltKm: 400,
    altitudeKm: 800,
    requiredDeltaV: 220,
    requiredTypes: ["power", "comm", "control"],
    ecc: 0.001
  }
];

// isThruster parts use the fuel slider. type decides which mission requirements the part satisfies.
export const partsData = [
  { id: 1, name: "Deployable Solar Wings", cost: 15000, mass: 0.15, type: "power", ownerRole: "se", desc: "Generates 15 W of power" },
  { id: 2, name: "Optical HD Camera", cost: 30000, mass: 0.30, type: "payload", ownerRole: "ps", desc: "Earth observation payload" },
  { id: 3, name: "X-Band Dish Antenna", cost: 25000, mass: 0.25, type: "comm", ownerRole: "ps", desc: "High-altitude telemetry link" },
  { id: 4, name: "3-Axis Reaction Wheel", cost: 20000, mass: 0.15, type: "control", ownerRole: "se", desc: "Attitude stabilization" },
  { id: 5, name: "Micro-Propulsion Thruster", cost: 15000, mass: 0.05, type: "propulsion", ownerRole: "se", isThruster: true, desc: "Hardware only (0.05 kg). Set the fuel load with the slider (Isp 230 s)" },
  { id: 6, name: "Li-ion Battery Pack", cost: 8000, mass: 0.10, type: "battery", ownerRole: "se", desc: "Keeps power during eclipse (bonus points)" },
  { id: 7, name: "Star Tracker", cost: 15000, mass: 0.08, type: "nav", ownerRole: "se", desc: "Precise pointing and navigation (bonus points)" }
];

export const allRoles = [
  { id: "pm", name: "Project Manager", task: "Approves budget & tracks cost" },
  { id: "se", name: "Systems Engineer", task: "Manages mass, power & propulsion" },
  { id: "ps", name: "Payload Scientist", task: "Installs science & comm instruments" },
  { id: "mc", name: "Mission Commander", task: "Verifies physics & executes launch" }
];