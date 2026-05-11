import { useState, useEffect } from "react";
import {
  registerVehicle,
  issuePermit,
  logViolation,
  authorizeTow,
  lookupVehicle,
  getVehiclesForUnit,
  getAllParkingViolations,
  type Vehicle,
  type Permit,
  type ParkingViolation,
  type PermitType,
  type NoticeType,
} from "@/services/parking";

const styles = {
  ink:       "#0E0E0C",
  paper:     "#F7F6F2",
  rule:      "#C8C3B8",
  rust:      "#C94C2E",
  inkLight:  "#7A7268",
  accent:    "#2563EB",
  serif:     "'Playfair Display', Georgia, serif",
  mono:      "'IBM Plex Mono', monospace",
  sans:      "'IBM Plex Sans', sans-serif",
};

type Tab = "vehicles" | "violations" | "lookup";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

function permitTypeKey(pt: PermitType): string { return Object.keys(pt)[0]; }
function noticeTypeKey(nt: NoticeType): string  { return Object.keys(nt)[0]; }

export default function ParkingPage() {
  const [tab, setTab] = useState<Tab>("vehicles");

  // vehicles tab
  const [vehicles,     setVehicles]     = useState<Vehicle[]>([]);
  const [unitSearch,   setUnitSearch]   = useState("");
  const [vMake,        setVMake]        = useState("");
  const [vModel,       setVModel]       = useState("");
  const [vYear,        setVYear]        = useState("");
  const [vColor,       setVColor]       = useState("");
  const [vPlate,       setVPlate]       = useState("");
  const [vState,       setVState]       = useState("TX");
  const [vUnit,        setVUnit]        = useState("");
  const [vehicleError, setVehicleError] = useState("");
  const [registering,  setRegistering]  = useState(false);

  // permit form state (per vehicle)
  const [issuingFor,   setIssuingFor]   = useState<string | null>(null);
  const [permitType,   setPermitType]   = useState("Resident");
  const [issuingPermit, setIssuingPermit] = useState(false);
  const [vehiclePermits, setVehiclePermits] = useState<Record<string, Permit[]>>({});

  // violations tab
  const [violations,   setViolations]   = useState<ParkingViolation[]>([]);
  const [pvPlate,      setPvPlate]      = useState("");
  const [pvState,      setPvState]      = useState("TX");
  const [pvLocation,   setPvLocation]   = useState("");
  const [pvDesc,       setPvDesc]       = useState("");
  const [pvNotice,     setPvNotice]     = useState("Warning");
  const [pvError,      setPvError]      = useState("");
  const [loggingPv,    setLoggingPv]    = useState(false);

  // lookup tab
  const [lookupPlate,  setLookupPlate]  = useState("");
  const [lookupState,  setLookupState]  = useState("TX");
  const [lookupResult, setLookupResult] = useState<Vehicle | null | undefined>(undefined);
  const [looking,      setLooking]      = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const allViolations = await getAllParkingViolations();
    setViolations(allViolations.sort((alpha, beta) => Number(beta.createdAt - alpha.createdAt)));
  }

  async function handleSearchUnit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!unitSearch.trim()) return;
    const found = await getVehiclesForUnit(unitSearch.trim());
    setVehicles(found);
  }

  async function handleRegister(evt: React.FormEvent) {
    evt.preventDefault();
    setVehicleError("");
    setRegistering(true);
    const result = await registerVehicle(vUnit, vMake, vModel, parseInt(vYear) || 0, vColor, vPlate, vState);
    setRegistering(false);
    if ("err" in result) {
      setVehicleError(Object.values(result.err)[0] as string || "Registration failed");
      return;
    }
    setVMake(""); setVModel(""); setVYear(""); setVColor(""); setVPlate(""); setVUnit("");
    setVehicles(prev => [result.ok, ...prev]);
  }

  async function handleIssuePermit(vehicleId: string) {
    setIssuingPermit(true);
    const result = await issuePermit(vehicleId, { [permitType]: null } as PermitType, []);
    setIssuingPermit(false);
    if ("ok" in result) {
      setVehiclePermits(prev => ({
        ...prev,
        [vehicleId]: [...(prev[vehicleId] ?? []), result.ok],
      }));
    }
    setIssuingFor(null);
  }

  async function handleLogViolation(evt: React.FormEvent) {
    evt.preventDefault();
    setPvError("");
    setLoggingPv(true);
    const result = await logViolation(pvPlate, pvState, pvLocation, pvDesc, [], { [pvNotice]: null } as NoticeType);
    setLoggingPv(false);
    if ("err" in result) {
      setPvError(Object.values(result.err)[0] as string || "Failed to log violation");
      return;
    }
    setPvPlate(""); setPvState("TX"); setPvLocation(""); setPvDesc(""); setPvNotice("Warning");
    setViolations(prev => [result.ok, ...prev]);
  }

  async function handleAuthorizeTow(violationId: string) {
    const result = await authorizeTow(violationId);
    if ("ok" in result) {
      setViolations(prev => prev.map(pv => pv.id === violationId ? result.ok : pv));
    }
  }

  async function handleLookup(evt: React.FormEvent) {
    evt.preventDefault();
    setLooking(true);
    const found = await lookupVehicle(lookupState, lookupPlate.toUpperCase());
    setLookupResult(found);
    setLooking(false);
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.08em",
    textTransform: "uppercase", color: styles.inkLight, display: "block", marginBottom: "0.3rem",
  };
  const inputStyle: React.CSSProperties = {
    padding: "0.4rem", border: `1px solid ${styles.rule}`,
    fontFamily: styles.sans, fontSize: "0.85rem", width: "100%", boxSizing: "border-box",
  };
  const btnStyle: React.CSSProperties = {
    padding: "0.4rem 0.9rem", background: styles.ink, color: "#fff", border: "none",
    fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
    textTransform: "uppercase", cursor: "pointer",
  };

  return (
    <div>
      <h2 style={{ fontFamily: styles.serif, fontSize: "1.25rem", margin: "0 0 1.5rem", color: styles.ink }}>
        Parking Management
      </h2>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${styles.rule}`, marginBottom: "1.5rem" }}>
        {(["vehicles", "violations", "lookup"] as Tab[]).map(tabOption => (
          <button key={tabOption} onClick={() => setTab(tabOption)}
            style={{
              padding: "0.5rem 1.25rem", border: "none", background: "none", cursor: "pointer",
              fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: tab === tabOption ? styles.ink : styles.inkLight,
              borderBottom: tab === tabOption ? `2px solid ${styles.ink}` : "2px solid transparent",
              marginBottom: "-1px",
            }}>
            {tabOption === "vehicles" ? "Vehicles & Permits" : tabOption === "violations" ? "Violations" : "Plate Lookup"}
          </button>
        ))}
      </div>

      {/* ── Vehicles & Permits ── */}
      {tab === "vehicles" && (
        <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
          {/* Register form */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <p style={{ fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: styles.inkLight, margin: "0 0 0.75rem" }}>Register Vehicle</p>
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {[
                { label: "Unit ID",  value: vUnit,  setter: setVUnit  },
                { label: "Make",     value: vMake,  setter: setVMake  },
                { label: "Model",    value: vModel, setter: setVModel },
                { label: "Year",     value: vYear,  setter: setVYear  },
                { label: "Color",    value: vColor, setter: setVColor },
                { label: "Plate",    value: vPlate, setter: setVPlate },
              ].map(field => (
                <div key={field.label}>
                  <label style={labelStyle}>{field.label}</label>
                  <input value={field.value} onChange={evt => field.setter(evt.target.value)} required style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={labelStyle}>State</label>
                <select value={vState} onChange={evt => setVState(evt.target.value)} style={{ ...inputStyle, background: "#fff" }}>
                  {US_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              {vehicleError && <p style={{ color: styles.rust, fontFamily: styles.mono, fontSize: "0.7rem", margin: 0 }}>{vehicleError}</p>}
              <button type="submit" disabled={registering} style={btnStyle}>
                {registering ? "Registering…" : "Register"}
              </button>
            </form>
          </div>

          {/* Vehicle list by unit */}
          <div style={{ flex: 1 }}>
            <form onSubmit={handleSearchUnit} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input
                value={unitSearch}
                onChange={evt => setUnitSearch(evt.target.value)}
                placeholder="Unit ID to search…"
                style={{ ...inputStyle, width: "auto", flex: 1 }}
              />
              <button type="submit" style={btnStyle}>Search</button>
            </form>
            {vehicles.length === 0 ? (
              <p style={{ fontFamily: styles.mono, fontSize: "0.7rem", color: styles.inkLight }}>No vehicles loaded. Search by unit ID or register one.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {vehicles.map(vehicle => (
                  <div key={vehicle.id} style={{ padding: "1rem", border: `1px solid ${styles.rule}`, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: styles.sans, fontSize: "0.95rem", fontWeight: 500, color: styles.ink }}>
                        {vehicle.year.toString()} {vehicle.make} {vehicle.model}
                      </span>
                      <span style={{ fontFamily: styles.mono, fontSize: "0.7rem", fontWeight: 700, color: styles.ink }}>
                        {vehicle.plateState} · {vehicle.licensePlate}
                      </span>
                    </div>
                    <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight, marginTop: "0.25rem" }}>
                      {vehicle.color} · Unit {vehicle.unitId} · {vehicle.id}
                    </div>

                    {/* Permit sub-section */}
                    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `1px solid ${styles.rule}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase", color: styles.inkLight }}>Permits</span>
                        <button onClick={() => setIssuingFor(issuingFor === vehicle.id ? null : vehicle.id)}
                          style={{ fontFamily: styles.mono, fontSize: "0.55rem", letterSpacing: "0.06em", textTransform: "uppercase", background: "none", border: `1px solid ${styles.rule}`, color: styles.inkLight, padding: "0.2rem 0.5rem", cursor: "pointer" }}>
                          + Issue
                        </button>
                      </div>
                      {issuingFor === vehicle.id && (
                        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <select value={permitType} onChange={evt => setPermitType(evt.target.value)}
                            style={{ padding: "0.3rem", border: `1px solid ${styles.rule}`, fontFamily: styles.sans, fontSize: "0.8rem", background: "#fff" }}>
                            <option value="Resident">Resident</option>
                            <option value="Guest">Guest</option>
                            <option value="Temporary">Temporary</option>
                          </select>
                          <button onClick={() => handleIssuePermit(vehicle.id)} disabled={issuingPermit}
                            style={{ ...btnStyle, padding: "0.3rem 0.6rem", fontSize: "0.6rem" }}>
                            {issuingPermit ? "Issuing…" : "Issue"}
                          </button>
                        </div>
                      )}
                      {(vehiclePermits[vehicle.id] ?? []).map(permit => (
                        <div key={permit.id} style={{ marginTop: "0.4rem", fontFamily: styles.mono, fontSize: "0.65rem", color: styles.ink }}>
                          <span style={{ fontWeight: 700 }}>{permit.permitNumber}</span>
                          {" — "}{permitTypeKey(permit.permitType)}
                          {permit.expiresAt.length > 0 && (
                            <span style={{ color: styles.inkLight }}> · expires {new Date(Number(permit.expiresAt[0]!) / 1_000_000).toLocaleDateString()}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Violations ── */}
      {tab === "violations" && (
        <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
          {/* Log form */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <p style={{ fontFamily: styles.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: styles.inkLight, margin: "0 0 0.75rem" }}>Log Violation</p>
            <form onSubmit={handleLogViolation} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div>
                <label style={labelStyle}>License Plate</label>
                <input value={pvPlate} onChange={evt => setPvPlate(evt.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <select value={pvState} onChange={evt => setPvState(evt.target.value)} style={{ ...inputStyle, background: "#fff" }}>
                  {US_STATES.map(stateCode => <option key={stateCode} value={stateCode}>{stateCode}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input value={pvLocation} onChange={evt => setPvLocation(evt.target.value)} required placeholder="Lot B, Space 14" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea value={pvDesc} onChange={evt => setPvDesc(evt.target.value)} required rows={3}
                  style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div>
                <label style={labelStyle}>Notice Type</label>
                <div style={{ display: "flex", gap: "1rem" }}>
                  {["Warning", "Tow"].map(noticeOption => (
                    <label key={noticeOption} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontFamily: styles.sans, fontSize: "0.85rem" }}>
                      <input type="radio" name="notice" value={noticeOption} checked={pvNotice === noticeOption} onChange={evt => setPvNotice(evt.target.value)} />
                      {noticeOption}
                    </label>
                  ))}
                </div>
              </div>
              {pvError && <p style={{ color: styles.rust, fontFamily: styles.mono, fontSize: "0.7rem", margin: 0 }}>{pvError}</p>}
              <button type="submit" disabled={loggingPv} style={btnStyle}>
                {loggingPv ? "Logging…" : "Log Violation"}
              </button>
            </form>
          </div>

          {/* Violations list */}
          <div style={{ flex: 1 }}>
            {violations.length === 0 ? (
              <p style={{ fontFamily: styles.mono, fontSize: "0.7rem", color: styles.inkLight }}>No parking violations logged.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {violations.map(pv => (
                  <div key={pv.id} style={{ padding: "1rem", border: `1px solid ${pv.towAuthorized ? styles.rust : styles.rule}`, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
                      <span style={{ fontFamily: styles.mono, fontSize: "0.75rem", fontWeight: 700, color: styles.ink }}>
                        {pv.plateState} · {pv.licensePlate}
                      </span>
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase", color: noticeTypeKey(pv.noticeType) === "Tow" ? styles.rust : styles.inkLight }}>
                          {noticeTypeKey(pv.noticeType)}
                        </span>
                        {pv.towAuthorized && (
                          <span style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.rust, fontWeight: 700 }}>TOW AUTHORIZED</span>
                        )}
                        {!pv.towAuthorized && noticeTypeKey(pv.noticeType) === "Tow" && (
                          <button onClick={() => handleAuthorizeTow(pv.id)}
                            style={{ fontFamily: styles.mono, fontSize: "0.55rem", textTransform: "uppercase", background: styles.rust, color: "#fff", border: "none", padding: "0.2rem 0.5rem", cursor: "pointer" }}>
                            Authorize Tow
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontFamily: styles.sans, fontSize: "0.85rem", color: styles.ink, marginBottom: "0.25rem" }}>{pv.description}</div>
                    <div style={{ fontFamily: styles.mono, fontSize: "0.6rem", color: styles.inkLight }}>{pv.location} · {pv.id}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Plate Lookup ── */}
      {tab === "lookup" && (
        <div style={{ maxWidth: 480 }}>
          <form onSubmit={handleLookup} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Plate Number</label>
                <input value={lookupPlate} onChange={evt => setLookupPlate(evt.target.value.toUpperCase())} required
                  style={{ ...inputStyle, fontFamily: styles.mono, fontSize: "1rem", fontWeight: 700, letterSpacing: "0.1em" }} />
              </div>
              <div style={{ width: 80 }}>
                <label style={labelStyle}>State</label>
                <select value={lookupState} onChange={evt => setLookupState(evt.target.value)} style={{ ...inputStyle, background: "#fff" }}>
                  {US_STATES.map(stateCode => <option key={stateCode} value={stateCode}>{stateCode}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={looking} style={{ ...btnStyle, alignSelf: "flex-start" }}>
              {looking ? "Looking up…" : "Look Up Plate"}
            </button>
          </form>

          {lookupResult === null && (
            <div style={{ padding: "1rem", border: `1px solid ${styles.rule}`, background: "#fff" }}>
              <p style={{ fontFamily: styles.mono, fontSize: "0.75rem", color: styles.inkLight, margin: 0 }}>
                No registered vehicle found for {lookupState} · {lookupPlate}.
              </p>
            </div>
          )}
          {lookupResult && (
            <div style={{ padding: "1rem", border: `1px solid ${styles.accent}`, background: "#EFF6FF" }}>
              <p style={{ fontFamily: styles.mono, fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase", color: styles.accent, margin: "0 0 0.75rem" }}>Registered Vehicle</p>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {[
                    ["Unit",  lookupResult.unitId],
                    ["Year",  lookupResult.year.toString()],
                    ["Make",  lookupResult.make],
                    ["Model", lookupResult.model],
                    ["Color", lookupResult.color],
                    ["ID",    lookupResult.id],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: `1px solid ${styles.rule}` }}>
                      <td style={{ fontFamily: styles.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.06em", color: styles.inkLight, padding: "0.4rem 1rem 0.4rem 0", whiteSpace: "nowrap" }}>{label}</td>
                      <td style={{ fontFamily: styles.sans, fontSize: "0.9rem", color: styles.ink, padding: "0.4rem 0" }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
