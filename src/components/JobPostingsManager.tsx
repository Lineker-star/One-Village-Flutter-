/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import JobPostingEditor from "./JobPostingEditor.tsx";
import { Briefcase, Plus, Loader2, ExternalLink, Pencil } from "lucide-react";

interface JobPostingsManagerProps {
  lang: "fr" | "en";
  userId: string;
}

type Mode = { kind: "list" } | { kind: "create" } | { kind: "edit"; jobId: string };

export default function JobPostingsManager({ lang, userId }: JobPostingsManagerProps) {
  const [loading, setLoading] = useState(true);
  const [postings, setPostings] = useState<Array<{
    id: string;
    title: string;
    status: "open" | "closed";
    companyName: string | null;
    applicationCount: number;
    createdAt: string;
  }>>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const fetchPostings = () => {
    setLoading(true);
    supabaseService.getMyJobPostings(userId).then((list) => {
      setPostings(list);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchPostings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (mode.kind === "create") {
    return (
      <JobPostingEditor
        lang={lang}
        userId={userId}
        onSaved={() => {
          setMode({ kind: "list" });
          fetchPostings();
        }}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  if (mode.kind === "edit") {
    return (
      <JobPostingEditor
        lang={lang}
        userId={userId}
        jobId={mode.jobId}
        onSaved={() => {
          setMode({ kind: "list" });
          fetchPostings();
        }}
        onCancel={() => setMode({ kind: "list" })}
        onDeleted={() => {
          setMode({ kind: "list" });
          fetchPostings();
        }}
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-black text-amber-950 text-xs uppercase tracking-wider">
            {lang === "fr" ? "Mes Offres d'Emploi" : "My Job Postings"}
          </h4>
          <p className="text-[11px] text-amber-800/80 font-serif mt-0.5">
            {lang === "fr" ? "Publiez et gérez vos offres d'emploi." : "Publish and manage your job postings."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode({ kind: "create" })}
          className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-[11px] px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          {lang === "fr" ? "Publier une offre" : "Post a job"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-amber-800 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {lang === "fr" ? "Chargement..." : "Loading..."}
        </div>
      ) : postings.length === 0 ? (
        <div className="text-center py-10 px-4 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
          <Briefcase className="w-8 h-8 text-amber-800/30 mx-auto mb-2" />
          <p className="text-xs text-amber-800/80 font-serif">
            {lang === "fr" ? "Vous n'avez pas encore publié d'offre d'emploi." : "You haven't posted a job yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {postings.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 border border-amber-100 bg-[#FAF8F5]/50 rounded-xl p-3 hover:border-amber-200 hover:shadow-sm transition-all"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-amber-950 text-xs truncate">{p.title}</p>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 ${
                      p.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    {p.status === "open" ? (lang === "fr" ? "Ouverte" : "Open") : (lang === "fr" ? "Fermée" : "Closed")}
                  </span>
                </div>
                <p className="text-[10px] text-amber-800/70">
                  {p.companyName || (lang === "fr" ? "Particulier" : "Individual")} · {p.applicationCount}{" "}
                  {lang === "fr" ? "candidature(s)" : "application(s)"}
                </p>
              </div>
              <a
                href={`/job/${p.id}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 text-amber-800 hover:bg-amber-100/60 rounded-lg cursor-pointer transition-colors shrink-0"
                title={lang === "fr" ? "Voir la page publique" : "View public page"}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setMode({ kind: "edit", jobId: p.id })}
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
