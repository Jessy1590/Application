import React from 'react';
import SidebarNav from './SidebarNav.jsx';
import UrgentAlertsBar from './UrgentAlertsBar.jsx';

export default function AppLayout({ currentPage, onNavigate, children, showAlerts = true }) {
  return (
    <div className="flex min-h-screen bg-slate-100">
      <SidebarNav currentPage={currentPage} onNavigate={onNavigate} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 xl:p-8 max-w-[1600px]">
          {showAlerts && <UrgentAlertsBar onNavigate={onNavigate} />}
          {children}
        </div>
      </main>
    </div>
  );
}
