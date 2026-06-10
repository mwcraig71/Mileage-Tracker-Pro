import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Truck, Settings, ArrowLeft, Save, Plus, Trash2, Loader2,
  MapPin, Mail, Users, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useGetGpsDevices,
  useListProjects,
  useCreateProject,
  getListProjectsQueryKey,
  useListTruckStates,
  useSaveTruckStates,
  useAddTruck,
  useDeleteTruck,
  getListTruckStatesQueryKey,
  useListProjectStates,
  useSaveProjectStates,
  getListProjectStatesQueryKey,
  useListStateContacts,
  useCreateStateContact,
  useDeleteStateContact,
  getListStateContactsQueryKey,
  type TruckState,
  type ProjectState,
} from "@workspace/api-client-react";

// ── US States ────────────────────────────────────────────────────────────────
const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },        { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },        { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },     { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },    { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },        { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },         { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },       { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },           { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },       { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },          { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },      { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },       { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },       { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },     { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },           { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },         { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },   { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },   { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },          { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },        { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },     { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },      { code: "WY", name: "Wyoming" },
];

// ── Shared state select ──────────────────────────────────────────────────────
function StateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ colorScheme: "dark" }}
      className="h-8 rounded-md border border-white/10 bg-[#1c2333] px-2 text-xs text-white focus:outline-none focus:border-amber-500/50 min-w-[200px]"
    >
      <option value="">— No state assigned —</option>
      {US_STATES.map(s => (
        <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
      ))}
    </select>
  );
}

// ── Section shell ────────────────────────────────────────────────────────────
function Section({ icon, title, description, children }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#161b22] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10 flex items-start gap-3">
        <div className="mt-0.5 text-amber-400">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-white/40 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ── Save button ──────────────────────────────────────────────────────────────
function SaveBtn({ onClick, pending, saved, label }: {
  onClick: () => void; pending: boolean; saved: boolean; label: string;
}) {
  return (
    <Button onClick={onClick} disabled={pending}
      className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5 disabled:opacity-50">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : saved ? <CheckCircle2 className="h-3.5 w-3.5" />
        : <Save className="h-3.5 w-3.5" />}
      {saved ? "Saved!" : label}
    </Button>
  );
}

