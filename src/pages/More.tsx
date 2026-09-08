import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, FileText, Settings, Wallet, ArrowUpRight, Layers, Lock, UtensilsCrossed,
  Truck, CreditCard
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const More: React.FC = () => {
  const { t, user } = useAuth();
  const navigate = useNavigate();

  const menuGroups = [
    {
      title: "Daily Operations & Customers",
      items: [
        { label: "दूध बांधी रजिस्टर (Daily Household Delivery)", icon: Truck, path: '/bandhi', color: 'text-amber-400 bg-amber-950/40 border-amber-900/30' },
        { label: "उधारी व बकाया खाता (Customer Dues & Ledger)", icon: CreditCard, path: '/udhari', color: 'text-rose-400 bg-rose-950/40 border-rose-900/30' },
        { label: "Product Menu & Barcode Scanner", icon: UtensilsCrossed, path: '/menu', color: 'text-teal-400 bg-teal-950/40 border-teal-900/30' },
        { label: t('farmers'), icon: Users, path: '/farmers', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/30' },
        { label: "Payments & Advances", icon: Wallet, path: '/payments', color: 'text-purple-400 bg-purple-950/40 border-purple-900/30' },
        { label: t('production'), icon: Layers, path: '/production', color: 'text-amber-400 bg-amber-950/40 border-amber-900/30' },
      ]
    },
    {
      title: "Finance & Reports",
      items: [
        { label: t('expenses'), icon: ArrowUpRight, path: '/more?section=expenses', color: 'text-rose-400 bg-rose-950/40 border-rose-900/30' },
        { label: t('galla'), icon: Wallet, path: '/galla', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/30' },
        { label: t('reports'), icon: FileText, path: '/more?section=reports', color: 'text-sky-400 bg-sky-950/40 border-sky-900/30' },
        { label: "Daily Closing & Excel", icon: Lock, path: '/closeday', color: 'text-indigo-400 bg-indigo-950/40 border-indigo-900/30' },
      ]
    },
    {
      title: "System settings",
      items: [
        { label: t('settings'), icon: Settings, path: '/more?section=settings', color: 'text-dark-300 bg-dark-900 border-dark-800' },
      ]
    }
  ];

  return (
    <div className="space-y-6">
      
      {/* Profile Overview Card */}
      <div className="bg-dark-900 border border-dark-800 rounded-3xl p-5 shadow-md flex items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 rounded-full blur-xl" />
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary-600 to-emerald-500 flex items-center justify-center font-bold text-white shadow-md text-lg">
          {user ? user.name[0].toUpperCase() : 'U'}
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">{user ? user.name : 'User'}</h3>
          <p className="text-[10px] text-dark-400 font-medium">Role: {user ? user.role : 'Staff'}</p>
          <p className="text-[10px] text-dark-500 font-medium">{user ? user.email : ''}</p>
        </div>
      </div>

      {/* Menu Groups */}
      <div className="space-y-5">
        {menuGroups.map((group, idx) => (
          <div key={idx} className="space-y-2">
            <h4 className="text-[10px] font-bold text-dark-500 uppercase tracking-widest px-1">
              {group.title}
            </h4>
            <div className="bg-dark-900 border border-dark-800 rounded-3xl overflow-hidden divide-y divide-dark-800/50 shadow-sm">
              {group.items.map((item, itemIdx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={itemIdx}
                    onClick={() => navigate(item.path)}
                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-dark-850 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl border ${item.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold text-dark-100">{item.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-dark-500" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* System info */}
      <div className="text-center space-y-1 py-4">
        <p className="text-[10px] text-dark-500 font-bold tracking-wider">DAIRY SMART AI SAAS V1.0.0</p>
        <p className="text-[9px] text-dark-600 font-medium">Krishna Dairy • Managed Isolated Tenant Node</p>
      </div>

    </div>
  );
};

// Simple Chevron for Group Navigation
const ChevronRight: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);
