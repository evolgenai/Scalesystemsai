"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  LayoutList,
  Layers,
  ShoppingCart,
  Star,
  Tag,
  X,
  ZoomIn,
  Wine,
  Sparkles,
  Shirt,
  Ticket,
  Package,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type Category = "all" | "wines" | "tastings" | "merch" | "passes";

type StockStatus = "in-stock" | "low-stock" | "out-of-stock" | "pre-order";

type CatalogItem = {
  id: string;
  name: string;
  description: string;
  category: Exclude<Category, "all">;
  price: number;
  originalPrice?: number;
  stock: number;
  stockStatus: StockStatus;
  rating: number;
  reviews: number;
  badge?: string;
  color: string;
  accent: string;
  emoji: string;
};

const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "w-001",
    name: "Château Noir Reserve 2019",
    description: "Deep ruby with notes of black cherry, leather, and aged oak. Full-bodied finish.",
    category: "wines",
    price: 189,
    originalPrice: 220,
    stock: 24,
    stockStatus: "in-stock",
    rating: 4.9,
    reviews: 143,
    badge: "Editor's Pick",
    color: "from-rose-950/80 to-slate-900/60",
    accent: "rose",
    emoji: "🍷",
  },
  {
    id: "w-002",
    name: "Blanc de Lune Chardonnay",
    description: "Crisp minerality with citrus and white peach. Beautifully balanced acidity.",
    category: "wines",
    price: 94,
    stock: 58,
    stockStatus: "in-stock",
    rating: 4.6,
    reviews: 87,
    color: "from-amber-950/80 to-slate-900/60",
    accent: "amber",
    emoji: "🥂",
  },
  {
    id: "w-003",
    name: "Nebbiolo Cru Selection",
    description: "Structured tannins, violet perfume, and exceptional aging potential.",
    category: "wines",
    price: 245,
    stock: 6,
    stockStatus: "low-stock",
    rating: 4.8,
    reviews: 62,
    badge: "Limited",
    color: "from-purple-950/80 to-slate-900/60",
    accent: "purple",
    emoji: "🍇",
  },
  {
    id: "t-001",
    name: "Barrel Room Experience",
    description: "Exclusive 2-hour guided tasting tour through our private barrel room. 6 pours.",
    category: "tastings",
    price: 120,
    stock: 12,
    stockStatus: "in-stock",
    rating: 5.0,
    reviews: 209,
    badge: "Best Seller",
    color: "from-blue-950/80 to-slate-900/60",
    accent: "sapphire",
    emoji: "🪣",
  },
  {
    id: "t-002",
    name: "Sommelier Masterclass",
    description: "3-hour intensive with resident sommelier. Blind tasting techniques & pairing mastery.",
    category: "tastings",
    price: 280,
    originalPrice: 350,
    stock: 4,
    stockStatus: "low-stock",
    rating: 4.9,
    reviews: 55,
    badge: "20% Off",
    color: "from-cyan-950/80 to-slate-900/60",
    accent: "cyan",
    emoji: "🎓",
  },
  {
    id: "t-003",
    name: "Vineyard Sunrise Tour",
    description: "Dawn walk through estate rows with light breakfast and 3 vintage pours.",
    category: "tastings",
    price: 85,
    stock: 0,
    stockStatus: "out-of-stock",
    rating: 4.7,
    reviews: 128,
    color: "from-orange-950/80 to-slate-900/60",
    accent: "orange",
    emoji: "🌅",
  },
  {
    id: "m-001",
    name: "Scale Systems Logo Tee",
    description: "Premium 100% Pima cotton. Obsidian black with embossed logo. Unisex fit.",
    category: "merch",
    price: 42,
    stock: 200,
    stockStatus: "in-stock",
    rating: 4.4,
    reviews: 312,
    color: "from-slate-800/80 to-slate-900/60",
    accent: "slate",
    emoji: "👕",
  },
  {
    id: "m-002",
    name: "Obsidian Decanter Set",
    description: "Hand-blown crystal decanter with 4 stemless glasses. Etched insignia.",
    category: "merch",
    price: 165,
    originalPrice: 195,
    stock: 31,
    stockStatus: "in-stock",
    rating: 4.8,
    reviews: 77,
    badge: "Gift Ready",
    color: "from-indigo-950/80 to-slate-900/60",
    accent: "indigo",
    emoji: "🫙",
  },
  {
    id: "p-001",
    name: "Founding Member Pass",
    description: "Annual access to all tastings, early bottle releases, priority booking, member lounge.",
    category: "passes",
    price: 599,
    stock: 50,
    stockStatus: "pre-order",
    rating: 5.0,
    reviews: 18,
    badge: "New",
    color: "from-yellow-950/80 to-slate-900/60",
    accent: "yellow",
    emoji: "🏆",
  },
  {
    id: "p-002",
    name: "Digital Cellar Pass",
    description: "12-month digital subscription. Monthly curated 3-bottle box + tasting notes PDF.",
    category: "passes",
    price: 199,
    originalPrice: 240,
    stock: 999,
    stockStatus: "in-stock",
    rating: 4.7,
    reviews: 94,
    badge: "Popular",
    color: "from-violet-950/80 to-slate-900/60",
    accent: "violet",
    emoji: "💎",
  },
];

