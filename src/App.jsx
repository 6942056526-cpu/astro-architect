import { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

import {
  missionsData, partsData, allRoles,
  FUEL_MIN, FUEL_MAX, FUEL_DEFAULT, FUEL_COST_PER_KG, THRUSTER_ISP,
} from './data.js';
import {
  orbitalState, hohmannDeltaV, designSummary, maxFuelAllowed, evaluateMission,
} from './physics.js';
import { generateGmatScript } from './GMAT.js';

// ---------- 3D: the CubeSat that grows as parts are installed ----------
function CubeSatModel({ parts, isOverweight }) {
  const has = (id) => parts.some((p) => p.id === id);

  return (
    <group>
      <mesh>
        <boxGeometry args={[1.6, 1.6, 1.6]} />
        <meshStandardMaterial color={isOverweight ? '#ef4444' : '#fbbf24'} metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh>
        <boxGeometry args={[1.68, 1.68, 1.68]} />
        <meshStandardMaterial color="#f8fafc" wireframe={true} />
      </mesh>

      {has(1) && (
        <group>
          <mesh position={[-2.2, 0, 0]}>
            <boxGeometry args={[2.3, 0.08, 1.2]} />
            <meshStandardMaterial color="#2563eb" metalness={0.3} roughness={0.2} />
          </mesh>
          <mesh position={[2.2, 0, 0]}>
            <boxGeometry args={[2.3, 0.08, 1.2]} />
            <meshStandardMaterial color="#2563eb" metalness={0.3} roughness={0.2} />
          </mesh>
        </group>
      )}

      {has(2) && (
        <group position={[0, 0, 1.05]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.48, 0.48, 0.65, 32]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.34, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.05, 32]} />
            <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.4} />
          </mesh>
        </group>
      )}

      {has(3) && (
        <group position={[0, -1.15, 0]} rotation={[Math.PI, 0, 0]}>
          <mesh>
            <coneGeometry args={[0.65, 0.55, 32, 1, true]} />
            <meshStandardMaterial color="#ffffff" metalness={0.2} roughness={0.3} side={2} />
          </mesh>
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.6, 16]} />
            <meshStandardMaterial color="#f97316" />
          </mesh>
        </group>
      )}

      {has(4) && (
        <group position={[0, 1.0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.55, 0.55, 0.35, 32]} />

            <meshStandardMaterial color="#10b981" metalness={0.4} roughness={0.2} />
          </mesh>
        </group>
      )}

      {has(5) && (
        <group position={[0, 0, -1.05]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <coneGeometry args={[0.35, 0.5, 24]} />
            <meshStandardMaterial color="#f43f5e" metalness={0.6} roughness={0.2} />
          </mesh>
        </group>
      )}

      {has(6) && (
        <mesh position={[0.95, -0.5, 0]}>
          <boxGeometry args={[0.3, 0.7, 0.9]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.3} />
        </mesh>
      )}

      {has(7) && (
        <mesh position={[-0.95, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.3, 24]} />
          <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.3} />
        </mesh>
      )}
    </group>
  );
}

// ---------- 3D: a simple animation of the orbit (visual only, not a GMAT run) ----------
function OrbitAnimation({ isSuccess }) {
  const satRef = useRef();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 1.5;
    if (satRef.current) {
      satRef.current.position.x = Math.cos(t) * 2.4;
      satRef.current.position.z = Math.sin(t) * 2.4;
    }
  });

  return (
    <group rotation={[0.3, 0, 0.2]}>
      <mesh>
        <sphereGeometry args={[1.1, 32, 32]} />
        <meshStandardMaterial color="#2563eb" roughness={0.4} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.12, 16, 16]} />
        <meshStandardMaterial color="#60a5fa" wireframe={true} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0.15, 0]}>
        <torusGeometry args={[1.8, 0.015, 16, 100]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.4, 0.03, 16, 100]} />
        <meshBasicMaterial color={isSuccess ? '#ef4444' : '#64748b'} />
      </mesh>
      <mesh ref={satRef}>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

