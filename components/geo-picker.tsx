"use client";

import { useState, useMemo } from "react";
import geoData from "@/lib/data/colombia-geo.json";

export function GeoPicker() {
  const [departmentCode, setDepartmentCode] = useState("");
  const [municipality, setMunicipality] = useState("");

  const departmentName = geoData.departments.find(d => d.code === departmentCode)?.name || "";

  const filteredMunicipalities = useMemo(() => {
    if (!departmentCode) return [];
    return geoData.municipalities.filter((m) => m.departmentCode === departmentCode);
  }, [departmentCode]);

  return (
    <>
      {/* Hidden field sends the department NAME to the form */}
      <input type="hidden" name="department" value={departmentName} />

      <div className="mb-3">
        <label htmlFor="department_picker" className="block text-base font-semibold text-text-primary mb-1.5">
          Departamento
        </label>
        <select
          id="department_picker"
          value={departmentCode}
          onChange={(e) => {
            setDepartmentCode(e.target.value);
            setMunicipality("");
          }}
          required={!departmentName}
          className="w-full rounded-xl border-[1.5px] border-border px-4 py-3.5 text-base bg-input-bg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
        >
          <option value="">Selecciona un departamento</option>
          {geoData.departments.map((d) => (
            <option key={d.code} value={d.code}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label htmlFor="municipality" className="block text-base font-semibold text-text-primary mb-1.5">
          Municipio
        </label>
        <select
          id="municipality"
          name="municipality"
          value={municipality}
          onChange={(e) => setMunicipality(e.target.value)}
          required
          disabled={!departmentCode}
          className="w-full rounded-xl border-[1.5px] border-border px-4 py-3.5 text-base bg-input-bg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue disabled:opacity-50"
        >
          <option value="">Selecciona un municipio</option>
          {filteredMunicipalities.map((m) => (
            <option key={m.code} value={m.name}>{m.name}</option>
          ))}
        </select>
      </div>
    </>
  );
}
