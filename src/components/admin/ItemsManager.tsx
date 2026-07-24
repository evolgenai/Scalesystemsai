"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Edit3,
  Loader2,
  Package,
  Plus,
  Save,
  Search,
  Shirt,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  Upload,
  Wine,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

type Category = "wines" | "tastings" | "merch" | "passes";
type StockStatus = "in-stock" | "low-stock" | "out-of-stock" | "pre-order";

type ManagedItem = {
  id: string;
  name: string;
  description: string;
  category: Category;
  price: number;
  originalPrice?: number;
  stock: number;
  stockStatus: StockStatus;
  emoji: string;
  imageUrl?: string;
  tags: string[];
  active: boolean;
};

const INITIAL_ITEMS: ManagedItem[] = [
  {
    id: "w-001",
    name: "Château Noir Reserve 2019",
    description: "Deep ruby with notes of black cherry, leather, and aged oak.",
    category: "wines",
    price: 189,
    originalPrice: 220,
    stock: 24,
    stockStatus: "in-stock",
    emoji: "🍷",
    tags: ["red", "reserve", "aged"],
    active: true,
  },
  {
    id: "w-002",
    name: "Blanc de Lune Chardonnay",
    description: "Crisp minerality with citrus and white peach.",
    category: "wines",
    price: 94,
    stock: 58,
    stockStatus: "in-stock",
    emoji: "🥂",
    tags: ["white", "crisp"],
    active: true,
  },
  {
    id: "w-003",
    name: "Nebbiolo Cru Selection",
    description: "Structured tannins, violet perfume, exceptional aging potential.",
    category: "wines",
    price: 245,
    stock: 6,
    stockStatus: "low-stock",
    emoji: "🍇",
    tags: ["red", "limited", "italy"],
    active: true,
  },
  {
    id: "t-001",
    name: "Barrel Room Experience",
    description: "Exclusive 2-hour guided tasting tour through our private barrel room.",
    category: "tastings",
    price: 120,
    stock: 12,
    stockStatus: "in-stock",
    emoji: "🪣",
    tags: ["tour", "guided", "popular"],
    active: true,
  },
  {
    id: "t-002",
    name: "Sommelier Masterclass",
    description: "3-hour intensive with resident sommelier.",
    category: "tastings",
    price: 280,
    originalPrice: 350,
    stock: 4,
    stockStatus: "low-stock",
    emoji: "🎓",
    tags: ["premium", "education"],
    active: true,
  },
  {
    id: "m-001",
    name: "Scale Systems Logo Tee",
    description: "Premium 100% Pima cotton. Obsidian black.",
    category: "merch",
    price: 42,
    stock: 200,
    stockStatus: "in-stock",
    emoji: "👕",
    tags: ["apparel", "unisex"],
    active: true,
  },
  {
    id: "p-001",
    name: "Founding Member Pass",
    description: "Annual access to all tastings, early bottle releases.",
    category: "passes",
    price: 599,
    stock: 50,
    stockStatus: "pre-order",
    emoji: "🏆",
    tags: ["annual", "vip", "new"],
    active: true,
  },
];

const CATEGORY_META: Record<
  Category,
  {
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    color: string;
  }
