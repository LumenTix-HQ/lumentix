"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  apiClient,
  type SaveTicketDesignInput,
  type TicketBackgroundPattern,
  type TicketDesign,
  type TicketLayoutElement,
} from "@/lib/api-client";

interface TicketDesignBuilderProps {
  eventId: string;
}

interface DesignForm {
  name: string;
  backgroundPattern: TicketBackgroundPattern;
  backgroundImageUrl: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  logoUrl: string;
  layout: TicketLayoutElement[];
  isActive: boolean;
}

const EMPTY_FORM: DesignForm = {
  name: "",
  backgroundPattern: "gradient",
  backgroundImageUrl: "",
  backgroundColor: "#111827",
  textColor: "#FFFFFF",
  accentColor: "#A78BFA",
  logoUrl: "",
  layout: [
    { key: "event_title", x: 8, y: 12, width: 75 },
    { key: "event_date", x: 8, y: 35, width: 65 },
    { key: "qr_code", x: 76, y: 57, width: 18, height: 29 },
  ],
  isActive: false,
};

const ELEMENT_LABELS: Record<string, string> = {
  event_title: "Event title",
  event_date: "Date and time",
  venue: "Venue",
  qr_code: "QR code",
  logo: "Logo",
};

const PATTERN_LABELS: Record<TicketBackgroundPattern, string> = {
  solid: "Solid",
  dots: "Dots",
  waves: "Waves",
  gradient: "Gradient",
  custom_image: "Custom image",
};

function formFromDesign(design: TicketDesign): DesignForm {
  return {
    name: design.name,
    backgroundPattern: design.backgroundPattern,
    backgroundImageUrl: design.backgroundImageUrl ?? "",
    backgroundColor: design.backgroundColor,
    textColor: design.textColor,
    accentColor: design.accentColor,
    logoUrl: design.logoUrl ?? "",
    layout: design.layout ?? [],
    isActive: design.isActive,
  };
}

function previewBackground(form: DesignForm): CSSProperties {
  const style: CSSProperties = { backgroundColor: form.backgroundColor };

  if (form.backgroundPattern === "dots") {
    style.backgroundImage = `radial-gradient(${form.accentColor} 1px, transparent 1px)`;
    style.backgroundSize = "14px 14px";
  } else if (form.backgroundPattern === "waves") {
    style.backgroundImage = `repeating-linear-gradient(45deg, ${form.accentColor} 0, ${form.accentColor} 2px, transparent 2px, transparent 12px)`;
  } else if (form.backgroundPattern === "gradient") {
    style.backgroundImage = `linear-gradient(135deg, ${form.backgroundColor}, ${form.accentColor})`;
  } else if (form.backgroundPattern === "custom_image" && form.backgroundImageUrl) {
    try {
      const imageUrl = new URL(form.backgroundImageUrl);
      if (imageUrl.protocol === "https:") {
        style.backgroundImage = `url("${imageUrl.toString()}")`;
        style.backgroundSize = "cover";
        style.backgroundPosition = "center";
      }
    } catch {
      return style;
    }
  }

  return style;
}

function elementPreview(element: TicketLayoutElement, form: DesignForm) {
  switch (element.key) {
    case "event_title":
      return <strong className="text-xl font-black leading-tight">Your event title</strong>;
    case "event_date":
      return <span className="text-xs font-semibold">SAT · 7:00 PM</span>;
    case "venue":
      return <span className="text-xs">Venue name · City</span>;
    case "logo":
      return form.logoUrl ? (
        // The saved URL is validated by the API; browser preview shows the selected asset.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form.logoUrl} alt="Organizer logo preview" className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-[10px] font-bold uppercase tracking-widest">Your logo</span>
      );
    case "qr_code":
      return (
        <div
          aria-label="QR code placeholder"
          className="flex aspect-square items-center justify-center border-4 border-white bg-white p-1"
        >
          <div className="h-full w-full bg-[repeating-conic-gradient(#111_0%_25%,#fff_0%_50%)] bg-[length:8px_8px]" />
        </div>
      );
    default:
      return <span className="text-xs">{ELEMENT_LABELS[element.key] ?? element.key}</span>;
  }
}