// ── Truck States section ─────────────────────────────────────────────────────
function TruckStatesSection() {
  const qc             = useQueryClient();
  const { data: gpsDevices = [] } = useGetGpsDevices();
  const { data: savedStates = [] } = useListTruckStates();
  const saveMut        = useSaveTruckStates();
  const addMut         = useAddTruck();
  const deleteMut      = useDeleteTruck();

  const [local, setLocal]       = useState<Record<string, string>>({});
  const [saved, setSaved]       = useState(false);
  const [newName, setNewName]   = useState("");
  const [addError, setAddError] = useState("");

  // Merge GPS devices + manually-added truck_states entries
  const allTrucks = (() => {
    const merged: { device_id: string; device_name: string; isManual: boolean }[] = [];
    const gpsIds = new Set(gpsDevices.map(d => d.device_id));
    for (const d of gpsDevices) {
      merged.push({ device_id: d.device_id, device_name: d.display_name, isManual: false });
    }
    for (const ts of savedStates) {
      if (!gpsIds.has(ts.device_id)) {
        merged.push({ device_id: ts.device_id, device_name: ts.device_name, isManual: true });
      }
    }
    return merged.sort((a, b) => a.device_name.localeCompare(b.device_name));
  })();

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const ts of savedStates) map[ts.device_id] = ts.state_code;
    setLocal(map);
  }, [savedStates]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTruckStatesQueryKey() });

  const handleSave = async () => {
    const payload: TruckState[] = allTrucks.map(t => ({
      device_id: t.device_id,
      device_name: t.device_name,
      state_code: local[t.device_id] ?? "",
    }));
    await saveMut.mutateAsync({ data: payload });
    invalidate();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAdd = async () => {
    setAddError("");
    if (!newName.trim()) { setAddError("Truck name is required."); return; }
    await addMut.mutateAsync({ data: { display_name: newName.trim() } });
    invalidate();
    setNewName("");
  };

  const handleDelete = async (deviceId: string) => {
    await deleteMut.mutateAsync({ deviceId });
    invalidate();
    setLocal(prev => { const next = { ...prev }; delete next[deviceId]; return next; });
  };

  return (
    <div className="space-y-5">
      {/* Truck list */}
      {allTrucks.length === 0 ? (
        <p className="text-xs text-white/30 italic">No trucks detected yet. Add one manually below or generate a log first.</p>
      ) : (
        <div className="space-y-2.5">
          {allTrucks.map(t => (
            <div key={t.device_id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.device_name}</p>
                {t.isManual && (
                  <p className="text-xs text-amber-400/60">manually added</p>
                )}
              </div>
              <StateSelect
                value={local[t.device_id] ?? ""}
                onChange={v => setLocal(prev => ({ ...prev, [t.device_id]: v }))}
              />
              {t.isManual && (
                <button
                  onClick={() => handleDelete(t.device_id)}
                  disabled={deleteMut.isPending}
                  className="text-white/20 hover:text-red-400 transition-colors shrink-0 disabled:opacity-30"
                  title="Remove truck">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <div className="pt-1">
            <SaveBtn onClick={handleSave} pending={saveMut.isPending} saved={saved} label="Save Truck States" />
          </div>
        </div>
      )}

      {/* Add truck form */}
      <div className="bg-white/3 rounded-lg border border-white/8 p-4">
        <p className="text-xs text-white/40 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Truck
        </p>
        <div className="flex gap-2 items-start">
          <Input
            placeholder="Truck name (e.g. Truck #7)"
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddError(""); }}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="h-8 text-xs bg-white/5 border-white/10 focus:border-amber-500/50 w-56"
          />
          <Button onClick={handleAdd} disabled={addMut.isPending}
            className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5">
            {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>
        {addError && (
          <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />{addError}
          </p>
        )}
        <p className="text-xs text-white/25 mt-2">
          GPS trucks appear automatically after generating a log. Use this to add trucks not yet tracked by GPS.
        </p>
      </div>
    </div>
  );
}

// ── Project States section ───────────────────────────────────────────────────
function ProjectStatesSection() {
  const qc               = useQueryClient();
  const { data: projects = [] }    = useListProjects();
  const { data: savedStates = [] } = useListProjectStates();
  const saveMut          = useSaveProjectStates();
  const createProjectMut = useCreateProject();

  const [local, setLocal]         = useState<Record<string, string>>({});
  const [saved, setSaved]         = useState(false);
  const [newProj, setNewProj]     = useState("");
  const [addError, setAddError]   = useState("");

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const ps of savedStates) map[ps.project_number] = ps.state_code;
    setLocal(map);
  }, [savedStates]);

  const handleSave = async () => {
    const payload: ProjectState[] = projects.map(p => ({
      project_number: p.project_number,
      state_code: local[p.project_number] ?? "",
    }));
    await saveMut.mutateAsync({ data: payload });
    qc.invalidateQueries({ queryKey: getListProjectStatesQueryKey() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddProject = async () => {
    setAddError("");
    if (!newProj.trim()) { setAddError("Project number is required."); return; }
    await createProjectMut.mutateAsync({ data: { project_number: newProj.trim() } });
    qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    setNewProj("");
  };

  return (
    <div className="space-y-5">
      {/* Project list */}
      {projects.length === 0 ? (
        <p className="text-xs text-white/30 italic">No projects yet. Add one below.</p>
      ) : (
        <div className="space-y-2.5">
          {projects.map(p => (
            <div key={p.project_number} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium font-mono">{p.project_number}</p>
              </div>
              <StateSelect
                value={local[p.project_number] ?? ""}
                onChange={v => setLocal(prev => ({ ...prev, [p.project_number]: v }))}
              />
            </div>
          ))}
          <div className="pt-1">
            <SaveBtn onClick={handleSave} pending={saveMut.isPending} saved={saved} label="Save Project States" />
          </div>
        </div>
      )}

      {/* Add project form */}
      <div className="bg-white/3 rounded-lg border border-white/8 p-4">
        <p className="text-xs text-white/40 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Project
        </p>
        <div className="flex gap-2 items-start">
          <Input
            placeholder="Project number (e.g. PRJ-2026-01)"
            value={newProj}
            onChange={e => { setNewProj(e.target.value); setAddError(""); }}
            onKeyDown={e => e.key === "Enter" && handleAddProject()}
            className="h-8 text-xs bg-white/5 border-white/10 focus:border-amber-500/50 w-60"
          />
          <Button onClick={handleAddProject} disabled={createProjectMut.isPending}
            className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5">
            {createProjectMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>
        {addError && (
          <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />{addError}
          </p>
        )}
        <p className="text-xs text-white/25 mt-2">
          Projects added here appear in the mileage log dropdown automatically.
        </p>
      </div>
    </div>
  );
}

// ── State Contacts section ───────────────────────────────────────────────────
function StateContactsSection() {
  const qc = useQueryClient();
  const { data: contacts = [] } = useListStateContacts();
  const createMut = useCreateStateContact();
  const deleteMut = useDeleteStateContact();

  const [newState, setNewState] = useState("");
  const [newName, setNewName]   = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addError, setAddError] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: getListStateContactsQueryKey() });

  const handleAdd = async () => {
    setAddError("");
    if (!newState) { setAddError("Select a state."); return; }
    if (!newName.trim()) { setAddError("Name is required."); return; }
    if (!newEmail.trim() || !newEmail.includes("@")) { setAddError("Valid email is required."); return; }
    await createMut.mutateAsync({ data: { state_code: newState, contact_name: newName.trim(), email: newEmail.trim() } });
    invalidate();
    setNewName("");
    setNewEmail("");
  };

  const handleDelete = async (id: number) => {
    await deleteMut.mutateAsync({ id });
    invalidate();
  };

  const byState = contacts.reduce<Record<string, typeof contacts>>((acc, c) => {
    (acc[c.state_code] ??= []).push(c);
    return acc;
  }, {});
  const stateGroups = Object.entries(byState).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      {stateGroups.length === 0 ? (
        <p className="text-xs text-white/30 italic">No contacts yet. Add one below.</p>
      ) : (
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="text-left px-4 py-2.5 text-white/40 font-medium uppercase tracking-wider">State</th>
                <th className="text-left px-4 py-2.5 text-white/40 font-medium uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 text-white/40 font-medium uppercase tracking-wider">Email</th>
                <th className="w-10 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {stateGroups.map(([stateCode, rows]) =>
                rows.map((c, i) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/3">
                    <td className="px-4 py-2.5 font-mono">
                      {i === 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-semibold text-amber-400">{stateCode}</span>
                          <span className="text-white/30">—</span>
                          <span className="text-white/50">{US_STATES.find(s => s.code === stateCode)?.name}</span>
                        </span>
                      ) : (
                        <span className="text-white/20">↳</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{c.contact_name}</td>
                    <td className="px-4 py-2.5">
                      <a href={`mailto:${c.email}`}
                        className="text-amber-400/70 hover:text-amber-300 flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />{c.email}
                      </a>
                    </td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => handleDelete(c.id)} disabled={deleteMut.isPending}
                        className="text-white/20 hover:text-red-400 transition-colors disabled:opacity-30">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add contact form */}
      <div className="bg-white/3 rounded-lg border border-white/8 p-4">
        <p className="text-xs text-white/40 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Contact
        </p>
        <div className="flex flex-wrap gap-2 items-start">
          <select
            value={newState}
            onChange={e => { setNewState(e.target.value); setAddError(""); }}
            style={{ colorScheme: "dark" }}
            className="h-8 rounded-md border border-white/10 bg-[#1c2333] px-2 text-xs text-white focus:outline-none focus:border-amber-500/50 min-w-[180px]"
          >
            <option value="">Select state…</option>
            {US_STATES.map(s => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
          <Input placeholder="Full name" value={newName}
            onChange={e => { setNewName(e.target.value); setAddError(""); }}
            className="h-8 text-xs bg-white/5 border-white/10 focus:border-amber-500/50 w-40" />
          <Input placeholder="email@example.com" type="email" value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setAddError(""); }}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="h-8 text-xs bg-white/5 border-white/10 focus:border-amber-500/50 w-48" />
          <Button onClick={handleAdd} disabled={createMut.isPending}
            className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5">
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>
        {addError && (
          <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />{addError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Settings page ────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <header className="border-b border-white/10 bg-[#0d1117]/90 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto max-w-4xl px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate("/")}
            className="text-white/40 hover:text-white transition-colors flex items-center gap-1.5 text-sm">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Mileage Log</span>
          </button>
          <div className="h-4 w-px bg-white/15 mx-1" />
          <div className="flex items-center gap-2 flex-1">
            <Truck className="h-4 w-4 text-amber-400" />
            <span className="font-bold text-sm tracking-tight">FleetLog</span>
            <span className="text-xs text-white/30 font-mono ml-1 hidden sm:inline">Settings</span>
          </div>
          <Settings className="h-4 w-4 text-white/20" />
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-white/40 mt-1">Configure state assignments and contacts for trucks and projects.</p>
        </div>

        <Section icon={<Truck className="h-4 w-4" />} title="Trucks & States"
          description="Assign a home state to each truck. Add trucks not yet tracked by GPS here.">
          <TruckStatesSection />
        </Section>

        <Section icon={<MapPin className="h-4 w-4" />} title="Projects & States"
          description="Add project numbers and assign a state. Projects added here appear in the mileage log.">
          <ProjectStatesSection />
        </Section>

        <Section icon={<Users className="h-4 w-4" />} title="State Contacts"
          description="People responsible per state — receives invoices, approvals, and reports.">
          <StateContactsSection />
        </Section>
      </main>
    </div>
  );
}