> = {
  wines: { label: "Wines", icon: Wine, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  tastings: { label: "Tastings", icon: Sparkles, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  merch: { label: "Merch", icon: Shirt, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  passes: { label: "Passes", icon: Ticket, color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
};

const STATUS_OPTIONS: { value: StockStatus; label: string; color: string }[] = [
  { value: "in-stock", label: "In Stock", color: "text-emerald-400" },
  { value: "low-stock", label: "Low Stock", color: "text-amber-400" },
  { value: "out-of-stock", label: "Out of Stock", color: "text-rose-400" },
  { value: "pre-order", label: "Pre-Order", color: "text-violet-400" },
];

function stockStatusColor(s: StockStatus) {
  if (s === "out-of-stock") return "bg-rose-500/15 text-rose-400 border-rose-500/20";
  if (s === "low-stock") return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  if (s === "pre-order") return "bg-violet-500/15 text-violet-400 border-violet-500/20";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
}

function InlineEdit({
  value,
  onSave,
  type = "text",
  prefix,
}: {
  value: string | number;
  onSave: (v: string) => void;
  type?: "text" | "number";
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    if (val.trim() === String(value)) { setEditing(false); return; }
    setSaving(true);
    setTimeout(() => {
      onSave(val);
      setSaving(false);
      setEditing(false);
    }, 400);
  }, [val, value, onSave]);

  const cancel = useCallback(() => {
    setVal(String(value));
    setEditing(false);
  }, [value]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setVal(String(value)); setEditing(true); }}
        className="group inline-flex items-center gap-1 text-left text-white transition hover:text-emerald-300"
        aria-label={`Edit value ${value}`}
      >
        {prefix ? <span className="text-slate-dim">{prefix}</span> : null}
        <span>{type === "number" && prefix === "$" ? Number(value).toLocaleString() : value}</span>
        <Edit3 className="h-3 w-3 shrink-0 text-slate-600 opacity-0 transition group-hover:opacity-100" aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {prefix ? <span className="text-slate-dim text-sm">{prefix}</span> : null}
      <input
        ref={inputRef}
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        className="w-28 rounded-md border border-emerald-500/40 bg-emerald-500/[0.06] px-2 py-0.5 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500/40"
      />
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" aria-hidden />
      ) : (
        <>
          <button type="button" onClick={commit} className="text-emerald-400 hover:text-emerald-300" aria-label="Save">
            <Check className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" onClick={cancel} className="text-slate-muted hover:text-white" aria-label="Cancel">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

function ImageDropzone({ itemId, current, onUpload }: { itemId: string; current?: string; onUpload: (id: string, url: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(current);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setUploading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setTimeout(() => {
          setPreview(url);
          onUpload(itemId, url);
          setUploading(false);
        }, 600);
      };
      reader.readAsDataURL(file);
    },
    [itemId, onUpload]
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border transition ${
        dragging
          ? "border-emerald-400/50 bg-emerald-500/10"
          : "border-white/10 bg-white/[0.03] hover:border-white/20"
      }`}
      role="button"
      tabIndex={0}
      aria-label="Upload item image"
    >
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={onChange} />
      {uploading ? (
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden />
      ) : preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Item preview" className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-0.5 text-slate-dim">
          <Upload className="h-4 w-4" aria-hidden />
          <span className="text-[9px] leading-none">Upload</span>
        </div>
      )}
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");

  const add = () => {
    const t = input.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-muted">
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
            <X className="h-2.5 w-2.5" aria-hidden />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          placeholder="+ tag"
          className="w-16 bg-transparent text-[10px] text-slate-muted outline-none placeholder:text-slate-600"
        />
      </div>
    </div>
  );
}

export default function ItemsManager() {
  const [items, setItems] = useState<ManagedItem[]>(INITIAL_ITEMS);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string[]>([]);

  const filtered = items.filter((item) => {
    if (filterCategory !== "all" && item.category !== filterCategory) return false;
    if (search) {
      const s = search.toLowerCase();
      return item.name.toLowerCase().includes(s) || item.tags.some((t) => t.includes(s));
    }
    return true;
  });

  const updateItem = useCallback((id: string, patch: Partial<ManagedItem>) => {
    setSaving(id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setTimeout(() => setSaving(null), 600);
  }, []);

  const deleteItem = useCallback((id: string) => {
    setDeleted((d) => [...d, id]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 320);
  }, []);

  const addItem = useCallback(() => {
    const id = `new-${Date.now()}`;
    setItems((prev) => [
      {
        id,
        name: "New Item",
        description: "Item description",
        category: "merch",
        price: 0,
        stock: 0,
        stockStatus: "in-stock",
        emoji: "📦",
        tags: [],
        active: true,
      },
      ...prev,
    ]);
  }, []);

  const stats = {
    total: items.length,
    active: items.filter((i) => i.active).length,
    lowStock: items.filter((i) => i.stockStatus === "low-stock").length,
    outOfStock: items.filter((i) => i.stockStatus === "out-of-stock").length,
  };

  return (
    <div className="space-y-6" style={{ backgroundColor: "#040907" }}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
            Super-Admin · Inventory
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-white sm:text-2xl">
            Items Manager
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Inline price editing, stock updates, category tagging, and image asset upload.
          </p>
        </div>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add Item
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Items", value: stats.total, color: "text-white" },
          { label: "Active", value: stats.active, color: "text-emerald-400" },
          { label: "Low Stock", value: stats.lowStock, color: "text-amber-400" },
          { label: "Out of Stock", value: stats.outOfStock, color: "text-rose-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">{stat.label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or tags…"
            className="w-full rounded-xl border border-white/5 bg-white/[0.03] pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-dim outline-none transition focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20"
          />
        </div>

        <div
          className="inline-flex rounded-xl border border-white/5 bg-white/[0.03] p-0.5"
          role="group"
          aria-label="Category filter"
        >
          {(["all", "wines", "tastings", "merch", "passes"] as const).map((c) => {
            const meta = c !== "all" ? CATEGORY_META[c] : null;
            const Icon = meta?.icon ?? Package;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setFilterCategory(c)}
                aria-pressed={filterCategory === c}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filterCategory === c
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-slate-muted hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {c === "all" ? "All" : meta!.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl">
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-dim">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""} — click any cell to edit inline
          </p>
        </div>

        <div className="divide-y divide-white/[0.04]">
          <AnimatePresence mode="popLayout">
            {filtered.map((item) => {
              const catMeta = CATEGORY_META[item.category];
              const isSaving = saving === item.id;
              const isDeleted = deleted.includes(item.id);

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: isDeleted ? 0 : 1, y: 0, scale: isDeleted ? 0.97 : 1 }}
                  exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                  transition={{ duration: 0.22 }}
                  className="relative flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start"
                >
                  {isSaving ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/[0.01] backdrop-blur-[1px]">
                      <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                        <Save className="h-3.5 w-3.5 animate-pulse" aria-hidden />
                        Saving…
                      </div>
                    </div>
                  ) : null}

                  <ImageDropzone
                    itemId={item.id}
                    current={item.imageUrl}
                    onUpload={(id, url) => updateItem(id, { imageUrl: url })}
                  />

                  <div className="flex flex-1 flex-col gap-3 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <InlineEdit
                          value={item.name}
                          onSave={(v) => updateItem(item.id, { name: v })}
                        />
                        <div className="mt-0.5">
                          <InlineEdit
                            value={item.description}
                            onSave={(v) => updateItem(item.id, { description: v })}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.active}
                            onChange={(e) => updateItem(item.id, { active: e.target.checked })}
                            className="sr-only"
                          />
                          <span className={`flex h-5 w-9 rounded-full border transition ${item.active ? "border-emerald-500/40 bg-emerald-500/20" : "border-white/10 bg-white/[0.03]"}`}>
                            <span className={`m-0.5 h-4 w-4 rounded-full transition ${item.active ? "translate-x-4 bg-emerald-400" : "bg-slate-600"}`} />
                          </span>
                          <span className="text-xs text-slate-dim">{item.active ? "Active" : "Hidden"}</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          aria-label={`Delete ${item.name}`}
                          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-dim">Price:</span>
                        <InlineEdit
                          value={item.price}
                          type="number"
                          prefix="$"
                          onSave={(v) => updateItem(item.id, { price: Number(v) })}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-dim">Stock:</span>
                        <InlineEdit
                          value={item.stock}
                          type="number"
                          onSave={(v) => updateItem(item.id, { stock: Number(v) })}
                        />
                      </div>

                      <select
                        value={item.stockStatus}
                        onChange={(e) => updateItem(item.id, { stockStatus: e.target.value as StockStatus })}
                        className={`rounded-lg border px-2 py-1 text-xs font-semibold bg-transparent outline-none cursor-pointer ${stockStatusColor(item.stockStatus)}`}
                        aria-label="Stock status"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-[#0d0d0f] text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={item.category}
                        onChange={(e) => updateItem(item.id, { category: e.target.value as Category })}
                        className={`rounded-lg border px-2 py-1 text-xs font-semibold bg-transparent outline-none cursor-pointer ${catMeta.color}`}
                        aria-label="Category"
                      >
                        {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
                          <option key={c} value={c} className="bg-[#0d0d0f] text-white">
                            {CATEGORY_META[c].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <Tag className="h-3 w-3 shrink-0 text-slate-dim" aria-hidden />
                      <TagEditor
                        tags={item.tags}
                        onChange={(t) => updateItem(item.id, { tags: t })}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-dim">
              No items match your filter. <button type="button" onClick={() => { setSearch(""); setFilterCategory("all"); }} className="text-emerald-400 hover:underline">Clear filters</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
