import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';
import { NAV_SECTIONS } from './navConfig.js';

export default function SidebarNav({ currentPage, onNavigate }) {
  const { user, signOut } = useAuth();

  return (
    <aside className="w-56 xl:w-64 shrink-0 bg-slate-900 text-slate-200 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-slate-700">
        <p className="font-semibold text-white text-sm">PharmaOS Dashboard</p>
        <p className="text-xs text-slate-400 truncate mt-1">{user?.email}</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-2 mb-2">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active ? 'bg-white/10 text-white font-medium' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon size={16} className={active ? 'text-white' : 'text-slate-400'} />
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-700">
        <button type="button" onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white">
          <LogOut size={16} /> Déconnexion
        </button>
      </div>
    </aside>
  );
}
