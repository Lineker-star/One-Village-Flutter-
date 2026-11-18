/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import CompanyEditor from "./CompanyEditor.tsx";
import { Building2, Plus, Loader2, ExternalLink, Pencil } from "lucide-react";

interface CompanyPagesManagerProps {
  lang: "fr" | "en";
  userId: string;
}

type Mode = { kind: "list" } | { kind: "create" } | { kind: "edit"; companyId: string };

export default function CompanyPagesManager({ lang, userId }: CompanyPagesManagerProps) {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; industry: string | null; logoUrl: string | null }>>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const fetchCompanies = () => {
    setLoading(true);
    supabaseService.getMyCompanies(userId).then((list) => {
      setCompanies(list);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (mode.kind === "create") {
    return (
      <CompanyEditor
        lang={lang}
        ownerId={userId}
        onSaved={() => {
          setMode({ kind: "list" });
          fetchCompanies();
        }}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  if (mode.kind === "edit") {
    return (
      <CompanyEditor
        lang={lang}
        ownerId={userId}
        companyId={mode.companyId}
        onSaved={() => {
          setMode({ kind: "list" });
          fetchCompanies();
        }}
        onCancel={() => setMode({ kind: "list" })}
        onDeleted={() => {
          setMode({ kind: "list" });
          fetchCompanies();
        }}
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-black text-amber-950 text-xs uppercase tracking-wider">
            {lang === "fr" ? "Mes Pages Entreprise" : "My Company Pages"}
          </h4>
          <p className="text-[11px] text-amber-800/80 font-serif mt-0.5">
            {lang === "fr" ? "Créez et gérez une ou plusieurs pages entreprise." : "Create and manage one or more company pages."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode({ kind: "create" })}
          className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-[11px] px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          {lang === "fr" ? "Créer une page" : "Create a page"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-amber-800 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {lang === "fr" ? "Chargement..." : "Loading..."}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-10 px-4 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
          <Building2 className="w-8 h-8 text-amber-800/30 mx-auto mb-2" />
          <p className="text-xs text-amber-800/80 font-serif">
            {lang === "fr" ? "Vous n'avez pas encore de page entreprise." : "You don't have a company page yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {companies.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border border-amber-100 bg-[#FAF8F5]/50 rounded-xl p-3 hover:border-amber-200 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 shrink-0 rounded-xl bg-white border border-amber-200/60 overflow-hidden flex items-center justify-center">
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt={c.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Building2 className="w-5 h-5 text-amber-800/40" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-amber-950 text-xs truncate">{c.name}</p>
                {c.industry && <p className="text-[10px] text-amber-800/70">{c.industry}</p>}
              </div>
              <a
                href={`/company/${c.id}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 text-amber-800 hover:bg-amber-100/60 rounded-lg cursor-pointer transition-colors shrink-0"
                title={lang === "fr" ? "Voir la page publique" : "View public page"}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setMode({ kind: "edit", companyId: c.id })}
                className="p-2 text-amber-800 hover:bg-amber-100/60 rounded-lg cursor-pointer transition-colors shrink-0"
                title={lang === "fr" ? "Modifier" : "Edit"}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
