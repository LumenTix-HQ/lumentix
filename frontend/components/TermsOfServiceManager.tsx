"use client";

import React, { useEffect, useState } from "react";
import {
  apiClient,
  EventTos,
  TosTemplate,
  SaveEventTosInput,
} from "@/lib/api-client";

interface TermsOfServiceManagerProps {
  eventId: string;
  token?: string;
  onSaved?: (tos: EventTos) => void;
}

export function TermsOfServiceManager({ eventId, token, onSaved }: TermsOfServiceManagerProps) {
  const [currentTos, setCurrentTos] = useState<EventTos | null>(null);
  const [templates, setTemplates] = useState<TosTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [formData, setFormData] = useState<SaveEventTosInput>({
    termsContent: "",
    liabilityDisclaimers: "",
    customAgreements: "",
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function init() {
      try {
        setIsLoading(true);
        const [templatesRes, tosRes] = await Promise.allSettled([
          apiClient.get_tos_templates(eventId),
          apiClient.fetch_tos_for_checkout(eventId),
        ]);

        if (templatesRes.status === "fulfilled") {
          setTemplates(templatesRes.value);
        }

        if (tosRes.status === "fulfilled") {
          setCurrentTos(tosRes.value);
          setFormData({
            termsContent: tosRes.value.termsContent || "",
            liabilityDisclaimers: tosRes.value.liabilityDisclaimers || "",
            customAgreements: tosRes.value.customAgreements || "",
          });
        }
      } finally {
        setIsLoading(false);
      }
    }

    void init();
  }, [eventId]);

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;

    setSelectedTemplateId(templateId);
    setFormData({
      termsContent: tmpl.defaultTerms,
      liabilityDisclaimers: tmpl.defaultDisclaimers,
      customAgreements: tmpl.defaultAgreements,
    });
    setMessage({
      type: "success",
      text: `Loaded template: "${tmpl.name}". You can customize before saving.`,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setMessage(null);

      const saved = await apiClient.save_event_tos(eventId, formData, token);
      setCurrentTos(saved);
      onSaved?.(saved);
      setMessage({
        type: "success",
        text: `Terms of Service v${saved.version} successfully published to checkout!`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save Terms of Service",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span>📜 Event Terms of Service & Legal Disclaimers</span>
          {currentTos && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Active v{currentTos.version}
            </span>
          )}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Customize legal terms, liability disclaimers, and attendee agreements appended to your checkout flow.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs font-medium border ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
              : "bg-red-950/40 border-red-800 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Template Chooser */}
      <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
          ✨ Pre-Built Legal Templates
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleApplyTemplate(t.id)}
              className={`p-3 rounded-lg text-left border transition-all text-xs flex flex-col justify-between ${
                selectedTemplateId === t.id
                  ? "bg-purple-600/20 border-purple-500 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850"
              }`}
            >
              <span className="font-semibold text-white mb-1">{t.name}</span>
              <span className="text-[11px] text-slate-400 line-clamp-2">{t.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Terms Editor Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            General Event Terms of Service *
          </label>
          <textarea
            required
            rows={4}
            value={formData.termsContent}
            onChange={(e) => setFormData({ ...formData, termsContent: e.target.value })}
            placeholder="Standard rules, admission requirements, venue conduct..."
            className="w-full bg-slate-950 text-white text-xs border border-slate-800 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Liability Disclaimers (Optional)
          </label>
          <textarea
            rows={3}
            value={formData.liabilityDisclaimers ?? ""}
            onChange={(e) => setFormData({ ...formData, liabilityDisclaimers: e.target.value })}
            placeholder="Assumption of risk, medical disclaimers, property loss exclusions..."
            className="w-full bg-slate-950 text-white text-xs border border-slate-800 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Custom Attendee Agreements & Waivers (Optional)
          </label>
          <textarea
            rows={3}
            value={formData.customAgreements ?? ""}
            onChange={(e) => setFormData({ ...formData, customAgreements: e.target.value })}
            placeholder="Media release, photography consent, specific house rules..."
            className="w-full bg-slate-950 text-white text-xs border border-slate-800 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving || !formData.termsContent}
            className="px-5 py-2.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition-colors flex items-center gap-2"
          >
            {isSaving ? "Saving Terms..." : "Publish Terms to Checkout"}
          </button>
        </div>
      </form>
    </div>
  );
}