const CATEGORIES: { id: Category; label: string; icon: React.ElementType; count: number }[] = [
  { id: "all", label: "All Items", icon: Package, count: CATALOG_ITEMS.length },
  { id: "wines", label: "Wines", icon: Wine, count: CATALOG_ITEMS.filter((i) => i.category === "wines").length },
  { id: "tastings", label: "Tastings", icon: Sparkles, count: CATALOG_ITEMS.filter((i) => i.category === "tastings").length },
  { id: "merch", label: "Merch", icon: Shirt, count: CATALOG_ITEMS.filter((i) => i.category === "merch").length },
  { id: "passes", label: "Passes", icon: Ticket, count: CATALOG_ITEMS.filter((i) => i.category === "passes").length },
];

type ViewMode = "grid" | "table" | "carousel";

function StockBadge({ status, stock }: { status: StockStatus; stock: number }) {
  if (status === "out-of-stock") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
        Out of Stock
      </span>
    );
  }
  if (status === "pre-order") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
        Pre-Order
      </span>
    );
  }
  if (status === "low-stock") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Only {stock} left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
      In Stock
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i < Math.floor(rating) ? "fill-amber-400 text-amber-400" : "text-slate-600"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

type DrawerItem = CatalogItem | null;

function QuickAddDrawer({ item, onClose }: { item: DrawerItem; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (item) {
      setQty(1);
      setAdded(false);
    }
  }, [item]);

  const handleAdd = () => {
    setAdded(true);
    setTimeout(onClose, 900);
  };

  return (
    <AnimatePresence>
      {item ? (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-white/10 bg-[#0d0d0f]/95 backdrop-blur-2xl shadow-2xl"
            aria-label="Quick add to cart"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <p className="text-sm font-semibold text-white">Quick Add</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-muted transition hover:bg-white/5 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className={`flex h-40 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} border border-white/5`}>
                <span className="text-7xl" role="img" aria-label={item.name}>
                  {item.emoji}
                </span>
              </div>

              <div>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-white leading-snug">{item.name}</h3>
                  <StockBadge status={item.stockStatus} stock={item.stock} />
                </div>
                <p className="mt-2 text-sm text-slate-muted leading-relaxed">{item.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <StarRating rating={item.rating} />
                <span className="text-xs text-slate-dim">{item.rating.toFixed(1)} · {item.reviews} reviews</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-display text-2xl font-bold text-white">${item.price}</span>
                {item.originalPrice ? (
                  <span className="text-sm text-slate-dim line-through">${item.originalPrice}</span>
                ) : null}
                {item.originalPrice ? (
                  <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-400">
                    Save ${item.originalPrice - item.price}
                  </span>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-dim">Quantity</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-muted transition hover:bg-white/5 hover:text-white"
                  >
                    –
                  </button>
                  <span className="w-8 text-center font-mono text-lg font-semibold text-white">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => q + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-muted transition hover:bg-white/5 hover:text-white"
                  >
                    +
                  </button>
                  <span className="ml-auto text-xs text-slate-dim">
                    Subtotal: <span className="font-mono text-white">${(item.price * qty).toLocaleString()}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/5 p-5">
              <button
                type="button"
                onClick={handleAdd}
                disabled={item.stockStatus === "out-of-stock"}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  added
                    ? "border border-blue-500/40 bg-blue-500/15 text-blue-400"
                    : item.stockStatus === "out-of-stock"
                      ? "cursor-not-allowed border border-white/5 bg-white/[0.03] text-slate-dim"
                      : "border border-blue-500/40 bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                }`}
              >
                <ShoppingCart className="h-4 w-4" aria-hidden />
                {added ? "Added to Cart ✓" : item.stockStatus === "out-of-stock" ? "Unavailable" : "Add to Cart"}
              </button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function GridCard({ item, onQuickAdd }: { item: CatalogItem; onQuickAdd: (item: CatalogItem) => void }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl transition hover:border-white/10 hover:bg-white/[0.05]"
    >
      {item.badge ? (
        <div className="absolute left-3 top-3 z-10">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <Tag className="h-2.5 w-2.5" aria-hidden />
            {item.badge}
          </span>
        </div>
      ) : null}

      <div className={`relative flex h-44 items-center justify-center bg-gradient-to-br ${item.color}`}>
        <span className="text-6xl transition-transform duration-300 group-hover:scale-110" role="img" aria-label={item.name}>
          {item.emoji}
        </span>
        <button
          type="button"
          onClick={() => onQuickAdd(item)}
          aria-label={`Preview ${item.name}`}
          className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/60 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:text-white"
        >
          <ZoomIn className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
            {item.category}
          </p>
          <h3 className="mt-0.5 font-display text-sm font-semibold leading-snug text-white line-clamp-2">
            {item.name}
          </h3>
        </div>

        <p className="text-xs text-slate-muted leading-relaxed line-clamp-2">{item.description}</p>

        <div className="flex items-center gap-2">
          <StarRating rating={item.rating} />
          <span className="text-[10px] text-slate-dim">{item.reviews}</span>
        </div>

        <StockBadge status={item.stockStatus} stock={item.stock} />

        <div className="mt-auto flex items-center justify-between gap-2">
          <div>
            <span className="font-display text-lg font-bold text-white">${item.price}</span>
            {item.originalPrice ? (
              <span className="ml-1.5 text-xs text-slate-dim line-through">${item.originalPrice}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onQuickAdd(item)}
            disabled={item.stockStatus === "out-of-stock"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              item.stockStatus === "out-of-stock"
                ? "cursor-not-allowed border border-white/5 bg-white/[0.02] text-slate-dim"
                : "border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
            }`}
          >
            <ShoppingCart className="h-3 w-3" aria-hidden />
            {item.stockStatus === "pre-order" ? "Pre-Order" : "Add"}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function TableRow({ item, onQuickAdd }: { item: CatalogItem; onQuickAdd: (item: CatalogItem) => void }) {
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      className="group border-b border-white/[0.04] transition hover:bg-white/[0.02]"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.color} text-2xl`}>
            {item.emoji}
          </div>
          <div>
            <p className="text-sm font-medium text-white leading-tight">{item.name}</p>
            <p className="text-[10px] text-slate-dim capitalize">{item.category}</p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <div className="flex items-center gap-1.5">
          <StarRating rating={item.rating} />
          <span className="text-xs text-slate-dim">{item.rating.toFixed(1)}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <StockBadge status={item.stockStatus} stock={item.stock} />
      </td>
      <td className="px-4 py-3 text-right">
        <div>
          <span className="font-mono text-sm font-semibold text-white">${item.price}</span>
          {item.originalPrice ? (
            <span className="ml-2 text-xs text-slate-dim line-through">${item.originalPrice}</span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => onQuickAdd(item)}
          disabled={item.stockStatus === "out-of-stock"}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            item.stockStatus === "out-of-stock"
              ? "cursor-not-allowed border border-white/5 text-slate-dim"
              : "border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
          }`}
        >
          <ShoppingCart className="h-3 w-3" aria-hidden />
          Add
        </button>
      </td>
    </motion.tr>
  );
}

function CarouselView({ items, onQuickAdd }: { items: CatalogItem[]; onQuickAdd: (item: CatalogItem) => void }) {
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const item = items[idx];

  const go = useCallback(
    (delta: number) => {
      setDir(delta);
      setIdx((i) => (i + delta + items.length) % items.length);
    },
    [items.length]
  );

  if (!item) return null;

  return (
    <div className="relative flex flex-col items-center gap-6 py-4">
      <div className="flex items-center gap-4 w-full max-w-lg">
        <button
          type="button"
          onClick={() => go(-1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-muted transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Previous"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>

        <div className="flex-1 overflow-hidden rounded-2xl">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={item.id}
              custom={dir}
              initial={{ opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -60 }}
              transition={{ duration: 0.28 }}
              className={`flex flex-col items-center gap-4 bg-gradient-to-br ${item.color} border border-white/5 rounded-2xl p-8`}
            >
              {item.badge ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs font-semibold text-white">
                  <Tag className="h-3 w-3" aria-hidden />
                  {item.badge}
                </span>
              ) : null}
              <span className="text-8xl" role="img" aria-label={item.name}>{item.emoji}</span>
              <div className="text-center space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{item.category}</p>
                <h3 className="font-display text-xl font-bold text-white">{item.name}</h3>
                <p className="text-sm text-white/60 leading-relaxed max-w-xs mx-auto">{item.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <StarRating rating={item.rating} />
                <span className="text-xs text-white/50">{item.reviews} reviews</span>
              </div>
              <StockBadge status={item.stockStatus} stock={item.stock} />
              <div className="flex items-center gap-4">
                <span className="font-display text-2xl font-bold text-white">${item.price}</span>
                {item.originalPrice ? (
                  <span className="text-sm text-white/40 line-through">${item.originalPrice}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onQuickAdd(item)}
                disabled={item.stockStatus === "out-of-stock"}
                className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition ${
                  item.stockStatus === "out-of-stock"
                    ? "cursor-not-allowed bg-white/10 text-white/30"
                    : "bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30"
                }`}
              >
                <ShoppingCart className="h-4 w-4" aria-hidden />
                {item.stockStatus === "pre-order" ? "Pre-Order" : "Quick Add"}
              </button>
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={() => go(1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-muted transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Next"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-1.5" role="tablist" aria-label="Carousel position">
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === idx}
            onClick={() => { setDir(i > idx ? 1 : -1); setIdx(i); }}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? "w-6 bg-blue-400" : "w-1.5 bg-white/20"
            }`}
            aria-label={`Go to item ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function ItemsCatalog() {
  const [category, setCategory] = useState<Category>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [drawerItem, setDrawerItem] = useState<DrawerItem>(null);

  const filtered = category === "all" ? CATALOG_ITEMS : CATALOG_ITEMS.filter((i) => i.category === category);

  return (
    <div className="space-y-6" style={{ backgroundColor: "#09090B" }}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400/80">
            Store · Catalog
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-white sm:text-2xl">
            Items Catalog
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Browse wines, experiences, merchandise, and digital passes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-white/5 bg-white/[0.03] p-0.5" role="group" aria-label="View mode">
            {(["grid", "table", "carousel"] as ViewMode[]).map((m) => {
              const Icon = m === "grid" ? Grid3x3 : m === "table" ? LayoutList : Layers;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  aria-pressed={viewMode === m}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                    viewMode === m
                      ? "bg-blue-500/15 text-blue-400"
                      : "text-slate-muted hover:text-white"
                  }`}
                  aria-label={`${m} view`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </button>
              );
            })}
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-dim">
            <TrendingUp className="h-3.5 w-3.5 text-blue-400" aria-hidden />
            {filtered.length} items
          </div>
        </div>
      </header>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Category filter"
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={category === cat.id}
              onClick={() => setCategory(cat.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                category === cat.id
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                  : "border-white/5 bg-white/[0.03] text-slate-muted hover:border-white/10 hover:text-white"
              }`}
            >
              <Hover3DIcon intensity={10}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </Hover3DIcon>
              {cat.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${category === cat.id ? "bg-blue-500/20 text-blue-400" : "bg-white/[0.05] text-slate-dim"}`}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {viewMode === "grid" ? (
        <motion.div
          layout
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((item) => (
              <GridCard key={item.id} item={item} onQuickAdd={setDrawerItem} />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : viewMode === "table" ? (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl">
          <table className="w-full" aria-label="Items catalog table">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-dim">Item</th>
                <th className="hidden px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-dim md:table-cell">Rating</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-dim">Stock</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-dim">Price</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-dim">Action</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.map((item) => (
                  <TableRow key={item.id} item={item} onQuickAdd={setDrawerItem} />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl p-4">
          <CarouselView items={filtered} onQuickAdd={setDrawerItem} />
        </div>
      )}

      <QuickAddDrawer item={drawerItem} onClose={() => setDrawerItem(null)} />
    </div>
  );
}