export function TicketDesignBuilder({ eventId }: TicketDesignBuilderProps) {
  const [designs, setDesigns] = useState<TicketDesign[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<DesignForm>(EMPTY_FORM);
  const [newElement, setNewElement] = useState("venue");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.listTicketDesigns(eventId)
      .then((items) => {
        if (active) setDesigns(items);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage({
            type: "error",
            text: error instanceof Error ? error.message : "Could not load ticket designs.",
          });
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  const backgroundStyle = useMemo(() => previewBackground(form), [form]);

  const handleSelectDesign = (design: TicketDesign) => {
    setSelectedId(design.id);
    setForm(formFromDesign(design));
    setMessage(null);
  };

  const handleNewDesign = () => {
    setSelectedId("");
    setForm(EMPTY_FORM);
    setMessage(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const body: SaveTicketDesignInput = {
      name: form.name.trim(),
      backgroundPattern: form.backgroundPattern,
      backgroundColor: form.backgroundColor,
      textColor: form.textColor,
      accentColor: form.accentColor,
      layout: form.layout,
      isActive: form.isActive,
      backgroundImageUrl: form.backgroundImageUrl.trim() || null,
      logoUrl: form.logoUrl.trim() || null,
    };

    try {
      const saved = selectedId
        ? await apiClient.updateTicketDesign(eventId, selectedId, body)
        : await apiClient.saveTicketDesign(eventId, body);
      setDesigns((current) => {
        const updated = current.some((item) => item.id === saved.id)
          ? current.map((item) => item.id === saved.id ? saved : item)
          : [...current, saved];
        return saved.isActive
          ? updated.map((item) => ({ ...item, isActive: item.id === saved.id }))
          : updated;
      });
      setSelectedId(saved.id);
      setForm(formFromDesign(saved));
      setMessage({ type: "success", text: "Ticket design saved." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not save this ticket design.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addElement = () => {
    setForm((current) => ({
      ...current,
      layout: [
        ...current.layout,
        {
          key: newElement,
          x: newElement === "qr_code" ? 76 : 8,
          y: newElement === "qr_code" ? 57 : 68,
          ...(newElement === "qr_code" ? { width: 18, height: 29 } : { width: 65 }),
        },
      ],
    }));
  };

  const updateElement = (index: number, patch: Partial<TicketLayoutElement>) => {
    setForm((current) => ({
      ...current,
      layout: current.layout.map((element, itemIndex) =>
        itemIndex === index ? { ...element, ...patch } : element,
      ),
    }));
  };

  const setField = <K extends keyof DesignForm>(field: K, value: DesignForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
      <div className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Ticket design studio</h1>
            <p className="mt-1 text-sm text-slate-400">
              Style your ticket, arrange its elements, and publish a theme for this event.
            </p>
          </div>
          <button
            type="button"
            onClick={handleNewDesign}
            className="rounded-lg border border-violet-400/40 px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-400/10"
          >
            New design
          </button>
        </div>

        <div>
          <label htmlFor="saved-design" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Saved designs
          </label>
          <select
            id="saved-design"
            value={selectedId}
            onChange={(event) => {
              const design = designs.find((item) => item.id === event.target.value);
              if (design) handleSelectDesign(design);
              else handleNewDesign();
            }}
            disabled={isLoading}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
          >
            <option value="">Create a new design</option>
            {designs.map((design) => (
              <option key={design.id} value={design.id}>
                {design.name}{design.isActive ? " · Active" : ""}
              </option>
            ))}
          </select>
        </div>

        {message && (
          <p
            role={message.type === "error" ? "alert" : "status"}
            className={`rounded-lg border p-3 text-sm ${
              message.type === "success"
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                : "border-red-700 bg-red-950/40 text-red-200"
            }`}
          >
            {message.text}
          </p>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-200">Design name</span>
            <input
              required
              maxLength={128}
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="e.g. Midnight festival"
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-200">Background style</span>
              <select
                value={form.backgroundPattern}
                onChange={(event) => setField("backgroundPattern", event.target.value as TicketBackgroundPattern)}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
              >
                {Object.entries(PATTERN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-200">Background color</span>
              <span className="flex gap-2 rounded-lg border border-white/10 bg-slate-950 p-2">
                <input
                  type="color"
                  aria-label="Background color"
                  value={form.backgroundColor}
                  onChange={(event) => setField("backgroundColor", event.target.value)}
                  className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent"
                />
                <span className="self-center font-mono text-xs text-slate-300">{form.backgroundColor}</span>
              </span>
            </label>
            {form.backgroundPattern === "custom_image" && (
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-200">Background image URL (HTTPS)</span>
                <input
                  type="url"
                  required
                  value={form.backgroundImageUrl}
                  onChange={(event) => setField("backgroundImageUrl", event.target.value)}
                  placeholder="https://example.com/background.jpg"
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-200">Text color</span>
              <input
                type="color"
                aria-label="Text color"
                value={form.textColor}
                onChange={(event) => setField("textColor", event.target.value)}
                className="h-11 w-full rounded-lg border border-white/10 bg-slate-950 p-1"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-200">Accent color</span>
              <input
                type="color"
                aria-label="Accent color"
                value={form.accentColor}
                onChange={(event) => setField("accentColor", event.target.value)}
                className="h-11 w-full rounded-lg border border-white/10 bg-slate-950 p-1"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-200">Logo URL (HTTPS)</span>
              <input
                type="url"
                value={form.logoUrl}
                onChange={(event) => setField("logoUrl", event.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white">Layout elements</h2>
                <p className="text-xs text-slate-400">Position each item using ticket-width and ticket-height percentages.</p>
              </div>
              <div className="flex gap-2">
                <select
                  aria-label="Element to add"
                  value={newElement}
                  onChange={(event) => setNewElement(event.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-xs text-white"
                >
                  {Object.entries(ELEMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addElement}
                  className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Add
                </button>
              </div>
            </div>
            {form.layout.length === 0 && (
              <p className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-slate-400">
                No layout elements yet. Add a title, venue, logo, or QR code.
              </p>
            )}
            {form.layout.map((element, index) => (
              <div key={`${element.key}-${index}`} className="grid grid-cols-4 items-end gap-2 rounded-lg border border-white/10 bg-slate-950/70 p-3 sm:grid-cols-[minmax(70px,1fr)_52px_52px_52px_52px_auto]">
                <span className="col-span-3 pb-2 text-xs font-medium text-slate-200 sm:col-span-1">{ELEMENT_LABELS[element.key] ?? element.key}</span>
                {([
                  ["X %", "x", 0],
                  ["Y %", "y", 0],
                  ["W %", "width", 0.1],
                  ["H %", "height", 0.1],
                ] as const).map(([label, field, minimum]) => (
                  <label key={field} className="text-[10px] text-slate-400">
                    {label}
                    <input
                      type="number"
                      min={minimum}
                      max={100}
                      value={element[field] ?? ""}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        if (field === "x") {
                          updateElement(index, { x: rawValue === "" ? 0 : Number(rawValue) });
                        } else if (field === "y") {
                          updateElement(index, { y: rawValue === "" ? 0 : Number(rawValue) });
                        } else if (field === "width") {
                          updateElement(index, { width: rawValue === "" ? undefined : Number(rawValue) });
                        } else {
                          updateElement(index, { height: rawValue === "" ? undefined : Number(rawValue) });
                        }
                      }}
                      className="mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  aria-label={`Remove ${ELEMENT_LABELS[element.key] ?? element.key}`}
                  onClick={() => setForm((current) => ({
                    ...current,
                    layout: current.layout.filter((_, itemIndex) => itemIndex !== index),
                  }))}
                  className="mb-1 rounded px-2 py-1 text-xs text-red-300 hover:bg-red-400/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setField("isActive", event.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            Make this the active ticket design
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Saving design…" : selectedId ? "Save changes" : "Save ticket design"}
          </button>
        </form>
      </div>

      <aside className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/80 p-5 sm:p-7">
        <div>
          <h2 className="text-lg font-bold text-white">Live preview</h2>
          <p className="mt-1 text-sm text-slate-400">Changes update as you build your layout.</p>
        </div>
        <div className="mx-auto w-full max-w-xl">
          <div
            className="relative overflow-hidden rounded-2xl border border-white/20 shadow-2xl"
            style={{ ...backgroundStyle, aspectRatio: "1.65 / 1", color: form.textColor }}
            aria-label="Ticket design preview"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
            {form.logoUrl && !form.layout.some((item) => item.key === "logo") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logoUrl} alt="Organizer logo" className="absolute right-4 top-4 h-10 max-w-24 object-contain" />
            )}
            {form.layout.map((element, index) => (
              <div
                key={`${element.key}-${index}`}
                className={`absolute z-10 ${element.key === "qr_code" ? "rounded-sm p-1" : ""}`}
                style={{
                  left: `${element.x}%`,
                  top: `${element.y}%`,
                  width: `${element.width ?? (element.key === "qr_code" ? 18 : 65)}%`,
                  height: element.height ? `${element.height}%` : undefined,
                  color: form.textColor,
                  borderColor: form.accentColor,
                }}
              >
                {elementPreview(element, form)}
              </div>
            ))}
            <div className="absolute bottom-3 left-4 z-10 text-[9px] font-bold uppercase tracking-[0.25em] opacity-70">
              ADMIT ONE
            </div>
            <div className="absolute inset-y-0 right-[25%] border-l border-dashed border-white/40" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Pattern", PATTERN_LABELS[form.backgroundPattern]],
            ["Text", form.textColor],
            ["Accent", form.accentColor],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-slate-950/70 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 truncate text-xs font-semibold text-slate-200">{value}</div>
            </div>
          ))}
        </div>
        {designs.some((design) => design.isActive) && (
          <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200">
            Active theme: {designs.find((design) => design.isActive)?.name}
          </p>
        )}
      </aside>
    </section>
  );
}
