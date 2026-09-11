import React from 'react';

const GRID_COLS = {
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

export default function StatsCards({ cards, activeKey, onSelect }) {
  const gridClass = GRID_COLS[cards.length] || GRID_COLS[4];
  return (
    <div className={`grid gap-3 sm:gap-4 ${gridClass}`}>
      {cards.map((card) => {
        const Icon = card.icon;
        const active = activeKey === card.key;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelect?.(card.key)}
            className={`group relative h-full overflow-hidden rounded-lg bg-white p-3 text-left shadow transition-all duration-200 hover:shadow-lg dark:bg-gray-800 sm:p-4 ${
              active ? `ring-2 ${card.ringColor || 'ring-[var(--theme-primary)]'}` : ''
            }`}
          >
            <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">{card.label}</p>
            <p className="mt-2 text-2xl font-medium text-gray-900 dark:text-white sm:text-3xl">{card.value}</p>
            {card.sub && <p className="mt-0.5 text-xs text-gray-400">{card.sub}</p>}
            {Icon && <Icon className="absolute bottom-2 right-2 h-6 w-6 text-gray-400 transition-all duration-300 group-hover:scale-110" strokeWidth={2.5} />}
          </button>
        );
      })}
    </div>
  );
}