const card = { backgroundColor: '#1e293b', padding: '25px', borderRadius: '12px' };

export default function App() {
  const [phase, setPhase] = useState('setup');
  const [selectedMission, setSelectedMission] = useState(missionsData[0]);
  const [selectedRoles, setSelectedRoles] = useState(['pm', 'se', 'ps', 'mc']);
  const [activeTurnRole, setActiveTurnRole] = useState('se');

  const [parts, setParts] = useState([]);
  const [fuelKg, setFuelKg] = useState(FUEL_DEFAULT);
  const [budgetApproved, setBudgetApproved] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [notice, setNotice] = useState('');

  // Everything below is derived from the installed parts (no hidden state, no float bugs).
  const summary = designSummary(selectedMission, parts, fuelKg);
  const orbit = orbitalState(selectedMission.altitudeKm);
  const thruster = parts.find((p) => p.isThruster);
  const hohmann = selectedMission.type === 'hohmann'
    ? hohmannDeltaV(selectedMission.startAltKm, selectedMission.altitudeKm)
    : null;

  const toggleRole = (roleId) => {
    if (selectedRoles.includes(roleId)) {
      if (selectedRoles.length > 1) setSelectedRoles(selectedRoles.filter((r) => r !== roleId));
    } else {
      setSelectedRoles([...selectedRoles, roleId]);
    }
  };

  const startMission = () => {
    setParts([]);
    setFuelKg(FUEL_DEFAULT);
    setBudgetApproved(false);
    setNotice('');
    setActiveTurnRole(selectedRoles[0]);
    setPhase('building');
  };

  const togglePart = (part) => {
    if (parts.find((p) => p.id === part.id)) {
      setParts(parts.filter((p) => p.id !== part.id));
      setBudgetApproved(false);
      setNotice('');
      return;
    }
    const nextParts = [...parts, part];
    let nextFuel = fuelKg;
    if (part.isThruster) {
      const room = maxFuelAllowed(selectedMission, nextParts);
      if (room < FUEL_MIN) {
        setNotice('⚠️ Systems Engineer: not enough mass or budget left for the thruster and its minimum fuel.');
        return;
      }
      nextFuel = Math.min(fuelKg, room);
    }
    const next = designSummary(selectedMission, nextParts, nextFuel);
    if (next.totalMass > selectedMission.maxMass + 1e-9) {
      setNotice(`⚠️ Systems Engineer: total mass would be ${next.totalMass.toFixed(2)} kg, over the ${selectedMission.maxMass} kg limit. Remove a part or lower the fuel.`);
      return;
    }
    if (next.cost > selectedMission.budget) {
      setNotice('⚠️ Project Manager: this would go over the budget.');
      return;
    }
    setParts(nextParts);
    setFuelKg(nextFuel);
    setBudgetApproved(false);
    setNotice('');
  };

  const changeFuel = (value) => {
    const room = maxFuelAllowed(selectedMission, parts);
    const next = Math.min(value, room);
    if (value > room) {
      setNotice('⚠️ That much fuel would break the mass limit or budget, so it was capped.');
    } else {
      setNotice('');
    }
    setFuelKg(next);
    setBudgetApproved(false);
  };

  const handleLaunch = () => {
    if (selectedRoles.includes('pm') && !budgetApproved) {
      setNotice("⚠️ Project Manager must click 'Approve Budget' before launching.");
      return;
    }
    if (parts.length === 0) {
      setNotice('⚠️ Cannot launch an empty chassis.');
      return;
    }
    setNotice('');
    setPhase('launching');
  };

  const downloadGmatScript = () => {
    const blob = new Blob([generateGmatScript(selectedMission, summary)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CubeSat_${selectedMission.id}.script`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (phase === 'launching') {
      const timer = setTimeout(() => setPhase('report'), 3000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // ================= PHASE 1: SETUP =================
  if (phase === 'setup') {
    return (
      <div style={{ padding: '40px', backgroundColor: '#090d16', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h1 style={{ textAlign: 'center', color: '#38bdf8', fontSize: '2.4rem', lineHeight: '1.2', marginBottom: '10px' }}>
  🛰️        AstroArchitect: CubeSat Mission Designer
          </h1>
          <p style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '35px' }}>
            Standard astrodynamics equations + NASA GMAT script export for validation
          </p>

          <div style={{ ...card, marginBottom: '25px' }}>
            <h2 style={{ color: '#f8fafc', marginTop: 0 }}>1. Select Mission Objective</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {missionsData.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMission(m)}
                  style={{
                    padding: '20px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    backgroundColor: selectedMission.id === m.id ? '#0f172a' : '#334155',
                    border: selectedMission.id === m.id ? '2px solid #38bdf8' : '2px solid transparent',
                  }}
                >
                  <h3 style={{ margin: '0 0 10px 0', color: '#38bdf8' }}>{m.title}</h3>
                  <p style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{m.desc}</p>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{m.deltaVNote}</p>
                  <p style={{ fontSize: '0.85rem', color: '#4ade80', margin: '10px 0 0 0' }}>
                    Budget: ${m.budget.toLocaleString()} | Required Δv: {m.requiredDeltaV} m/s
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, marginBottom: '30px' }}>
            <h2 style={{ color: '#f8fafc', marginTop: 0 }}>
              2. Select Active Team Roles ({selectedRoles.length} {selectedRoles.length === 1 ? 'Player' : 'Players'})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
              {allRoles.map((role) => {
                const active = selectedRoles.includes(role.id);
                return (
                  <div
                    key={role.id}
                    onClick={() => toggleRole(role.id)}
                    style={{
                      padding: '15px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: active ? '#064e3b' : '#334155',
                      border: active ? '2px solid #4ade80' : '2px solid transparent',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                      {active ? '✅ ' : '⬜ '} {role.name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '5px' }}>{role.task}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={startMission}
            style={{ width: '100%', padding: '20px', fontSize: '1.4rem', fontWeight: 'bold', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}
          >
            🚀 Enter Assembly Bay
          </button>
        </div>
      </div>
    );
  }

  // ================= PHASE 3: LAUNCHING =================
  if (phase === 'launching') {
    return (
      <div style={{ padding: '50px', backgroundColor: '#05080f', color: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <div style={{ fontSize: '5rem', marginBottom: '20px' }}>🚀</div>
        <h1 style={{ fontSize: '2.4rem', lineHeight: '1.2', color: '#38bdf8', margin: '15px 0' }}>
          Computing orbit insertion...
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#94a3b8' }}>
          Orbital velocity: {orbit.velocityKmS.toFixed(2)} km/s | Tsiolkovsky Δv: {summary.deltaV} m/s
        </p>
      </div>
    );
  }

  // ================= PHASE 4: REPORT =================
  if (phase === 'report') {
    const result = evaluateMission(selectedMission, summary, parts);
    const { missing, hasEnoughDeltaV, success, breakdown, score } = result;

    return (
      <div style={{ padding: '30px', backgroundColor: '#090d16', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', backgroundColor: '#1e293b', padding: '30px', borderRadius: '15px', border: `2px solid ${success ? '#4ade80' : '#ef4444'}` }}>
          <h1 style={{ textAlign: 'center', fontSize: '2.8rem', lineHeight: '1.3', color: success ? '#4ade80' : '#ef4444', margin: '0 0 12px 0' }}>
            {success ? '🎉 MISSION ACCOMPLISHED!' : '💥 MISSION FAILED!'}
          </h1>
          <p style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '25px' }}>
            Orbit animation is illustrative. Validate the numbers by running the exported script in NASA GMAT.
          </p>

          <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '320px', backgroundColor: '#0b132b', borderRadius: '12px', border: '1px solid #38bdf8', overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '10px', left: '12px', zIndex: 10, fontSize: '0.8rem', color: '#38bdf8', backgroundColor: 'rgba(15,23,42,0.85)', padding: '5px 10px', borderRadius: '5px' }}>
                🛰️ Target orbit: SMA = {orbit.smaKm.toFixed(2)} km | Period = {orbit.periodMin.toFixed(1)} min
              </div>
              <Canvas camera={{ position: [0, 3.5, 5.5], fov: 45 }} style={{ height: '350px' }}>
                <ambientLight intensity={1.2} />
                <pointLight position={[10, 10, 10]} intensity={1.5} />
                <OrbitAnimation isSuccess={success} />
                <OrbitControls enablePan={false} />
              </Canvas>
            </div>

            <div style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ backgroundColor: '#0f172a', padding: '18px', borderRadius: '10px', marginBottom: '15px' }}>
                <h3 style={{ color: '#38bdf8', margin: '0 0 10px 0' }}>⚛️ Orbital Physics Telemetry</h3>
                <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
                  <strong>Mass (dry + fuel):</strong> {summary.totalMass.toFixed(2)} kg ({summary.dryMass.toFixed(2)} + {summary.fuel.toFixed(2)})
                </p>
                <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
                  <strong>Orbital velocity:</strong> {orbit.velocityKmS.toFixed(2)} km/s
                </p>
                <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
                  <strong>Delta-V achieved:</strong>{' '}
                  <span style={{ color: hasEnoughDeltaV ? '#4ade80' : '#ef4444', fontWeight: 'bold' }}>
                    {summary.deltaV} m/s (required: {selectedMission.requiredDeltaV} m/s)
                  </span>
                </p>
                {hohmann && (
                  <p style={{ margin: '5px 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                    Hohmann theory: burn 1 = {hohmann.dv1.toFixed(1)} m/s, burn 2 = {hohmann.dv2.toFixed(1)} m/s, total = {hohmann.total.toFixed(1)} m/s
                  </p>
                )}
              </div>

              <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: success ? '#064e3b' : '#7f1d1d', marginBottom: '15px' }}>
                <h3 style={{ margin: '0 0 8px 0' }}>Engineering Evaluation</h3>
                {success ? (
                  <div style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                    <p style={{ margin: '0 0 8px 0' }}>
                      Orbit insertion confirmed. Your thruster provides {summary.deltaV} m/s of Delta-V, enough for the {selectedMission.requiredDeltaV} m/s requirement.
                    </p>
                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>Score: {score} / 100</div>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px', fontSize: '0.85rem' }}>
                      <li>Mission success: {breakdown.base}</li>
                      <li>Budget left over (${summary.remainingBudget.toLocaleString()}): {breakdown.budget} / 20</li>
                      <li>Bonus parts ({result.optionalCount}): {breakdown.bonus} / 20</li>
                      <li>Delta-V margin (≥10% earns 10): {breakdown.deltaV} / 10</li>
                      <li>Mass margin (≥0.05 kg earns 10): {breakdown.massMargin} / 10</li>
                    </ul>
                  </div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.88rem' }}>
                    {!hasEnoughDeltaV && (
                      <li><strong>Insufficient Delta-V ({summary.deltaV} m/s):</strong> install the thruster and add more fuel.</li>
                    )}
                    {missing.includes('power') && <li><strong>No solar wings:</strong> the battery ran out.</li>}
                    {missing.includes('payload') && <li><strong>No HD camera:</strong> missing the Earth observation instrument.</li>}
                    {missing.includes('comm') && <li><strong>No dish antenna:</strong> lost the telemetry link.</li>}
                    {missing.includes('control') && <li><strong>No reaction wheel:</strong> attitude control failed and the spacecraft tumbled.</li>}
                  </ul>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowScriptModal(!showScriptModal)}
                  style={{ flex: 1, padding: '12px', fontSize: '0.95rem', fontWeight: 'bold', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  {showScriptModal ? 'Hide GMAT Script' : '📄 View GMAT Script'}
                </button>
                <button
                  onClick={downloadGmatScript}
                  style={{ flex: 1, padding: '12px', fontSize: '0.95rem', fontWeight: 'bold', backgroundColor: '#10b981', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  ⬇️ Download .script
                </button>
              </div>
            </div>
          </div>

          {showScriptModal && (
            <div style={{ marginTop: '20px', backgroundColor: '#05080f', padding: '15px', borderRadius: '8px', border: '1px solid #38bdf8' }}>
              <div style={{ fontSize: '0.85rem', color: '#38bdf8', marginBottom: '8px' }}>
                💡 In GMAT: File → Open → choose this .script file → press the Run (▶) button.
              </div>
              <pre style={{ margin: 0, color: '#a7f3d0', fontSize: '0.82rem', overflowX: 'auto' }}>
                {generateGmatScript(selectedMission, summary)}
              </pre>
            </div>
          )}

          <button
            onClick={() => setPhase('setup')}
            style={{ width: '100%', marginTop: '20px', padding: '15px', fontSize: '1.1rem', fontWeight: 'bold', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            🔄 Design Another Mission
          </button>
        </div>
      </div>
    );
  }

  // ================= PHASE 2: ASSEMBLY ROOM =================
  const fuelRoleAllowed = !selectedRoles.includes('se') || activeTurnRole === 'se';
  const maxFuelNow = thruster ? Math.min(FUEL_MAX, Math.max(FUEL_MIN, maxFuelAllowed(selectedMission, parts))) : FUEL_MAX;
  const canLaunch = !selectedRoles.includes('mc') || activeTurnRole === 'mc';

  return (
    <div style={{ padding: '20px', backgroundColor: '#090d16', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: '15px 25px', borderRadius: '10px', marginBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#38bdf8' }}>{selectedMission.title}</h2>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Base chassis: 0.40 kg | Target orbit: {selectedMission.altitudeKm} km ({orbit.velocityKmS.toFixed(2)} km/s)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '25px', textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>BUDGET LEFT</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#4ade80' }}>${summary.remainingBudget.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TOTAL MASS</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: summary.totalMass > selectedMission.maxMass - 0.08 ? '#f59e0b' : 'white' }}>
              {summary.totalMass.toFixed(2)} / {selectedMission.maxMass} kg
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>LIVE DELTA-V (Δv)</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: summary.deltaV >= selectedMission.requiredDeltaV ? '#38bdf8' : '#f87171' }}>
              {summary.deltaV} / {selectedMission.requiredDeltaV} m/s
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div style={{ backgroundColor: '#78350f', border: '1px solid #f59e0b', color: '#fde68a', padding: '10px 16px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.9rem' }}>
          {notice}
        </div>
      )}

      {/* Role switcher */}
      <div style={{ backgroundColor: '#1e293b', padding: '10px 20px', borderRadius: '10px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <strong style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>🎮 Active Station:</strong>
        {allRoles.filter((r) => selectedRoles.includes(r.id)).map((role) => (
          <button
            key={role.id}
            onClick={() => setActiveTurnRole(role.id)}
            style={{
              padding: '7px 14px',
              borderRadius: '20px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              backgroundColor: activeTurnRole === role.id ? '#38bdf8' : '#334155',
              color: activeTurnRole === role.id ? '#0f172a' : 'white',
            }}
          >
            {role.name}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '380px', backgroundColor: '#1e293b', padding: '18px', borderRadius: '12px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#f8fafc' }}>🛠️ Subsystem Catalog</h3>

          {partsData.map((part) => {
            const isInstalled = parts.some((p) => p.id === part.id);
            const isRoleAllowed = !selectedRoles.includes(part.ownerRole) || activeTurnRole === part.ownerRole;
            const ownerName = allRoles.find((r) => r.id === part.ownerRole)?.name || '';

            return (
              <div key={part.id} style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '8px', marginBottom: '8px', border: isInstalled ? '1px solid #4ade80' : '1px solid #334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div>
                    <strong style={{ fontSize: '1rem', color: 'white' }}>{part.name}</strong>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{part.desc}</div>
                    <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginTop: '3px' }}>
                      Cost: ${part.cost.toLocaleString()} | <strong>Mass: +{part.mass.toFixed(2)} kg</strong> | Role: {ownerName}
                    </div>
                  </div>
                  <button
                    onClick={() => togglePart(part)}
                    disabled={!isRoleAllowed}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      fontWeight: 'bold',
                      cursor: isRoleAllowed ? 'pointer' : 'not-allowed',
                      backgroundColor: !isRoleAllowed ? '#334155' : (isInstalled ? '#ef4444' : '#3b82f6'),
                      color: !isRoleAllowed ? '#64748b' : 'white',
                    }}
                  >
                    {!isRoleAllowed ? `Locked (${ownerName.split(' ')[0]})` : (isInstalled ? 'Remove' : 'Install')}
                  </button>
                </div>

                {part.isThruster && isInstalled && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.85rem', color: '#e2e8f0', marginBottom: '4px' }}>
                      ⛽ Fuel load: <strong>{summary.fuel.toFixed(2)} kg</strong> → Δv = {summary.deltaV} m/s
                      <span style={{ color: '#94a3b8' }}> (fuel costs ${FUEL_COST_PER_KG.toLocaleString()}/kg, Isp {THRUSTER_ISP} s)</span>
                    </div>
                    <input
                      type="range"
                      min={FUEL_MIN}
                      max={FUEL_MAX}
                      step="0.01"
                      value={fuelKg}
                      disabled={!fuelRoleAllowed}
                      onChange={(e) => changeFuel(parseFloat(e.target.value))}
                      style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      More fuel = more Δv, but more mass and cost. Max allowed right now: {maxFuelNow.toFixed(2)} kg
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {selectedRoles.includes('pm') && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#f59e0b', fontSize: '0.95rem' }}>💼 Project Manager Sign-off</strong>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Required before launch</div>
                </div>
                <button
                  onClick={() => setBudgetApproved(!budgetApproved)}
                  disabled={activeTurnRole !== 'pm'}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 'bold',
                    cursor: activeTurnRole === 'pm' ? 'pointer' : 'not-allowed',
                    backgroundColor: budgetApproved ? '#4ade80' : (activeTurnRole === 'pm' ? '#f59e0b' : '#334155'),
                    color: budgetApproved || activeTurnRole === 'pm' ? '#0f172a' : '#64748b',
                  }}
                >
                  {budgetApproved ? '✅ Approved' : 'Approve Budget'}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleLaunch}
            disabled={!canLaunch}
            style={{
              marginTop: '15px',
              width: '100%',
              padding: '14px',
              fontSize: '1.15rem',
              fontWeight: 'bold',
              borderRadius: '8px',
              border: 'none',
              cursor: canLaunch ? 'pointer' : 'not-allowed',
              backgroundColor: canLaunch ? '#ef4444' : '#334155',
              color: canLaunch ? 'white' : '#64748b',
            }}
          >
            {canLaunch ? '🚀 LAUNCH CUBESAT' : '🔒 Switch to Mission Commander to Launch'}
          </button>
        </div>

        <div style={{ flex: 1, minWidth: '380px', backgroundColor: '#0b132b', borderRadius: '12px', border: '2px solid #38bdf8', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10, backgroundColor: 'rgba(15, 23, 42, 0.85)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', color: '#f8fafc' }}>
            🖱️ Drag to rotate | Scroll to zoom
          </div>

          <Canvas camera={{ position: [3.8, 2.8, 4.8], fov: 45 }} style={{ height: '600px' }}>
            <ambientLight intensity={1.3} />
            <directionalLight position={[10, 10, 10]} intensity={2.0} color="#ffffff" />
            <directionalLight position={[-10, -10, -5]} intensity={1.0} color="#93c5fd" />
            <hemisphereLight skyColor="#ffffff" groundColor="#1e293b" intensity={0.8} />

            <CubeSatModel parts={parts} isOverweight={summary.totalMass > selectedMission.maxMass} />

            <OrbitControls enablePan={false} />
          </Canvas>
        </div>
      </div>
    </div>
  );
}
