import { useRef } from "react";

interface CategoryTabsProps {
  categories: string[];
  activeCategory: string | null;
  onSelect: (cat: string | null) => void;
}

export function CategoryTabs({ categories, activeCategory, onSelect }: CategoryTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    );
    const current = document.activeElement as HTMLButtonElement;
    const idx = tabs.indexOf(current);
    if (e.key === "ArrowRight" && idx < tabs.length - 1) {
      e.preventDefault();
      tabs[idx + 1].focus();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      tabs[idx - 1].focus();
    }
  };

  const tabBase =
    "snap-start whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const activeTab = "bg-primary text-primary-foreground";
  const inactiveTab = "bg-muted text-muted-foreground hover-elevate";

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Menu categories"
      className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-hide"
      onKeyDown={handleKeyDown}
    >
      <button
        role="tab"
        aria-selected={activeCategory === null}
        className={`${tabBase} ${activeCategory === null ? activeTab : inactiveTab}`}
        onClick={() => onSelect(null)}
        data-testid="tab-category-all"
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          role="tab"
          aria-selected={activeCategory === cat}
          className={`${tabBase} ${activeCategory === cat ? activeTab : inactiveTab}`}
          onClick={() => onSelect(cat)}
          data-testid={`tab-category-${cat}`}
        >
          {cat.charAt(0).toUpperCase() + cat.slice(1)}
        </button>
      ))}
    </div>
  );
}
