import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Wrench, DollarSign, Bell, TrendingUp } from 'lucide-react';

interface Stats {
  totalClients: number;
  totalEquipment: number;
  upcomingVisits: number;
  monthlyRevenue: number;
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalClients: 0, totalEquipment: 0, upcomingVisits: 0, monthlyRevenue: 0
  });

  useEffect(() => {
    async function load() {
      const [
        { count: clients },
        { count: equipment },
        { count: visits },
        { data: transactions }
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('equipment').select('*', { count: 'exact', head: true }),
        supabase.from('service_visits').select('*', { count: 'exact', head: true })
          .gte('scheduled_date', new Date().toISOString().split('T')[0])
          .eq('status', 'scheduled'),
        supabase.from('financial_transactions')
          .select('amount, type')
          .eq('type', 'income')
          .gte('transaction_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
      ]);

      const revenue = (transactions || []).reduce((sum, t) => sum + Number(t.amount), 0);

      setStats({
        totalClients: clients || 0,
        totalEquipment: equipment || 0,
        upcomingVisits: visits || 0,
        monthlyRevenue: revenue
      });
    }
    load();
  }, []);

  const cards = [
    { label: 'Total Clients', value: stats.totalClients, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Equipment', value: stats.totalEquipment, icon: Wrench, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Upcoming Visits', value: stats.upcomingVisits, icon: Bell, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Revenue (MTD)', value: `₹${stats.monthlyRevenue.toLocaleString('en-IN')}`, icon: DollarSign, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-gray-400 mb-6">Welcome back to ServiCore</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">{label}</span>
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-lg text-left hover:bg-indigo-600/20 transition">
            <TrendingUp className="w-5 h-5 text-indigo-400 mb-2" />
            <p className="text-sm font-medium text-white">View Reports</p>
            <p className="text-xs text-gray-400 mt-1">Profit & Loss analysis</p>
          </button>
        </div>
      </div>
    </div>
  );
}
