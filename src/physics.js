// physics.js - pure functions (no React) so they are easy to test and explain.
import { BASE_CHASSIS_MASS, FUEL_COST_PER_KG, FUEL_MIN, FUEL_MAX, THRUSTER_ISP } from './data.js';

export const MU = 398600.4418;      // km^3/s^2, Earth gravitational parameter
export const EARTH_R = 6378.14;     // km, Earth equatorial radius
export const G0 = 9.80665;          // m/s^2, standard gravity

export const round3 = (x) => Math.round(x * 1000) / 1000;

// Circular-orbit velocity (vis-viva for a circle): v = sqrt(mu / r), and period T = 2*pi*sqrt(r^3 / mu)
export function orbitalState(altKm) {
  const r = EARTH_R + altKm;
  return {
    smaKm: r,
    velocityKmS: Math.sqrt(MU / r),
    periodMin: (2 * Math.PI * Math.sqrt((r ** 3) / MU)) / 60,
  };
}

// Hohmann transfer between two circular orbits. Returns Delta-V in m/s.
export function hohmannDeltaV(h1Km, h2Km) {
  const r1 = EARTH_R + h1Km;
  const r2 = EARTH_R + h2Km;
  const a = (r1 + r2) / 2;
  const v1 = Math.sqrt(MU / r1);
  const v2 = Math.sqrt(MU / r2);
  const vPeri = Math.sqrt(MU * (2 / r1 - 1 / a));
  const vApo = Math.sqrt(MU * (2 / r2 - 1 / a));
  const dv1 = (vPeri - v1) * 1000;
  const dv2 = (v2 - vApo) * 1000;
  return { dv1, dv2, total: dv1 + dv2 };
}

// Tsiolkovsky rocket equation: dv = Isp * g0 * ln(m_initial / m_final)
export function tsiolkovskyDeltaV(isp, mInitial, mFinal) {
  if (isp <= 0 || mFinal <= 0 || mInitial <= mFinal) return 0;
  return isp * G0 * Math.log(mInitial / mFinal);
}

// Everything about the current design in one object.
export function designSummary(mission, parts, fuelKg) {
  const thruster = parts.find((p) => p.isThruster);
  const fuel = thruster ? round3(fuelKg) : 0;
  const partsMass = parts.reduce((s, p) => s + p.mass, 0);
  const dryMass = round3(BASE_CHASSIS_MASS + partsMass);
  const totalMass = round3(dryMass + fuel);
  const cost = Math.round(parts.reduce((s, p) => s + p.cost, 0) + fuel * FUEL_COST_PER_KG);
  const deltaV = thruster ? Math.round(tsiolkovskyDeltaV(THRUSTER_ISP, totalMass, dryMass)) : 0;
  return {
    fuel, dryMass, totalMass, cost, deltaV,
    remainingBudget: mission.budget - cost,
    massMargin: round3(mission.maxMass - totalMass),
  };
}

// Largest fuel load (kg) that still fits the mass limit and budget for this parts list.
export function maxFuelAllowed(mission, parts) {
  const dry = BASE_CHASSIS_MASS + parts.reduce((s, p) => s + p.mass, 0);
  const costNoFuel = parts.reduce((s, p) => s + p.cost, 0);
  const byMass = mission.maxMass - dry;
  const byBudget = (mission.budget - costNoFuel) / FUEL_COST_PER_KG;
  const limit = Math.min(FUEL_MAX, byMass, byBudget);
  return Math.max(0, Math.floor(limit * 100 + 1e-9) / 100);
}

// Mission result + score. Score only counts if the mission succeeds.
export function evaluateMission(mission, summary, parts) {
  const types = parts.map((p) => p.type);
  const missing = mission.requiredTypes.filter((t) => !types.includes(t));
  const hasEnoughDeltaV = summary.deltaV >= mission.requiredDeltaV;
  const success = missing.length === 0 && hasEnoughDeltaV;

  const optionalCount = parts.filter(
    (p) => p.type !== 'propulsion' && !mission.requiredTypes.includes(p.type)
  ).length;

  let breakdown = null;
  let score = 0;
  if (success) {
    const dvMargin = (summary.deltaV - mission.requiredDeltaV) / mission.requiredDeltaV;
    breakdown = {
      base: 40,
      budget: Math.round(20 * Math.max(0, summary.remainingBudget) / mission.budget),
      bonus: Math.min(20, optionalCount * 10),
      deltaV: dvMargin >= 0.10 ? 10 : 5,
      massMargin: summary.massMargin >= 0.05 ? 10 : 0,
    };
    score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  }
  return { missing, hasEnoughDeltaV, success, optionalCount, breakdown, score };
}